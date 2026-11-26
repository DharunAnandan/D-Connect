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

// The D-Connect quick-settings tile: an on/off switch. On (lit) = linked to the PC. Tap while
// on: disconnect from everything and stay off. Tap while off: open D-Connect and connect.
// (Class name kept: Android identifies a tile already added to the panel by it.)
class ClipTile : TileService() {
    private fun prefs() = getSharedPreferences("FlutterSharedPreferences", MODE_PRIVATE)

    override fun onStartListening() {
        super.onStartListening()
        val t = qsTile ?: return
        t.state = if (KeepAliveService.linked) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        t.label = "D-Connect"
        t.icon = android.graphics.drawable.Icon.createWithResource(this, R.drawable.ic_tile_clip) // not a cached old one
        if (Build.VERSION.SDK_INT >= 29) t.subtitle = null
        t.updateTile()
    }

    override fun onClick() {
        super.onClick()
        if (KeepAliveService.linked) {
            // on -> off: disconnect everything
            prefs().edit().putBoolean("flutter.offline", true).apply()
            Bridge.emit("link.toggle", "off")
            KeepAliveService.linked = false
            Toast.makeText(this, "D-Connect is off", Toast.LENGTH_SHORT).show()
        } else {
            // off -> on: open the app and look for the PC
            prefs().edit().putBoolean("flutter.offline", false).apply()
            Bridge.emit("link.toggle", "on")
            val i = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(PendingIntent.getActivity(this, 8, i, PendingIntent.FLAG_IMMUTABLE))
            else @Suppress("DEPRECATION") startActivityAndCollapse(i)
        }
        qsTile?.let {
            it.state = if (KeepAliveService.linked) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            it.updateTile()
        }
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
