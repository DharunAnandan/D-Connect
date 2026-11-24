package com.dharun.dconnect

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.FlutterEngineCache
import java.io.File

class MainActivity : FlutterActivity() {
    override fun provideFlutterEngine(context: Context): FlutterEngine? = FlutterEngineCache.getInstance().get(DConnectApp.ENGINE)
    override fun shouldDestroyEngineWithHost(): Boolean = false
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        // plugins were registered once, in DConnectApp
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        current = this
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onResume() {
        super.onResume()
        current = this
        resumed = true
    }

    override fun onPause() {
        super.onPause()
        resumed = false
    }

    override fun onDestroy() {
        if (current === this) current = null
        super.onDestroy()
    }

    private fun handle(i: Intent?) {
        when (i?.action) {
            Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE -> shareIn(i)
            Intent.ACTION_VIEW -> if (i.data?.scheme == "dconnect") Bridge.emit("pairLink", i.dataString)
            ACTION_REQUEST_MIRROR -> requestMirror(i.getBundleExtra("opts") ?: Bundle())
            ACTION_EYEBREAK -> {} // Dart already shows the break route
        }
    }

    // Shared from another app: copy each item to the cache so Dart can stream it to the PC.
    private fun shareIn(i: Intent) {
        Thread {
            val uris = mutableListOf<Uri>()
            if (i.action == Intent.ACTION_SEND) {
                @Suppress("DEPRECATION")
                (if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM))?.let { uris.add(it) }
            } else {
                @Suppress("DEPRECATION")
                (if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableArrayListExtra(Intent.EXTRA_STREAM))?.let { uris.addAll(it) }
            }
            val files = uris.mapNotNull { copyToCache(it) }
            val text = i.getStringExtra(Intent.EXTRA_TEXT)
            Bridge.emit("share", mapOf("files" to files, "text" to text))
        }.start()
    }

    private fun copyToCache(uri: Uri): Map<String, String>? = try {
        var name = "shared"
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) name = c.getString(0) ?: name }
        val dir = File(cacheDir, "share").apply { mkdirs() }
        val f = File(dir, "${System.currentTimeMillis()}-$name")
        contentResolver.openInputStream(uri)?.use { input -> f.outputStream().use { input.copyTo(it) } }
        mapOf("path" to f.absolutePath, "name" to name)
    } catch (e: Exception) {
        null
    }

    // ---------------------------------------------------------------- screen sharing consent
    fun requestMirror(opts: Bundle) {
        pendingMirrorOpts = opts
        val mpm = getSystemService(MediaProjectionManager::class.java)
        @Suppress("DEPRECATION")
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_MIRROR)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_MIRROR) return
        if (resultCode != Activity.RESULT_OK || data == null) {
            Bridge.emit("mirror.denied", mapOf("message" to "Screen sharing was declined"))
            return
        }
        val svc = Intent(this, MirrorService::class.java).apply {
            putExtra("resultCode", resultCode)
            putExtra("data", data)
            putExtra("opts", pendingMirrorOpts)
        }
        startForegroundService(svc)
        moveTaskToBack(true) // show the phone's screen, not D-Connect, on the PC
    }

    companion object {
        const val REQ_MIRROR = 4711
        const val ACTION_REQUEST_MIRROR = "com.dharun.dconnect.REQUEST_MIRROR"
        const val ACTION_EYEBREAK = "com.dharun.dconnect.EYEBREAK"
        var current: MainActivity? = null
        var resumed = false
        var pendingMirrorOpts: Bundle = Bundle()
    }
}
