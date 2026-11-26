package com.dharun.dconnect

import android.app.Activity
import android.app.PendingIntent
import android.content.ClipboardManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

// A quick-settings tile ("Clipboard → PC"): shows whether D-Connect is linked; a tap sends what's
// copied on the phone to the PC. Android only lets the app in front read the clipboard, so the
// tap opens an invisible screen for a moment that reads it and closes.
class ClipTile : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        val t = qsTile ?: return
        val linked = KeepAliveService.linked
        t.state = if (linked) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        t.label = "D-Connect"
        t.icon = android.graphics.drawable.Icon.createWithResource(this, R.drawable.ic_tile_clip) // not the cached old one
        if (Build.VERSION.SDK_INT >= 29) t.subtitle = null // just "D-Connect" (on = linked)
        t.updateTile()
    }

    override fun onClick() {
        super.onClick()
        if (!KeepAliveService.linked) {
            Toast.makeText(this, "D-Connect isn't linked to your PC", Toast.LENGTH_SHORT).show()
            return
        }
        val i = Intent(this, ClipSendActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(PendingIntent.getActivity(this, 7, i, PendingIntent.FLAG_IMMUTABLE))
        else @Suppress("DEPRECATION") startActivityAndCollapse(i)
    }
}

class ClipSendActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (!hasFocus) return
        val text = try {
            getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()
        } catch (_: Exception) { null }
        if (text.isNullOrBlank()) Toast.makeText(this, "Nothing copied", Toast.LENGTH_SHORT).show()
        else {
            Bridge.emit("clip.tile", text)
            Toast.makeText(this, "Sent to your PC", Toast.LENGTH_SHORT).show()
        }
        finish()
        overridePendingTransition(0, 0)
    }
}

// After D-Connect is updated, start it again by itself (the app starts its PC link when its
// process starts), so it reconnects without being opened.
class UpdatedReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(context: android.content.Context, intent: Intent) {
        // nothing else to do: DConnectApp has already started the engine and the link
    }
}
