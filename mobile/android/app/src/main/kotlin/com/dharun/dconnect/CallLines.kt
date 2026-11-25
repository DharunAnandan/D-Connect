package com.dharun.dconnect

import android.content.Context
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import android.telephony.TelephonyManager

// Every call going on right now, not just one. Android only tells ordinary apps "ringing /
// off-hook / idle" plus the last incoming number, so with call waiting a second call used to
// overwrite the first. Here each call is its own line (active, on hold, ringing), and the call
// log tells us when one of two calls ends or when a waiting call was missed or declined.
object CallLines {
    data class Line(
        var number: String?,
        var name: String?,
        var since: Long,
        var status: String, // "ringing" | "dialing" | "active" | "held"
        var conference: Boolean = false
    )

    private val lines = mutableListOf<Line>()
    private var waitingAt = 0L
    private var app: Context? = null
    private val main = Handler(Looper.getMainLooper())
    private var observer: ContentObserver? = null
    private var logSeen = 0L
    private var lastState = TelephonyManager.EXTRA_STATE_IDLE

    private fun digits(n: String?) = (n ?: "").filter { it.isDigit() }.takeLast(10)
    private fun same(a: String?, b: String?) = digits(a).isNotEmpty() && digits(a) == digits(b)
    private fun name(n: String?) = app?.let { Telephony.contactName(it, n) }

    fun start(ctx: Context) {
        app = ctx.applicationContext
        if (observer != null) return
        // restarted in the middle of a call: pick it back up from what was saved
        try {
            @Suppress("DEPRECATION")
            val st = ctx.getSystemService(TelephonyManager::class.java).callState
            val p = ctx.getSharedPreferences("dc_call", Context.MODE_PRIVATE)
            if (st == TelephonyManager.CALL_STATE_OFFHOOK && lines.isEmpty()) {
                val n = p.getString("number", null)
                lines.add(Line(n, p.getString("name", null) ?: name(n), p.getLong("since", 0L).takeIf { it > 0 } ?: System.currentTimeMillis(), "active"))
                lastState = TelephonyManager.EXTRA_STATE_OFFHOOK
                KeepAliveService.current = snapshot()
            }
        } catch (_: Exception) {}
        observer = object : ContentObserver(main) {
            override fun onChange(selfChange: Boolean) = onCallLog()
        }
        try { ctx.contentResolver.registerContentObserver(CallLog.Calls.CONTENT_URI, true, observer!!) } catch (_: Exception) {}
    }

