package com.dharun.dconnect

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.provider.CallLog
import android.provider.ContactsContract
import android.telecom.TelecomManager
import android.telephony.SmsManager

// SMS, calls and contacts. The PC is the screen; the phone's SIM does the work.
object Telephony {
    private val nameCache = HashMap<String, String?>()

    fun contactName(ctx: Context, number: String?): String? {
        if (number.isNullOrBlank()) return null
        return nameCache.getOrPut(number) {
            try {
                val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
                ctx.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
            } catch (e: Exception) { null }
        }
    }

    fun threads(ctx: Context): List<Map<String, Any?>> {
        val out = LinkedHashMap<String, MutableMap<String, Any?>>()
        ctx.contentResolver.query(Uri.parse("content://sms"), arrayOf("thread_id", "address", "body", "date", "read"), null, null, "date DESC")?.use { c ->
            while (c.moveToNext() && out.size < 60) {
                val tid = c.getString(0) ?: continue
                val t = out[tid]
                if (t == null) {
                    val address = c.getString(1) ?: ""
                    out[tid] = mutableMapOf("threadId" to tid, "address" to address, "name" to contactName(ctx, address), "snippet" to (c.getString(2) ?: ""), "date" to c.getLong(3), "unread" to if (c.getInt(4) == 0) 1 else 0)
                } else if (c.getInt(4) == 0) {
                    t["unread"] = (t["unread"] as Int) + 1
                }
            }
        }
        return out.values.toList()
    }

    fun messages(ctx: Context, threadId: String): List<Map<String, Any?>> {
        val out = mutableListOf<Map<String, Any?>>()
        ctx.contentResolver.query(Uri.parse("content://sms"), arrayOf("_id", "address", "body", "date", "type"), "thread_id = ?", arrayOf(threadId), "date DESC LIMIT 200")?.use { c ->
            while (c.moveToNext()) {
                out.add(mapOf("id" to c.getString(0), "threadId" to threadId, "address" to (c.getString(1) ?: ""), "body" to (c.getString(2) ?: ""), "date" to c.getLong(3), "out" to (c.getInt(4) == 2)))
            }
        }
        return out.reversed()
    }

    fun send(ctx: Context, address: String, body: String): Boolean = try {
        val sms = ctx.getSystemService(SmsManager::class.java)
        val parts = sms.divideMessage(body)
        if (parts.size > 1) sms.sendMultipartTextMessage(address, null, parts, null, null) else sms.sendTextMessage(address, null, body, null, null)
        true
    } catch (e: Exception) { false }

