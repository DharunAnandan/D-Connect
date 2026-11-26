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
        // the phone's own dialer: its call notification isn't an "app call" for the PC (phone
        // calls arrive as call state); it does tell us a merge or swap made on the phone itself
        if (isDialer(sbn.packageName)) {
            if (sbn.notification.category == Notification.CATEGORY_CALL) {
                val ex = sbn.notification.extras
                CallLines.onDialerNotification(
                    ex.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: "",
                    ex.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: "",
                    ex.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER, false),
                    sbn.notification.`when`
                )
            }
            return
        }
        val m = toMap(sbn) ?: return
        Bridge.emit("notif.posted", m)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        Bridge.emit("notif.removed", mapOf("key" to sbn.key))
    }

    private val dialers by lazy {
        val def = try { getSystemService(android.telecom.TelecomManager::class.java)?.defaultDialerPackage } catch (_: Exception) { null }
        setOfNotNull(def, "com.android.dialer", "com.google.android.dialer", "com.oplus.dialer", "com.android.incallui", "com.samsung.android.incallui", "com.samsung.android.dialer", "com.android.server.telecom", "com.oneplus.dialer", "com.coloros.dialer")
    }
    fun isDialer(pkg: String) = pkg in dialers

    private fun toMap(sbn: StatusBarNotification): Map<String, Any?>? {
        val n = sbn.notification
        if (sbn.packageName == packageName) return null
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return null
        // music players (Spotify, YouTube Music...) live on the PC's "On your phone" player card
        if (n.extras.containsKey(Notification.EXTRA_MEDIA_SESSION)) return null
        if (sbn.isOngoing && n.category != Notification.CATEGORY_CALL) return null
        val ex = n.extras
        val title = ex.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = (ex.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: ex.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
        if (title.isBlank() && text.isBlank()) return null
        val actions = n.actions ?: emptyArray()
        val canReply = actions.any { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true }
        // Chat apps (WhatsApp, Telegram...) keep the conversation inside the notification: who
        // said what, your replies included. Send the last few messages and the chat's name, so a
        // reply you sent shows under the message it answers instead of as a new "You" alert.
        var convo: String? = null
        var fromMe = false
        val thread = mutableListOf<Map<String, Any?>>()
        try {
            val style = androidx.core.app.NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
            if (style != null && style.messages.isNotEmpty()) {
                val me = style.user.name?.toString()
                fun mine(m: androidx.core.app.NotificationCompat.MessagingStyle.Message) = m.person == null || (me != null && m.person?.name?.toString() == me)
                convo = style.conversationTitle?.toString() ?: style.messages.lastOrNull { !mine(it) }?.person?.name?.toString()
                fromMe = mine(style.messages.last())
                for (m in style.messages.takeLast(6)) thread.add(mapOf(
                    "from" to if (mine(m)) "You" else (m.person?.name?.toString() ?: convo),
                    "text" to (m.text?.toString() ?: ""), "me" to mine(m), "time" to m.timestamp,
                    // a photo or shared post attached to the message: a small preview, when the app lets us read it
                    "image" to if (m.dataMimeType?.startsWith("image/") == true && m.dataUri != null) thumb(m.dataUri!!) else null
                ))
            }
        } catch (_: Exception) {}
        // a notification with a big picture (a shared post, a photo...)
        val picture = try {
            (ex.getParcelable(Notification.EXTRA_PICTURE) as? Bitmap)?.let { small(it) }
        } catch (_: Exception) { null }
        return mapOf(
            "key" to sbn.key,
            "pkg" to sbn.packageName,
            "picture" to (picture ?: thread.lastOrNull { it["image"] != null }?.get("image")),
            "app" to appLabel(sbn.packageName),
            "title" to (convo ?: title),
            "text" to (thread.lastOrNull { it["me"] != true }?.get("text") as String? ?: text),
            "fromMe" to fromMe,
            "thread" to thread,
            "time" to sbn.postTime,
            "icon" to appIcon(sbn.packageName),
            "canReply" to canReply,
            "category" to n.category, // "call" for Teams/WhatsApp/... incoming calls
            "actions" to actions.filter { it.remoteInputs.isNullOrEmpty() }.map { it.title.toString() }.take(5)
        )
    }

    // a picture as a small JPEG (base64) for the PC
    private fun small(b: Bitmap, max: Int = 360): String {
        val k = max.toFloat() / maxOf(b.width, b.height)
        val s = if (k < 1) Bitmap.createScaledBitmap(b, (b.width * k).toInt().coerceAtLeast(1), (b.height * k).toInt().coerceAtLeast(1), true) else b
        val o = java.io.ByteArrayOutputStream()
        s.compress(Bitmap.CompressFormat.JPEG, 78, o)
        return android.util.Base64.encodeToString(o.toByteArray(), android.util.Base64.NO_WRAP)
    }

    private fun thumb(uri: android.net.Uri): String? = try {
        contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it) }?.let { small(it) }
    } catch (_: Exception) { null } // the app didn't share it

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

        // Reply through the notification's own reply action (what Android Auto / watches use).
        // Returns "ok" or why it couldn't.
        fun reply(key: String, text: String): String {
            if (instance == null) return "no-access"
            val sbn = find(key) ?: return "gone"
            val n = sbn.notification
            val withInput = { a: Notification.Action -> a.remoteInputs?.any { it.allowFreeFormInput } == true }
            // the normal actions first, then the ones meant for watches (WhatsApp puts one there)
            val action = n.actions?.firstOrNull(withInput)
                ?: Notification.WearableExtender(n).actions.firstOrNull(withInput)
                ?: return "no-reply-action"
            return try {
                val intent = Intent().addFlags(Intent.FLAG_RECEIVER_FOREGROUND)
                val bundle = Bundle()
                for (ri in action.remoteInputs) bundle.putCharSequence(ri.resultKey, text)
                RemoteInput.addResultsToIntent(action.remoteInputs, intent, bundle)
                if (android.os.Build.VERSION.SDK_INT >= 28) RemoteInput.setResultsSource(intent, RemoteInput.SOURCE_FREE_FORM_INPUT)
                action.actionIntent.send(Bridge.ctx, 0, intent)
                android.util.Log.i("DConnect", "reply sent to ${sbn.packageName}")
                "ok"
            } catch (e: Exception) {
                android.util.Log.w("DConnect", "reply failed: $e")
                "failed: ${e.javaClass.simpleName}"
            }
        }

        // Open what the notification opens (the WhatsApp chat...): its own tap action. With
        // [onAppWindow], on the PC's app-window screen (scrcpy's virtual display) instead of the
        // phone's own screen, so it shows up in the D-Connect window on the laptop.
        fun open(key: String, onAppWindow: Boolean): String {
            val sbn = find(key) ?: return "gone"
            val pi = sbn.notification.contentIntent ?: return "no-action"
            return try {
                var options: Bundle? = null
                if (onAppWindow && android.os.Build.VERSION.SDK_INT >= 26) {
                    val dm = Bridge.ctx.getSystemService(android.hardware.display.DisplayManager::class.java)
                    val d = dm.displays.firstOrNull { it.displayId != android.view.Display.DEFAULT_DISPLAY && it.name.contains("scrcpy", ignoreCase = true) }
                    if (d != null) {
                        val o = android.app.ActivityOptions.makeBasic().setLaunchDisplayId(d.displayId)
                        if (android.os.Build.VERSION.SDK_INT >= 34) o.setPendingIntentBackgroundActivityStartMode(android.app.ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
                        options = o.toBundle()
                    }
                }
                pi.send(Bridge.ctx, 0, null, null, null, null, options)
                if (onAppWindow && options == null) "no-window" else "ok"
            } catch (e: Exception) {
                android.util.Log.w("DConnect", "open failed: $e")
                "failed"
            }
        }

        // the ongoing call notification of an app call (Teams, WhatsApp, Meet...)
        fun appCallKey(): String? = try {
            instance?.activeNotifications?.firstOrNull { it.notification.category == Notification.CATEGORY_CALL && it.isOngoing && it.packageName != instance?.packageName && !(instance?.isDialer(it.packageName) ?: false) }?.key
        } catch (_: Exception) { null }

        fun action(key: String, index: Int) {
            val sbn = find(key) ?: return
            val list = sbn.notification.actions?.filter { it.remoteInputs.isNullOrEmpty() } ?: return
            try { list.getOrNull(index)?.actionIntent?.send() } catch (_: Exception) {}
        }
    }
}
