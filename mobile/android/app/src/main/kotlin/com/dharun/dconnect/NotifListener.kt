package com.dharun.dconnect

import android.app.Notification
import android.app.RemoteInput
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import java.io.ByteArrayOutputStream

// Mirrors the phone's notifications to the PC; dismiss, reply and actions come back.
class NotifListener : NotificationListenerService() {
    override fun onListenerConnected() {
        instance = this
        MediaSessions.watch(this)
    }

    override fun onListenerDisconnected() {
        if (instance === this) instance = null
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val m = toMap(sbn) ?: return
        Bridge.emit("notif.posted", m)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        Bridge.emit("notif.removed", mapOf("key" to sbn.key))
    }

    private fun toMap(sbn: StatusBarNotification): Map<String, Any?>? {
        val n = sbn.notification
        if (sbn.packageName == packageName) return null
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return null
        if (sbn.isOngoing && n.category != Notification.CATEGORY_CALL) return null
        val ex = n.extras
        val title = ex.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = (ex.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: ex.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
        if (title.isBlank() && text.isBlank()) return null
        val actions = n.actions ?: emptyArray()
        val canReply = actions.any { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true }
        return mapOf(
            "key" to sbn.key,
            "pkg" to sbn.packageName,
            "app" to appLabel(sbn.packageName),
            "title" to title,
            "text" to text,
            "time" to sbn.postTime,
            "icon" to appIcon(sbn.packageName),
            "canReply" to canReply,
            "actions" to actions.filter { it.remoteInputs.isNullOrEmpty() }.map { it.title.toString() }.take(3)
        )
    }

    private fun appLabel(pkg: String): String = labels.getOrPut(pkg) {
        try { packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString() } catch (e: Exception) { pkg }
    }

    private fun appIcon(pkg: String): String? = icons.getOrPut(pkg) {
        try {
            val d = packageManager.getApplicationIcon(pkg)
            val b = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)
            d.setBounds(0, 0, 64, 64)
            d.draw(Canvas(b))
            val out = ByteArrayOutputStream()
            b.compress(Bitmap.CompressFormat.PNG, 100, out)
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } catch (e: Exception) { "" }
    }.ifEmpty { null }

    companion object {
        var instance: NotifListener? = null
        private val labels = HashMap<String, String>()
        private val icons = HashMap<String, String>()

        fun current(): List<Map<String, Any?>> {
            val l = instance ?: return emptyList()
            return try { l.activeNotifications.mapNotNull { l.toMap(it) } } catch (e: Exception) { emptyList() }
        }

        private fun find(key: String): StatusBarNotification? = try { instance?.activeNotifications?.firstOrNull { it.key == key } } catch (e: Exception) { null }

        fun dismiss(key: String) { try { instance?.cancelNotification(key) } catch (_: Exception) {} }

        fun reply(key: String, text: String) {
            val sbn = find(key) ?: return
            val action = sbn.notification.actions?.firstOrNull { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true } ?: return
            val intent = Intent()
            val bundle = Bundle()
            for (ri in action.remoteInputs) bundle.putCharSequence(ri.resultKey, text)
            RemoteInput.addResultsToIntent(action.remoteInputs, intent, bundle)
            try { action.actionIntent.send(Bridge.ctx, 0, intent) } catch (_: Exception) {}
        }

        fun action(key: String, index: Int) {
            val sbn = find(key) ?: return
            val list = sbn.notification.actions?.filter { it.remoteInputs.isNullOrEmpty() } ?: return
            try { list.getOrNull(index)?.actionIntent?.send() } catch (_: Exception) {}
        }
    }
}
