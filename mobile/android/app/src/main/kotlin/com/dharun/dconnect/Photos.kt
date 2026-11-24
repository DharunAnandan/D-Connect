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
    fun list(ctx: Context, offset: Int, limit: Int): List<Map<String, Any?>> {
        val out = mutableListOf<Map<String, Any?>>()
        val cols = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.DATE_TAKEN, MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media.WIDTH, MediaStore.Images.Media.HEIGHT, MediaStore.Images.Media.SIZE)
        ctx.contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cols, null, null, "${MediaStore.Images.Media.DATE_ADDED} DESC")?.use { c ->
            if (!c.moveToPosition(offset)) return out
            do {
                val id = c.getLong(0)
                val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                val thumb = try {
                    val bmp: Bitmap? = if (Build.VERSION.SDK_INT >= 29) ctx.contentResolver.loadThumbnail(uri, Size(320, 320), null)
                    else @Suppress("DEPRECATION") MediaStore.Images.Thumbnails.getThumbnail(ctx.contentResolver, id, MediaStore.Images.Thumbnails.MINI_KIND, null)
                    val o = ByteArrayOutputStream()
                    bmp?.compress(Bitmap.CompressFormat.JPEG, 72, o)
                    Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP)
                } catch (e: Exception) { "" }
                val date = c.getLong(2).takeIf { it > 0 } ?: (c.getLong(3) * 1000)
                out.add(mapOf("id" to id.toString(), "name" to (c.getString(1) ?: "photo.jpg"), "date" to date, "w" to c.getInt(4), "h" to c.getInt(5), "size" to c.getLong(6), "thumb" to thumb))
            } while (c.moveToNext() && out.size < limit)
        }
        return out
    }

    fun file(ctx: Context, id: String): Map<String, String>? {
        val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id.toLong())
        var name = "photo-$id.jpg"
        ctx.contentResolver.query(uri, arrayOf(MediaStore.Images.Media.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) name = c.getString(0) ?: name }
        val f = File(File(ctx.cacheDir, "photos").apply { mkdirs() }, name)
        ctx.contentResolver.openInputStream(uri)?.use { i -> f.outputStream().use { i.copyTo(it) } } ?: return null
        return mapOf("path" to f.absolutePath, "name" to name)
    }
}
