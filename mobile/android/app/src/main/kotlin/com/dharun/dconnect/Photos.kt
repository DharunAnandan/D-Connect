package com.dharun.dconnect

import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import android.util.Size
import java.io.ByteArrayOutputStream
import java.io.File

object Photos {
    // Photos and videos together (MediaStore "files"), newest first; [kind] is "all", "photos"
    // or "videos", [bucket] an album id (null = everything).
    private val FILES = MediaStore.Files.getContentUri("external")
    private const val T = MediaStore.Files.FileColumns.MEDIA_TYPE
    private val IMG = MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE
    private val VID = MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO

    private fun where(kind: String?, bucket: String?): Pair<String, Array<String>> {
        val types = when (kind) { "photos" -> "$T=$IMG"; "videos" -> "$T=$VID"; else -> "$T IN ($IMG,$VID)" }
        return if (bucket.isNullOrEmpty()) types to emptyArray() else "$types AND ${MediaStore.MediaColumns.BUCKET_ID}=?" to arrayOf(bucket)
    }

    private fun thumb(ctx: Context, id: Long, video: Boolean, px: Int = 320): String = try {
        val uri = ContentUris.withAppendedId(if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
        val bmp: Bitmap? = if (Build.VERSION.SDK_INT >= 29) ctx.contentResolver.loadThumbnail(uri, Size(px, px), null)
        else if (video) @Suppress("DEPRECATION") MediaStore.Video.Thumbnails.getThumbnail(ctx.contentResolver, id, MediaStore.Video.Thumbnails.MINI_KIND, null)
        else @Suppress("DEPRECATION") MediaStore.Images.Thumbnails.getThumbnail(ctx.contentResolver, id, MediaStore.Images.Thumbnails.MINI_KIND, null)
        val o = ByteArrayOutputStream()
        bmp?.compress(Bitmap.CompressFormat.JPEG, 72, o)
        Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) { "" }

    fun list(ctx: Context, offset: Int, limit: Int, kind: String? = null, bucket: String? = null): List<Map<String, Any?>> {
        val out = mutableListOf<Map<String, Any?>>()
        val cols = arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.DATE_TAKEN, MediaStore.MediaColumns.DATE_ADDED, MediaStore.MediaColumns.WIDTH, MediaStore.MediaColumns.HEIGHT, MediaStore.MediaColumns.SIZE, T, MediaStore.MediaColumns.DURATION)
        val (sel, args) = where(kind, bucket)
        ctx.contentResolver.query(FILES, cols, sel, args, "${MediaStore.MediaColumns.DATE_ADDED} DESC")?.use { c ->
            if (!c.moveToPosition(offset)) return out
            do {
                val id = c.getLong(0)
                val video = c.getInt(7) == VID
                val date = c.getLong(2).takeIf { it > 0 } ?: (c.getLong(3) * 1000)
                out.add(mapOf("id" to id.toString(), "name" to (c.getString(1) ?: if (video) "video.mp4" else "photo.jpg"), "date" to date, "w" to c.getInt(4), "h" to c.getInt(5), "size" to c.getLong(6),
                    "video" to video, "duration" to if (video) c.getLong(8) else null, "thumb" to thumb(ctx, id, video)))
            } while (c.moveToNext() && out.size < limit)
        }
        return out
    }

    // albums (folders): Camera, Screenshots, WhatsApp Images... with a count and a cover
    fun albums(ctx: Context, kind: String? = null): List<Map<String, Any?>> {
        data class A(val id: String, var name: String, var count: Int, val coverId: Long, val coverVideo: Boolean, var videos: Int)
        val map = LinkedHashMap<String, A>()
        val cols = arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.BUCKET_ID, MediaStore.MediaColumns.BUCKET_DISPLAY_NAME, T)
        val (sel, args) = where(kind, null)
        ctx.contentResolver.query(FILES, cols, sel, args, "${MediaStore.MediaColumns.DATE_ADDED} DESC")?.use { c ->
            while (c.moveToNext()) {
                val b = c.getString(1) ?: continue
                val video = c.getInt(3) == VID
                val a = map.getOrPut(b) { A(b, c.getString(2) ?: "Other", 0, c.getLong(0), video, 0) }
                a.count++
                if (video) a.videos++
            }
        }
        return map.values.sortedByDescending { it.count }.map { a ->
            mapOf("id" to a.id, "name" to a.name, "count" to a.count, "videos" to a.videos, "thumb" to thumb(ctx, a.coverId, a.coverVideo, 200))
        }
    }

    fun file(ctx: Context, id: String): Map<String, String>? {
        val uri = ContentUris.withAppendedId(FILES, id.toLong())
        var name = "media-$id"
        ctx.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) name = c.getString(0) ?: name }
        val f = File(File(ctx.cacheDir, "photos").apply { mkdirs() }, name)
        ctx.contentResolver.openInputStream(uri)?.use { i -> f.outputStream().use { i.copyTo(it) } } ?: return null
        return mapOf("path" to f.absolutePath, "name" to name)
    }
}

object AppsList {
    fun list(ctx: Context): List<Map<String, Any?>> {
        val pm = ctx.packageManager
        val intent = android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_LAUNCHER)
        val seen = HashSet<String>()
        return pm.queryIntentActivities(intent, 0).mapNotNull { ri ->
            val pkg = ri.activityInfo.packageName
            if (pkg == ctx.packageName || !seen.add(pkg)) return@mapNotNull null
            val icon = try {
                val d = ri.loadIcon(pm)
                val b = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
                d.setBounds(0, 0, 96, 96)
                d.draw(android.graphics.Canvas(b))
                val o = ByteArrayOutputStream()
                b.compress(Bitmap.CompressFormat.PNG, 100, o)
                Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP)
            } catch (e: Exception) { null }
            mapOf("pkg" to pkg, "label" to ri.loadLabel(pm).toString(), "icon" to icon)
        }.sortedBy { (it["label"] as String).lowercase() }
    }
}