    // the phone's legacy call-state broadcast (fires twice: once without the number)
    @Synchronized
    fun onPhoneState(state: String, number: String?) {
        val now = System.currentTimeMillis()
        val prev = lastState
        lastState = state
        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                val ringing = lines.firstOrNull { it.status == "ringing" }
                if (ringing != null) {
                    if (ringing.number == null && number != null) { ringing.number = number; ringing.name = name(number) }
                } else if (lines.any { it.status == "active" || it.status == "held" || it.status == "dialing" }) {
                    // call waiting: a second call while on one. A phone call always comes with its
                    // number; a "ringing" without one during a call is an app call (Teams,
                    // WhatsApp...), which the PC shows from its notification instead.
                    if (number == null) return
                    waitingAt = now
                    lines.add(Line(number, name(number), now, "ringing"))
                } else {
                    lines.clear()
                    lines.add(Line(number, name(number), now, "ringing"))
                }
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                val ringing = lines.firstOrNull { it.status == "ringing" }
                val others = lines.filter { it.status != "ringing" }
                when {
                    lines.isEmpty() -> lines.add(Line(number ?: KeepAliveService.lastNumber, name(number ?: KeepAliveService.lastNumber), now, "dialing"))
                    ringing != null && others.isEmpty() -> { ringing.status = "active"; ringing.since = now }
                    ringing != null -> {
                        // the waiting call stopped ringing: answered (first call now on hold), or
                        // missed / declined (it lands in the call log). Look a moment later.
                        main.postDelayed({ resolveWaiting(ringing) }, 1500)
                        return
                    }
                    prev == state && number == null -> return // the duplicate broadcast
                    else -> lines.filter { it.status == "dialing" }.forEach { it.status = "active" }
                }
            }
            else -> lines.clear()
        }
        emit()
    }

    @Synchronized
    private fun resolveWaiting(w: Line) {
        if (!lines.contains(w) || w.status != "ringing") return
        if (endedInLog(w.number, waitingAt - 3000)) lines.remove(w)
        else {
            lines.filter { it !== w }.forEach { it.status = "held" }
            w.status = "active"
            w.since = System.currentTimeMillis()
        }
        emit()
    }

    // a call that has ended appears in the call log
    private fun endedInLog(number: String?, since: Long): Boolean {
        val ctx = app ?: return false
        return try {
            ctx.contentResolver.query(CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE), "${CallLog.Calls.DATE} >= ?", arrayOf(since.toString()), "${CallLog.Calls.DATE} DESC")?.use { c ->
                var hit = false
                while (c.moveToNext()) if (same(c.getString(0), number)) { hit = true; break }
                hit
            } ?: false
        } catch (_: Exception) { false }
    }

    // one of several calls ended while the phone is still off-hook: drop that line
    @Synchronized
    private fun onCallLog() {
        val ctx = app ?: return
        if (lines.size < 2) return
        try {
            ctx.contentResolver.query(CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION), "${CallLog.Calls.DATE} > ?", arrayOf(maxOf(logSeen, lines.minOf { it.since } - 120000).toString()), "${CallLog.Calls.DATE} DESC")?.use { c ->
                var changed = false
                while (c.moveToNext()) {
                    val number = c.getString(0)
                    val end = c.getLong(1) + c.getLong(2) * 1000
                    logSeen = maxOf(logSeen, c.getLong(1))
                    val line = lines.firstOrNull { it.status != "ringing" && same(it.number, number) && end >= it.since - 5000 }
                    if (line != null && lines.size > 1) { lines.remove(line); changed = true }
                }
                if (changed) {
                    if (lines.none { it.status == "active" }) lines.firstOrNull { it.status == "held" }?.let { if (lines.size == 1 && it.conference) it.status = "active" }
                    if (lines.size == 1) lines[0].conference = false
                    emit()
                }
            }
        } catch (_: Exception) {}
    }

    // the PC placed another call while on one ("Add call"): the current call goes on hold
    @Synchronized
    fun onDialed(number: String) {
        KeepAliveService.lastNumber = number
        if (lines.none { it.status == "active" || it.status == "held" || it.status == "dialing" }) return
        lines.forEach { if (it.status == "active" || it.status == "dialing") it.status = "held" }
        lines.add(Line(number, name(number), System.currentTimeMillis(), "active"))
        emit()
    }

    // after a hold / swap / merge on the call screen went through
    @Synchronized
    fun onControl(action: String) {
        lines.filter { it.status == "dialing" }.forEach { it.status = "active" }
        when (action) {
            "hold" -> lines.filter { it.status == "active" || it.status == "held" }.let { l -> if (l.size == 1) l[0].status = if (l[0].status == "active") "held" else "active" }
            "swap" -> lines.forEach { if (it.status == "active") it.status = "held" else if (it.status == "held") it.status = "active" }
            "merge" -> lines.filter { it.status == "active" || it.status == "held" }.forEach { it.status = "active"; it.conference = true }
        }
        emit()
    }

    // The dialer's ongoing-call notification names the call in front, or says "Conference call"
    // after a merge: follow merges and swaps made on the phone itself.
    @Synchronized
    fun onDialerNotification(title: String, text: String) {
        val inCall = lines.filter { it.status == "active" || it.status == "held" }
        if (inCall.size < 2) return
        val t = "$title $text".lowercase()
        if (Regex("conference|merged|group call").containsMatchIn(t)) {
            if (inCall.all { it.conference && it.status == "active" }) return
            inCall.forEach { it.status = "active"; it.conference = true }
            emit()
            return
        }
        if (Regex("incoming|ringing|calling…|calling\\.\\.\\.").containsMatchIn(t)) return
        if (inCall.all { it.conference }) return // a conference stays one until a call ends
        val tDigits = digits(title)
        val front = inCall.firstOrNull { l -> (l.name != null && title.contains(l.name!!, ignoreCase = true)) || (tDigits.length >= 6 && digits(l.number) == tDigits) } ?: return
        if (front.status == "active" && inCall.all { it === front || it.status == "held" }) return
        inCall.forEach { it.status = if (it === front) "active" else "held" } // swapped on the phone
        emit()
    }

    // no call any more (the ending was missed while the app was frozen)
    @Synchronized
    fun reset() {
        if (lines.isEmpty()) return
        lines.clear()
        lastState = TelephonyManager.EXTRA_STATE_IDLE
        KeepAliveService.current = null
        app?.getSharedPreferences("dc_call", Context.MODE_PRIVATE)?.edit()?.clear()?.apply()
    }

    // what the PC's call card shows: the call in front (or the one ringing), plus all lines
    @Synchronized
    fun snapshot(): Map<String, Any?>? {
        if (lines.isEmpty()) return null
        val ringing = lines.firstOrNull { it.status == "ringing" }
        val front = lines.firstOrNull { it.status == "active" } ?: lines.firstOrNull { it.status == "dialing" } ?: lines.firstOrNull { it.status == "held" } ?: ringing!!
        val state = when (front.status) { "ringing" -> "ringing"; "dialing" -> "dialing"; else -> "offhook" }
        val waiting = ringing != null && ringing !== front
        return mapOf(
            "state" to state,
            "number" to front.number,
            "name" to front.name,
            "since" to if (front.status == "ringing") null else front.since,
            "held" to (front.status == "held"),
            "waiting" to false,
            "waitingCall" to if (waiting) mapOf("number" to ringing!!.number, "name" to ringing.name) else null,
            "calls" to lines.map { mapOf("number" to it.number, "name" to it.name, "since" to it.since, "status" to it.status, "conference" to it.conference) }
        )
    }

    private fun emit() {
        val m = snapshot() ?: mapOf("state" to "idle")
        KeepAliveService.current = if (lines.isEmpty()) null else m
        Bridge.emit("call.state", m)
    }
}
