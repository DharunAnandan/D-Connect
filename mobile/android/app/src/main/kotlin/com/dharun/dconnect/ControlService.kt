package com.dharun.dconnect

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Path
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

// Lets the PC tap, swipe and type on the phone while it is mirrored. Touches are recorded from
// down to up and replayed as one gesture (tap, long-press or swipe along the real path).
class ControlService : AccessibilityService() {
    private val path = mutableListOf<Pair<Float, Float>>()
    private var downAt = 0L

    override fun onServiceConnected() {
        instance = this
        Bridge.emit("mirror.control", mapOf("control" to true))
    }
    override fun onDestroy() {
        if (instance === this) instance = null
        Bridge.emit("mirror.control", mapOf("control" to false))
        super.onDestroy()
    }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    private fun screen(): Pair<Int, Int> {
        val wm = getSystemService(WindowManager::class.java)
        return if (Build.VERSION.SDK_INT >= 30) wm.maximumWindowMetrics.bounds.let { it.width() to it.height() }
        else { val m = android.util.DisplayMetrics(); @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(m); m.widthPixels to m.heightPixels }
    }

    fun touch(action: String, nx: Float, ny: Float) {
        val (w, h) = screen()
        val x = (nx * w).coerceIn(0f, w - 1f)
        val y = (ny * h).coerceIn(0f, h - 1f)
        when (action) {
            "down" -> { path.clear(); path.add(x to y); downAt = SystemClock.uptimeMillis() }
            "move" -> if (path.isNotEmpty()) path.add(x to y)
            "up" -> {
                if (path.isEmpty()) return
                path.add(x to y)
                val elapsed = (SystemClock.uptimeMillis() - downAt).coerceIn(1, 4000)
                val (sx, sy) = path.first()
                val moved = path.maxOf { kotlin.math.hypot(it.first - sx, it.second - sy) }
                val p = Path().apply { moveTo(sx, sy) }
                if (moved < 12) {
                    val dur = if (elapsed > 450) elapsed else 40L // long press or tap
                    dispatch(p, dur)
                } else {
                    // thin the path so the gesture stays small
                    val step = maxOf(1, path.size / 40)
                    for (i in step until path.size step step) p.lineTo(path[i].first, path[i].second)
                    p.lineTo(path.last().first, path.last().second)
                    dispatch(p, elapsed.coerceIn(60, 2000))
                }
                path.clear()
            }
        }
    }

    fun scroll(nx: Float, ny: Float, dy: Float) {
        val (w, h) = screen()
        val x = nx * w
        val y = ny * h
        val dist = (if (dy > 0) -1 else 1) * minOf(h * 0.35f, kotlin.math.abs(dy) * 4f + h * 0.08f)
        val p = Path().apply { moveTo(x, y); lineTo(x, (y + dist).coerceIn(1f, h - 1f)) }
        dispatch(p, 160)
    }