    fun searchContacts(ctx: Context, q: String): List<Map<String, Any?>> {
        val out = mutableListOf<Map<String, Any?>>()
        val uri = if (q.isBlank()) ContactsContract.CommonDataKinds.Phone.CONTENT_URI else Uri.withAppendedPath(ContactsContract.CommonDataKinds.Phone.CONTENT_FILTER_URI, Uri.encode(q))
        // the whole address book (sorted, one row per number) when browsing; 30 matches when searching
        val limit = if (q.isBlank()) 5000 else 30
        val seen = HashSet<String>()
        ctx.contentResolver.query(uri, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} COLLATE NOCASE ASC")?.use { c ->
            while (c.moveToNext() && out.size < limit) {
                val name = c.getString(0) ?: continue
                val number = c.getString(1) ?: continue
                if (seen.add(name + "|" + number.filter { it.isDigit() }.takeLast(10))) out.add(mapOf("name" to name, "number" to number))
            }
        }
        return out
    }

    fun callLog(ctx: Context): List<Map<String, Any?>> {
        val out = mutableListOf<Map<String, Any?>>()
        ctx.contentResolver.query(CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.CACHED_NAME, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE), null, null, "${CallLog.Calls.DATE} DESC")?.use { c ->
            while (c.moveToNext() && out.size < 100) {
                val kind = when (c.getInt(4)) {
                    CallLog.Calls.OUTGOING_TYPE -> "out"
                    CallLog.Calls.MISSED_TYPE -> "missed"
                    CallLog.Calls.REJECTED_TYPE, CallLog.Calls.BLOCKED_TYPE -> "rejected"
                    else -> "in"
                }
                out.add(mapOf("number" to (c.getString(0) ?: ""), "name" to c.getString(1), "date" to c.getLong(2), "duration" to c.getLong(3), "kind" to kind))
            }
        }
        return out
    }

    @SuppressLint("MissingPermission")
    fun answer(ctx: Context) {
        try { ctx.getSystemService(TelecomManager::class.java).acceptRingingCall() } catch (_: Exception) {}
    }

    @SuppressLint("MissingPermission")
    fun end(ctx: Context) {
        try {
            @Suppress("DEPRECATION")
            ctx.getSystemService(TelecomManager::class.java).endCall()
        } catch (_: Exception) {}
    }

    // The SIMs that can place calls, so the PC can pick one (and the phone doesn't ask).
    // Each entry carries the Telecom account (to place the call on) when Android gives it to us.
    @SuppressLint("MissingPermission")
    fun sims(ctx: Context): List<Map<String, Any?>> {
        val tm = ctx.getSystemService(TelecomManager::class.java)
        val handles = try { tm.callCapablePhoneAccounts } catch (e: Exception) { android.util.Log.w("DConnect", "callCapablePhoneAccounts: $e"); emptyList() }
        val subs = try {
            ctx.getSystemService(android.telephony.SubscriptionManager::class.java).activeSubscriptionInfoList ?: emptyList()
        } catch (e: Exception) { android.util.Log.w("DConnect", "activeSubscriptionInfoList: $e"); emptyList() }
        android.util.Log.i("DConnect", "sims: ${handles.size} call accounts, ${subs.size} subscriptions")
        if (handles.isNotEmpty()) return handles.mapIndexed { i, h ->
            val acc = try { tm.getPhoneAccount(h) } catch (e: Exception) { null }
            val sub = subs.firstOrNull { it.subscriptionId.toString() == h.id || it.iccId == h.id }
            mapOf("index" to i, "label" to (sub?.displayName?.toString() ?: acc?.label?.toString() ?: "SIM ${i + 1}"), "slot" to sub?.simSlotIndex)
        }
        return subs.sortedBy { it.simSlotIndex }.mapIndexed { i, sub -> mapOf("index" to i, "label" to (sub.displayName?.toString() ?: "SIM ${sub.simSlotIndex + 1}"), "slot" to sub.simSlotIndex) }
    }

    @SuppressLint("MissingPermission")
    fun dial(ctx: Context, number: String, sim: Int? = null) {
        CallLines.onDialed(number) // during a call this is "Add call": the current one goes on hold
        try {
            val tm = ctx.getSystemService(TelecomManager::class.java)
            val extras = Bundle()
            if (sim != null) {
                val handles = try { tm.callCapablePhoneAccounts } catch (e: Exception) { emptyList() }
                val subs = try { ctx.getSystemService(android.telephony.SubscriptionManager::class.java).activeSubscriptionInfoList?.sortedBy { it.simSlotIndex } ?: emptyList() } catch (e: Exception) { emptyList() }
                // the account for this SIM: by position, or matched to its subscription
                val sub = subs.getOrNull(sim)
                val handle = handles.firstOrNull { h -> sub != null && (h.id == sub.subscriptionId.toString() || h.id == sub.iccId) } ?: handles.getOrNull(sim)
                if (handle != null) extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle)
                // OEM dialers that look at the slot instead
                val slot = sub?.simSlotIndex ?: sim
                for (k in listOf("com.android.phone.extra.slot", "slot", "simSlot", "sim_slot", "subscription", "phone", "com.android.phone.DialingMode")) extras.putInt(k, slot)
                android.util.Log.i("DConnect", "dial on sim=$sim slot=$slot handle=${handle?.id}")
            }
            tm.placeCall(Uri.fromParts("tel", number, null), extras)
        } catch (e: Exception) { android.util.Log.w("DConnect", "dial: $e") }
    }

    // Hold / swap / merge and the call's audio route: only the default phone app may change these
    // directly, so bring the phone's own call screen up and press its buttons through the
    // screen-control service. "audio-pc" picks the PC (by its Bluetooth name) in the Audio menu.
    @SuppressLint("MissingPermission")
    fun control(ctx: Context, action: String, target: String? = null): Boolean {
        val svc = ControlService.instance ?: return false
        try { ctx.getSystemService(TelecomManager::class.java).showInCallScreen(false) } catch (_: Exception) {}
        val main = android.os.Handler(android.os.Looper.getMainLooper())
        when (action) {
            "hold", "swap", "merge" -> {
                // the call screen's own buttons (OnePlus: a grid of labelled buttons). Labels are
                // matched exactly so the "On hold" status text of the other call isn't pressed.
                val labels = when (action) {
                    "hold" -> listOf("hold", "resume", "unhold", "hold call", "resume call")
                    "swap" -> listOf("swap", "swap calls", "switch calls", "switch")
                    else -> listOf("merge", "merge calls", "conference", "merge call")
                }
                var tries = 0
                fun attempt() {
                    tries++
                    if (svc.clickExact(labels)) {
                        CallLines.onControl(action)
                        report(action, true, "pressed")
                    } else if (tries < 6) main.postDelayed({ attempt() }, 500)
                    else report(action, false, "no ${labels.first()} button on the call screen: ${svc.lastScreen}")
                }
                main.postDelayed({ attempt() }, 700)
            }
            "drop" -> {
                // end one person in a conference: Manage conference -> their row's end button
                val who = target ?: return false
                val names = listOf(who) + listOfNotNull(contactName(ctx, who))
                val ends = listOf("end call", "hang up", "disconnect", "end", "remove")
                var tries = 0
                fun attempt() {
                    tries++
                    if (svc.clickInRow(names, ends)) return report("drop", true, "ended $who")
                    if (svc.clickByLabel(listOf("manage conference", "manage", "conference call", "participants"))) main.postDelayed({
                        if (svc.clickInRow(names, ends)) report("drop", true, "ended $who")
                        else if (tries < 4) main.postDelayed({ attempt() }, 600)
                        else report("drop", false, "no end button for $who: ${svc.lastScreen}")
                    }, 900)
                    else if (tries < 6) main.postDelayed({ attempt() }, 500)
                    else report("drop", false, "no Manage conference on the call screen: ${svc.lastScreen}")
                }
                main.postDelayed({ attempt() }, 700)
            }
            "audio-pc", "audio-phone", "audio-speaker" -> {
                // the call screen can only be pressed while it's on: wake it for a few seconds
                try {
                    @Suppress("DEPRECATION")
                    ctx.getSystemService(android.os.PowerManager::class.java)
                        .newWakeLock(android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK or android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP, "dconnect:route")
                        .acquire(8000)
                } catch (_: Exception) {}
                val choice = when (action) {
                    // the PC by its Bluetooth name, and by the name this phone saved for it
                    "audio-pc" -> (listOfNotNull(target?.lowercase()) + pcNames(ctx)).distinct()
                    "audio-phone" -> listOf("phone receiver", "receiver", "earpiece", "handset")
                    else -> listOf("speaker")
                }
                // The dialer's audio button shows the *current* route ("Phone receiver", "Speaker",
                // the PC's name...), so find it by id. With Bluetooth connected it opens a menu
                // (Speaker / Phone receiver / the PC): pick from that menu, never the button itself.
                val button = listOf("audio_button", "audioButton", "audio_route_button", "speakerButton", "speaker_button")
                val opener = button.map { "id:${it.lowercase()}" } + listOf("audio output", "audio route", "bluetooth")
                val skip = button.map { it.lowercase() } + listOf("audio_image", "audio_icon")
                var tries = 0
                fun attempt() {
                    tries++
                    if (svc.clickByLabel(choice, skip)) return report(action, true, "picked") // menu already open
                    if (svc.clickByLabel(opener)) {
                        main.postDelayed({
                            if (svc.clickByLabel(choice, skip)) report(action, true, "picked from menu")
                            else if (tries < 4) {
                                svc.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK) // close a wrong menu
                                main.postDelayed({ attempt() }, 700)
                            } else report(action, false, "menu had no ${choice.joinToString("/")}: ${svc.lastScreen}")
                        }, 800)
                    } else if (tries < 6) main.postDelayed({ attempt() }, 500)
                    else report(action, false, "no audio button on screen: ${svc.lastScreen}")
                }
                main.postDelayed({ attempt() }, 600)
            }
            else -> return false
        }
        return true
    }

    // how a route change went, for the PC (so a failure says why)
    private fun report(action: String, ok: Boolean, detail: String) {
        android.util.Log.i("DConnect", "route $action ok=$ok $detail")
        Bridge.emit("call.route.result", mapOf("action" to action, "ok" to ok, "detail" to detail.take(1500)))
    }

    // names this phone uses for paired PCs (laptops/desktops), lowercased
    @SuppressLint("MissingPermission")
    private fun pcNames(ctx: Context): List<String> = try {
        ctx.getSystemService(android.bluetooth.BluetoothManager::class.java).adapter.bondedDevices
            .filter { it.bluetoothClass?.majorDeviceClass == android.bluetooth.BluetoothClass.Device.Major.COMPUTER }
            .flatMap { listOfNotNull(it.alias, it.name) }
            .map { it.lowercase() }
    } catch (_: Exception) { emptyList() }

    // Put the ongoing call's audio on the Bluetooth hands-free link (the PC).
    fun routeToBluetooth(ctx: Context) {
        val am = ctx.getSystemService(AudioManager::class.java)
        try {
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                am.availableCommunicationDevices.firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO }?.let { am.setCommunicationDevice(it) }
            } else {
                @Suppress("DEPRECATION")
                am.startBluetoothSco()
                @Suppress("DEPRECATION")
                am.isBluetoothScoOn = true
            }
        } catch (_: Exception) {}
    }

    // The call going on right now, if any (e.g. the PC connected in the middle of a call).
    @SuppressLint("MissingPermission")
    fun currentCall(ctx: Context): Map<String, Any?> {
        val st = try { ctx.getSystemService(android.telephony.TelephonyManager::class.java).callState } catch (e: Exception) { 0 }
        // Android's live state wins: a call that ended while this app was frozen is over
        if (st == android.telephony.TelephonyManager.CALL_STATE_IDLE) {
            CallLines.reset()
            return mapOf("state" to "idle")
        }
        KeepAliveService.current?.let { return it }
        // saved by KeepAliveService when the call started (survives an app restart)
        val saved = ctx.getSharedPreferences("dc_call", Context.MODE_PRIVATE)
        if (st != android.telephony.TelephonyManager.CALL_STATE_IDLE && saved.contains("state")) {
            return mapOf("state" to (saved.getString("state", null) ?: "offhook"), "number" to saved.getString("number", null), "name" to saved.getString("name", null), "since" to saved.getLong("since", 0L).takeIf { it > 0 })
        }
        return when (st) {
            android.telephony.TelephonyManager.CALL_STATE_RINGING -> mapOf("state" to "ringing")
            android.telephony.TelephonyManager.CALL_STATE_OFFHOOK -> mapOf("state" to "offhook")
            else -> mapOf("state" to "idle")
        }
    }

    fun mute(ctx: Context, muted: Boolean) {
        ctx.getSystemService(AudioManager::class.java).isMicrophoneMute = muted
    }
}
