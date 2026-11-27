package com.dharun.dconnect

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.core.app.NotificationCompat

object Notifs {
    const val LINK = "link"
    const val EYE = "eye"
    const val ALERT = "alert"
    const val KEEP_ID = 1
    const val EYE_ID = 2
    const val MIRROR_ID = 3
    const val FIND_ID = 4
    const val ASK_ID = 5

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(LINK, "Connection", NotificationManager.IMPORTANCE_MIN).apply { description = "Shows while your phone is linked to a PC"; setShowBadge(false) })
        nm.createNotificationChannel(NotificationChannel(EYE, "Eye breaks", NotificationManager.IMPORTANCE_HIGH).apply { description = "20-20-20 breaks, in sync with your PC"; enableVibration(true) })
        nm.createNotificationChannel(NotificationChannel(ALERT, "From your PC", NotificationManager.IMPORTANCE_HIGH).apply { description = "Links, find my phone, screen sharing requests" })
    }

    private fun openApp(ctx: Context, action: String? = null, extras: Bundle? = null, req: Int = 0): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java).apply {
            this.action = action
            extras?.let { putExtras(it) }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    fun keepAlive(ctx: Context, pc: String?): Notification = NotificationCompat.Builder(ctx, LINK)
        .setSmallIcon(R.drawable.ic_tile_clip) // the D-Connect mark in the status bar
        .setContentTitle(if (pc != null) "Linked to $pc" else "D-Connect")
        .setContentText("Notifications, messages and calls are reaching your PC")
        .setOngoing(true)
        .setContentIntent(openApp(ctx))
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .build()

    fun eyeBreak(ctx: Context, seconds: Int) {
        val pi = openApp(ctx, MainActivity.ACTION_EYEBREAK, req = 2)
        val n = NotificationCompat.Builder(ctx, EYE)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("Eye break · $seconds seconds")
            .setContentText("Look at something 20 feet away. Your PC is resting too.")
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi)
            .setFullScreenIntent(pi, true)
            .setTimeoutAfter((seconds + 10) * 1000L)
            .setAutoCancel(true)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(EYE_ID, n)
    }

    // an alert from the PC (e.g. its battery is low), as a normal phone notification
    fun pcAlert(ctx: Context, title: String, body: String, tag: String) {
        val n = NotificationCompat.Builder(ctx, ALERT)
            .setSmallIcon(android.R.drawable.ic_lock_idle_low_battery)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(openApp(ctx, req = 40))
            .setAutoCancel(true)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(1000 + (tag.hashCode() and 0xfff), n)
    }

    fun link(ctx: Context, uri: String) {
        val pi = PendingIntent.getActivity(ctx, uri.hashCode(), Intent(Intent.ACTION_VIEW, Uri.parse(uri)), PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, ALERT)
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setContentTitle("Link from your PC")
            .setContentText(uri)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(uri.hashCode(), n)
    }

    fun mirrorRequest(ctx: Context, opts: Bundle) {
        val n = NotificationCompat.Builder(ctx, ALERT)
            .setSmallIcon(android.R.drawable.ic_menu_slideshow)
            .setContentTitle("Your PC wants to show this screen")
            .setContentText("Tap to allow screen sharing")
            .setContentIntent(openApp(ctx, MainActivity.ACTION_REQUEST_MIRROR, Bundle().apply { putBundle("opts", opts) }, 3))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(ASK_ID, n)
    }

    fun find(ctx: Context): Notification {
        val stop = PendingIntent.getBroadcast(ctx, 9, Intent(ctx, ActionReceiver::class.java).setAction(ActionReceiver.STOP_FIND), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(ctx, ALERT)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Here I am!")
            .setContentText("Your PC is looking for this phone")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .addAction(0, "Found it", stop)
            .setDeleteIntent(stop)
            .setFullScreenIntent(openApp(ctx, req = 4), true)
            .build()
    }

    fun cancel(ctx: Context, id: Int) = ctx.getSystemService(NotificationManager::class.java).cancel(id)
}
