package com.dharun.dconnect

import android.app.Activity
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.WindowManager
import androidx.core.app.NotificationCompat

// Screen mirroring: MediaProjection -> virtual display -> hardware H.264 encoder. Each encoded
// buffer goes to Dart (and from there onto the socket); the PC decodes it with WebCodecs.
class MirrorService : Service() {
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var codec: MediaCodec? = null
    @Volatile private var running = false
    private var started = false
    @Volatile private var lastConfig: ByteArray? = null
    private var drain: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val stop = PendingIntent.getBroadcast(this, 7, Intent(this, ActionReceiver::class.java).setAction(ActionReceiver.STOP_MIRROR), PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(this, Notifs.ALERT)
            .setSmallIcon(android.R.drawable.ic_menu_slideshow)
            .setContentTitle("Showing this screen on your PC")
            .setOngoing(true)
            .addAction(0, "Stop", stop)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(Notifs.MIRROR_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(Notifs.MIRROR_ID, n)

        val code = intent?.getIntExtra("resultCode", Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
        @Suppress("DEPRECATION")
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra("data", Intent::class.java) else intent?.getParcelableExtra("data")
        val opts = intent?.getBundleExtra("opts") ?: Bundle()
        if (data == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            start(code, data, opts)
        } catch (e: Exception) {
            Bridge.emit("mirror.error", mapOf("message" to (e.message ?: "encoder failed")))
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun start(code: Int, data: Intent, opts: Bundle) {
        instance = this
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val proj = mpm.getMediaProjection(code, data) ?: throw IllegalStateException("screen capture unavailable")
        projection = proj
        proj.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() = stopSelf()
        }, Handler(Looper.getMainLooper()))

        // size: the real screen scaled to maxSize on the long side, multiples of 16
        val wm = getSystemService(WindowManager::class.java)
        val (sw, sh) = if (Build.VERSION.SDK_INT >= 30) wm.maximumWindowMetrics.bounds.let { it.width() to it.height() }
        else { val m = android.util.DisplayMetrics(); @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(m); m.widthPixels to m.heightPixels }
        val maxSize = opts.getInt("maxSize", 1600)
        val fps = opts.getInt("fps", 60)
        val bitrate = opts.getInt("bitrate", 8_000_000)

        // Encoders differ (Qualcomm rejects some optional keys with EINVAL): try the tuned
        // format first, then plainer ones, then smaller sizes, like scrcpy does.
        var c: MediaCodec? = null
        var w = 0
        var h = 0
        var lastError: Exception? = null
        loop@ for (size in listOf(maxSize, 1280, 1024)) {
            val scale = minOf(1f, size.toFloat() / maxOf(sw, sh))
            w = ((sw * scale).toInt() / 16) * 16
            h = ((sh * scale).toInt() / 16) * 16
            for (tuned in listOf(true, false)) {
                val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
                    setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                    setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
                    setInteger(MediaFormat.KEY_FRAME_RATE, fps)
                    setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
                    setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000) // still screen: keep frames coming
                    if (tuned) {
                        setInteger(MediaFormat.KEY_PRIORITY, 0) // realtime
                        if (Build.VERSION.SDK_INT >= 30) setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
                    }
                }
                val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
                try {
                    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                    c = codec
                    break@loop
                } catch (e: Exception) {
                    lastError = e
                    codec.release()
                }
            }
        }
        val enc = c ?: throw IllegalStateException("This phone's video encoder refused every format (${lastError?.message})")
        val surface = enc.createInputSurface()
        enc.start()
        codec = enc
        display = proj.createVirtualDisplay("D-Connect", w, h, resources.displayMetrics.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, surface, null, null)
        running = true
        started = true
        Bridge.emit("mirror.started", mapOf("width" to w, "height" to h, "control" to (ControlService.instance != null)))
        drain = Thread({ drainLoop(enc) }, "dc-encoder").apply { start() }
    }

    private fun drainLoop(c: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        while (running) {
            val idx = try { c.dequeueOutputBuffer(info, 20_000) } catch (e: Exception) { break }
            if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                // Qualcomm and others put SPS/PPS here (csd-0/csd-1) instead of a config buffer
                val f = c.outputFormat
                val parts = listOfNotNull(f.getByteBuffer("csd-0"), f.getByteBuffer("csd-1")).map { b -> ByteArray(b.remaining()).also { b.get(it) } }
                if (parts.isNotEmpty()) {
                    lastConfig = parts.reduce { a, b -> a + b }
                    Bridge.frame(lastConfig!!, true, false, 0)
                }
                continue
            }
            if (idx < 0) continue
            val buf = c.getOutputBuffer(idx)
            if (buf != null && info.size > 0) {
                val bytes = ByteArray(info.size)
                buf.position(info.offset)
                buf.get(bytes, 0, info.size)
                val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                val key = info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0
                if (config) lastConfig = bytes
                Bridge.frame(bytes, config, key, info.presentationTimeUs)
            }
            c.releaseOutputBuffer(idx, false)
        }
    }

    fun requestKeyframe() {
        // the PC may have missed the stream headers (page opened late, decoder reset)
        lastConfig?.let { Bridge.frame(it, true, false, 0) }
        codec?.setParameters(Bundle().apply { putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0) })
    }

    override fun onDestroy() {
        running = false
        try { drain?.join(300) } catch (_: Exception) {}
        try { display?.release() } catch (_: Exception) {}
        try { codec?.stop(); codec?.release() } catch (_: Exception) {}
        try { projection?.stop() } catch (_: Exception) {}
        if (instance === this) instance = null
        if (started) Bridge.emit("mirror.stopped", null)
        super.onDestroy()
    }

    companion object {
        var instance: MirrorService? = null
        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, MirrorService::class.java))
        }
    }
}
