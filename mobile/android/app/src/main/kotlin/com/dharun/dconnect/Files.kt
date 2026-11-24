package com.dharun.dconnect

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File

object Files {
    // A file from the PC: into Downloads/D-Connect, visible to every app.
    fun saveDownload(ctx: Context, path: String, name: String): String? {
        val src = File(path)
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream"
        val uri: Uri? = if (Build.VERSION.SDK_INT >= 29) {
            val v = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/D-Connect")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val u = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: return null
            ctx.contentResolver.openOutputStream(u)?.use { out -> src.inputStream().use { it.copyTo(out) } }
            v.clear()
            v.put(MediaStore.Downloads.IS_PENDING, 0)
            ctx.contentResolver.update(u, v, null, null)
            u
        } else {
            @Suppress("DEPRECATION")
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "D-Connect").apply { mkdirs() }
            val dst = File(dir, name)
            src.copyTo(dst, overwrite = true)
            FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", src)
        }
        src.delete()
        return uri?.toString()
    }

    fun open(ctx: Context, uri: String) {
        val u = Uri.parse(uri)
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(u, ctx.contentResolver.getType(u)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try { ctx.startActivity(i) } catch (_: Exception) {}
    }
}