    private fun dispatch(p: Path, duration: Long) {
        val g = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(p, 0, duration)).build()
        dispatchGesture(g, null, null)
    }

    fun key(action: String) {
        when (action) {
            "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
            "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
            "notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
            "lock" -> if (Build.VERSION.SDK_INT >= 28) performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
            "volup", "voldown" -> volumeFallback(this, action)
            "backspace" -> focused()?.let { n ->
                val t = if (n.isShowingHintText) "" else n.text?.toString() ?: ""
                if (t.isNotEmpty()) setText(n, t.dropLast(1))
            }
            "enter" -> focused()?.let { n ->
                if (Build.VERSION.SDK_INT >= 30) n.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
                else setText(n, (n.text?.toString() ?: "") + "\n")
            }
        }
    }

    fun text(s: String) {
        val n = focused() ?: return
        val t = if (n.isShowingHintText) "" else n.text?.toString() ?: ""
        setText(n, t + s)
    }

    // press the first button whose text or description matches (the phone's own call screen)
    var lastScreen = ""

    // In a list where each row is a person (e.g. "Manage conference"), press the button labelled
    // one of [buttons] inside the row that mentions [who] (name or number).
    fun clickInRow(who: List<String>, buttons: List<String>): Boolean {
        val roots = windows.mapNotNull { it.root } + listOfNotNull(rootInActiveWindow)
        val keys = who.filter { it.isNotBlank() }.map { it.lowercase() }
        fun label(n: AccessibilityNodeInfo) = ((n.text ?: "").toString() + " " + (n.contentDescription ?: "").toString()).lowercase()
        fun digits(s: String) = s.filter { it.isDigit() }.takeLast(10)
        for (root in roots) {
            val queue = ArrayDeque<AccessibilityNodeInfo>().apply { add(root) }
            while (queue.isNotEmpty()) {
                val n = queue.removeFirst()
                val t = label(n)
                val hit = keys.any { k -> (k.length > 2 && t.contains(k)) || (digits(k).length >= 6 && digits(t).endsWith(digits(k))) }
                if (hit) {
                    // climb to the row, then look for the end button inside it
                    var row: AccessibilityNodeInfo? = n.parent
                    repeat(4) {
                        val r = row ?: return@repeat
                        val inner = ArrayDeque<AccessibilityNodeInfo>().apply { add(r) }
                        while (inner.isNotEmpty()) {
                            val m = inner.removeFirst()
                            val ml = label(m).trim()
                            if (ml.isNotEmpty() && buttons.any { ml.contains(it) } && (m.isClickable || m.parent?.isClickable == true)) {
                                val c = if (m.isClickable) m else m.parent
                                if (c?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true
                            }
                            for (i in 0 until m.childCount) m.getChild(i)?.let { inner.add(it) }
                        }
                        row = r.parent
                    }
                }
                for (i in 0 until n.childCount) n.getChild(i)?.let { queue.add(it) }
            }
        }
        clickByLabel(listOf("\u0000")) // record the screen for the report
        return false
    }

    // press the clickable control whose whole label is one of [labels] (not just containing it)
    fun clickExact(labels: List<String>): Boolean {
        val roots = windows.mapNotNull { it.root } + listOfNotNull(rootInActiveWindow)
        for (root in roots) {
            val queue = ArrayDeque<AccessibilityNodeInfo>().apply { add(root) }
            while (queue.isNotEmpty()) {
                val n = queue.removeFirst()
                val t = (n.text ?: n.contentDescription ?: "").toString().trim().lowercase()
                if (t.isNotEmpty() && labels.any { t == it } && n.isEnabled) {
                    var c: AccessibilityNodeInfo? = n
                    while (c != null && !c.isClickable) c = c.parent
                    if (c?.isEnabled != false && c?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true
                }
                for (i in 0 until n.childCount) n.getChild(i)?.let { queue.add(it) }
            }
        }
        clickByLabel(listOf("\u0000")) // records what the screen offers, for the report
        return false
    }

    // labels match the text, the description, or (as "id:name") the view id; nodes whose id is in
    // [skipIds] are ignored (e.g. the dialer's audio button, whose text is the current route)
    fun clickByLabel(labels: List<String>, skipIds: List<String> = emptyList()): Boolean {
        val roots = windows.mapNotNull { it.root } + listOfNotNull(rootInActiveWindow)
        for (root in roots) {
            val queue = ArrayDeque<AccessibilityNodeInfo>().apply { add(root) }
            while (queue.isNotEmpty()) {
                val n = queue.removeFirst()
                val t = ((n.text ?: "").toString() + " " + (n.contentDescription ?: "").toString()).lowercase()
                val id = (n.viewIdResourceName ?: "").substringAfter(":id/").lowercase()
                val skip = id.isNotEmpty() && skipIds.any { id == it }
                if (!skip && labels.any { if (it.startsWith("id:")) id == it.removePrefix("id:") else (t.trim() == it || t.contains(it)) }) {
                    var c: AccessibilityNodeInfo? = n
                    while (c != null && !c.isClickable) c = c.parent
                    if (c?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true
                }
                for (i in 0 until n.childCount) n.getChild(i)?.let { queue.add(it) }
            }
        }
        // not found: log what the screen offers, so labels can be matched
        val seen = mutableListOf<String>()
        for (root in roots) {
            val q = ArrayDeque<AccessibilityNodeInfo>().apply { add(root) }
            while (q.isNotEmpty() && seen.size < 80) {
                val n = q.removeFirst()
                val t = listOfNotNull(n.text?.toString(), n.contentDescription?.toString(), n.viewIdResourceName).filter { it.isNotBlank() }.joinToString("|")
                if (t.isNotEmpty()) seen.add((if (n.isClickable) "*" else "") + t)
                for (i in 0 until n.childCount) n.getChild(i)?.let { q.add(it) }
            }
        }
        lastScreen = seen.joinToString(" ; ")
        android.util.Log.i("DConnect", "clickByLabel $labels not found; screen: $lastScreen")
        return false
    }

    private fun focused(): AccessibilityNodeInfo? = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

    private fun setText(n: AccessibilityNodeInfo, t: String) {
        n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, t) })
        n.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, Bundle().apply {
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, t.length)
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, t.length)
        })
    }

    companion object {
        var instance: ControlService? = null
        fun volumeFallback(ctx: Context, action: String) {
            val dir = when (action) { "volup" -> AudioManager.ADJUST_RAISE; "voldown" -> AudioManager.ADJUST_LOWER; else -> return }
            ctx.getSystemService(AudioManager::class.java).adjustStreamVolume(AudioManager.STREAM_MUSIC, dir, AudioManager.FLAG_SHOW_UI)
        }
    }
}
