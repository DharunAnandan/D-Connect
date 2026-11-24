package com.dharun.dconnect

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper

// What's playing on the phone (any app with a media session), for the PC to show and control.
object MediaSessions {
    private var watched: MediaController? = null
    private val cb = object : MediaController.Callback() {
        override fun onPlaybackStateChanged(state: PlaybackState?) = push()
        override fun onMetadataChanged(metadata: MediaMetadata?) = push()
    }

    private fun mgr(ctx: Context) = ctx.getSystemService(MediaSessionManager::class.java)
    private fun component(ctx: Context) = ComponentName(ctx, NotifListener::class.java)

    private fun active(ctx: Context): MediaController? = try {
        val list = mgr(ctx).getActiveSessions(component(ctx))
        list.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: list.firstOrNull()
    } catch (e: SecurityException) { null }

    fun watch(ctx: Context) {
        try {
            mgr(ctx).addOnActiveSessionsChangedListener({ rewatch(ctx) }, component(ctx), Handler(Looper.getMainLooper()))
        } catch (_: SecurityException) {}
        rewatch(ctx)
    }

    private fun rewatch(ctx: Context) {
        watched?.unregisterCallback(cb)
        watched = active(ctx)
        watched?.registerCallback(cb, Handler(Looper.getMainLooper()))
        push()
    }

    private fun push() = Bridge.emit("media.phone.state", state(Bridge.ctx))

    fun state(ctx: Context): Map<String, Any?> {
        val c = watched ?: active(ctx) ?: return emptyMap()
        val md = c.metadata ?: return emptyMap()
        val app = try { ctx.packageManager.getApplicationLabel(ctx.packageManager.getApplicationInfo(c.packageName, 0)).toString() } catch (e: Exception) { c.packageName }
        return mapOf(
            "id" to c.packageName,
            "app" to app,
            "title" to (md.getString(MediaMetadata.METADATA_KEY_TITLE) ?: ""),
            "artist" to (md.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: md.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)),
            "album" to md.getString(MediaMetadata.METADATA_KEY_ALBUM),
            "playing" to (c.playbackState?.state == PlaybackState.STATE_PLAYING),
            "position" to ((c.playbackState?.position ?: 0) / 1000.0),
            "length" to (md.getLong(MediaMetadata.METADATA_KEY_DURATION) / 1000.0)
        )
    }

    fun command(ctx: Context, cmd: String) {
        val c = watched ?: active(ctx) ?: return
        val t = c.transportControls
        when (cmd) {
            "play" -> t.play()
            "pause" -> t.pause()
            "toggle" -> if (c.playbackState?.state == PlaybackState.STATE_PLAYING) t.pause() else t.play()
            "next" -> t.skipToNext()
            "prev" -> t.skipToPrevious()
            "volup" -> c.adjustVolume(android.media.AudioManager.ADJUST_RAISE, 0)
            "voldown" -> c.adjustVolume(android.media.AudioManager.ADJUST_LOWER, 0)
        }
    }
}
