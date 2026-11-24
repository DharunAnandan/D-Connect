package com.dharun.dconnect

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper

// "Find my phone": the alarm stream at full volume (rings through silent and DND), vibrating,
// until "Found it" or 30 seconds.
object FindPhone {
    private var player: MediaPlayer? = null
    private var savedVolume = -1
    private val main = Handler(Looper.getMainLooper())

    fun start(ctx: Context) {
        stop()
        val am = ctx.getSystemService(AudioManager::class.java)
        savedVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
        am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        player = MediaPlayer().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            setDataSource(ctx, uri)
            isLooping = true
            prepare()
            start()
        }
        Haptics.vibrate(ctx, longArrayOf(0, 600, 400), 0)
        ctx.getSystemService(NotificationManager::class.java).notify(Notifs.FIND_ID, Notifs.find(ctx))
        main.postDelayed({ stop() }, 30_000)
    }

    fun stop() {
        main.removeCallbacksAndMessages(null)
        player?.let { try { it.stop(); it.release() } catch (_: Exception) {} }
        player = null
        if (!Bridge.isReady()) return
        val ctx = Bridge.ctx
        Haptics.stop(ctx)
        if (savedVolume >= 0) ctx.getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_ALARM, savedVolume, 0)
        savedVolume = -1
        Notifs.cancel(ctx, Notifs.FIND_ID)
    }
}
