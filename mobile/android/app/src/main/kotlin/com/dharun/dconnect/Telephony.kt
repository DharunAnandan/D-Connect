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
        ctx.contentResolver.query(uri, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)?.use { c ->
            while (c.moveToNext() && out.size < 30) out.add(mapOf("name" to c.getString(0), "number" to c.getString(1)))
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
    @SuppressLint("MissingPermission")
    fun sims(ctx: Context): List<Map<String, Any?>> = try {
        val tm = ctx.getSystemService(TelecomManager::class.java)
        tm.callCapablePhoneAccounts.mapIndexed { i, h ->
            val acc = tm.getPhoneAccount(h)
            mapOf("index" to i, "label" to (acc?.label?.toString() ?: "SIM ${i + 1}"), "number" to acc?.address?.schemeSpecificPart)
        }
    } catch (e: Exception) { emptyList() }

    @SuppressLint("MissingPermission")
    fun dial(ctx: Context, number: String, sim: Int? = null) {
        try {
            val tm = ctx.getSystemService(TelecomManager::class.java)
            val extras = Bundle()
            if (sim != null) tm.callCapablePhoneAccounts.getOrNull(sim)?.let { extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it) }
            tm.placeCall(Uri.fromParts("tel", number, null), extras)
        } catch (_: Exception) {}
    }

    // Hold / swap / merge: only the default phone app may do these directly, so bring the
    // phone's own call screen up and press its button through the screen-control service.
    @SuppressLint("MissingPermission")
    fun control(ctx: Context, action: String): Boolean {
        try { ctx.getSystemService(TelecomManager::class.java).showInCallScreen(false) } catch (_: Exception) {}
        val labels = when (action) {
            "hold" -> listOf("hold", "resume", "unhold")
            "swap" -> listOf("swap", "switch calls", "switch")
            "merge" -> listOf("merge", "merge calls", "conference")
            else -> return false
        }
        val svc = ControlService.instance ?: return false
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ svc.clickByLabel(labels) }, 700)
        return true
    }

    fun mute(ctx: Context, muted: Boolean) {
        ctx.getSystemService(AudioManager::class.java).isMicrophoneMute = muted
    }
}
