package com.dharun.dconnect

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.StatFs
import android.os.Environment
import android.provider.Settings
import android.telephony.TelephonyManager
import android.widget.Toast
import androidx.core.app.NotificationManagerCompat
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugins.GeneratedPluginRegistrant
import java.util.concurrent.Executors

// The one place Dart talks to Android. Slow calls (SMS, photos, files) run off the main thread.
object Bridge {
    lateinit var ctx: Context
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newFixedThreadPool(3)
    private var events: EventChannel.EventSink? = null
    private var video: EventChannel.EventSink? = null
    private val backlog = mutableListOf<Map<String, Any?>>()

    fun isReady() = ::ctx.isInitialized

    fun attach(context: Context, engine: FlutterEngine) {
        ctx = context.applicationContext
        GeneratedPluginRegistrant.registerWith(engine)
        val m = engine.dartExecutor.binaryMessenger
        MethodChannel(m, "dconnect/native").setMethodCallHandler { call, result -> handle(call, result) }
        EventChannel(m, "dconnect/events").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(args: Any?, sink: EventChannel.EventSink) {
                events = sink
                backlog.forEach { sink.success(it) }
                backlog.clear()
            }
            override fun onCancel(args: Any?) { events = null }
        })
        EventChannel(m, "dconnect/video").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(args: Any?, sink: EventChannel.EventSink) { video = sink }
            override fun onCancel(args: Any?) { video = null }
        })
    }

    fun emit(type: String, data: Any?) {
        val e = mapOf("type" to type, "data" to data)
        main.post { events?.success(e) ?: backlog.add(e) }
    }

    fun frame(data: ByteArray, config: Boolean, key: Boolean, pts: Long) {
        main.post { video?.success(mapOf("data" to data, "config" to config, "key" to key, "pts" to pts)) }
    }

    private fun bg(result: MethodChannel.Result, fn: () -> Any?) {
        io.execute {
            val r = try { Result.success(fn()) } catch (e: Exception) { Result.failure(e) }
            main.post { r.fold({ result.success(it) }, { result.error("ERR", it.message, null) }) }
        }
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        val a = { k: String -> call.argument<Any>(k) }
        when (call.method) {
            "deviceInfo" -> result.success(mapOf(
                "name" to (Settings.Global.getString(ctx.contentResolver, "device_name") ?: Build.MODEL),
                "model" to "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}",
                "android" to Build.VERSION.RELEASE
            ))
            "status" -> result.success(status())
            "btInfo" -> result.success(btInfo())
            "btPair" -> result.success(BtPair.start(ctx, a("address") as String))
            "btRefresh" -> result.success(BtPair.refresh(ctx, a("address") as String))
            "btEnsure" -> result.success(ensureBluetooth())
            "permissions" -> result.success(permissions())
            "keepAlive" -> {
                val i = Intent(ctx, KeepAliveService::class.java).putExtra("pc", a("pc") as String?)
                if (a("on") == true) ctx.startForegroundService(i) else ctx.stopService(i)
                result.success(null)
            }
            "openSetting" -> { openSetting(a("which") as String); result.success(null) }
            "vibrate" -> { Haptics.vibrate(ctx, (a("pattern") as List<*>).map { (it as Number).toLong() }.toLongArray()); result.success(null) }
            "toast" -> { Toast.makeText(ctx, a("text") as String, Toast.LENGTH_SHORT).show(); result.success(null) }
            "eyeNotification" -> { Notifs.eyeBreak(ctx, (a("seconds") as Number).toInt()); result.success(null) }
            "eyeNotificationCancel" -> { Notifs.cancel(ctx, Notifs.EYE_ID); result.success(null) }
            "openUri" -> { openUri(a("uri") as String); result.success(null) }
            "openFile" -> { Files.open(ctx, a("uri") as String); result.success(null) }
            "saveDownload" -> bg(result) { Files.saveDownload(ctx, a("path") as String, a("name") as String) }
            // notifications
            "notifications" -> result.success(NotifListener.current())
            "notifDismiss" -> { NotifListener.dismiss(a("key") as String); result.success(null) }
            "notifReply" -> result.success(NotifListener.reply(a("key") as String, a("text") as String))
            "notifAction" -> { NotifListener.action(a("key") as String, (a("index") as Number).toInt()); result.success(null) }
            // telephony
            "smsThreads" -> bg(result) { Telephony.threads(ctx) }
            "smsMessages" -> bg(result) { Telephony.messages(ctx, a("threadId").toString()) }
            "smsSend" -> bg(result) { Telephony.send(ctx, a("address") as String, a("body") as String) }
            "contacts" -> bg(result) { Telephony.searchContacts(ctx, a("q") as String? ?: "") }
            "callLog" -> bg(result) { Telephony.callLog(ctx) }
            "callAnswer" -> { Telephony.answer(ctx); result.success(null) }
            "callEnd" -> { Telephony.end(ctx); result.success(null) }
            "callDial" -> { Telephony.dial(ctx, a("number") as String, (a("sim") as? Number)?.toInt()); result.success(null) }
            "sims" -> bg(result) { Telephony.sims(ctx) }
            "callControl" -> result.success(Telephony.control(ctx, a("action") as String, a("target") as String?))
            "callCurrent" -> result.success(Telephony.currentCall(ctx))
            "callRouteBt" -> { Telephony.routeToBluetooth(ctx); result.success(null) }
            "callMute" -> { Telephony.mute(ctx, a("muted") == true); result.success(null) }
            // photos
            "apps" -> bg(result) { AppsList.list(ctx) }
            "photos" -> bg(result) { Photos.list(ctx, (a("offset") as Number).toInt(), (a("limit") as Number).toInt()) }
            "photoFile" -> bg(result) { Photos.file(ctx, a("id").toString()) }
            // extras
            "findPhone" -> { if (a("on") == true) FindPhone.start(ctx) else FindPhone.stop(); result.success(null) }
            "setDnd" -> { setDnd(a("on") == true); result.success(null) }
            "mediaCmd" -> { MediaSessions.command(ctx, a("cmd") as String); result.success(null) }
            "mediaState" -> result.success(MediaSessions.state(ctx))
            // mirror + control
            "mirrorStart" -> result.success(startMirror(call.arguments as? Map<*, *> ?: emptyMap<String, Any>()))
            "mirrorStop" -> { MirrorService.stop(ctx); result.success(null) }
            "mirrorKeyframe" -> { MirrorService.instance?.requestKeyframe(); result.success(null) }
            "controlAvailable" -> result.success(ControlService.instance != null)
            "inputTouch" -> { ControlService.instance?.touch(a("action") as String, (a("x") as Number).toFloat(), (a("y") as Number).toFloat()); result.success(null) }
            "inputScroll" -> { ControlService.instance?.scroll((a("x") as Number).toFloat(), (a("y") as Number).toFloat(), (a("dy") as Number).toFloat()); result.success(null) }
            "inputKey" -> { ControlService.instance?.key(a("action") as String) ?: ControlService.volumeFallback(ctx, a("action") as String); result.success(null) }
            "inputText" -> { ControlService.instance?.text(a("text") as String); result.success(null) }
            else -> result.notImplemented()
        }
    }

    private fun startMirror(args: Map<*, *>): Map<String, Any?> {
        val opts = Bundle().apply {
            putInt("maxSize", (args["maxSize"] as? Number)?.toInt() ?: 1600)
            putInt("bitrate", (args["bitrate"] as? Number)?.toInt() ?: 8_000_000)
            putInt("fps", (args["fps"] as? Number)?.toInt() ?: 60)
        }
        val act = MainActivity.current
        return if (act != null && MainActivity.resumed) {
            main.post { act.requestMirror(opts) }
            mapOf("ok" to true)
        } else {
            // Android won't let us pop the consent dialog from the background: ask with a notification
            Notifs.mirrorRequest(ctx, opts)
            mapOf("ok" to true, "pending" to true)
        }
    }

    fun status(): Map<String, Any?> {
        val bm = ctx.getSystemService(BatteryManager::class.java)
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val charging = bm.isCharging
        val cm = ctx.getSystemService(ConnectivityManager::class.java)
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        val network = when {
            caps == null -> "none"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
            else -> "other"
        }
        val tm = ctx.getSystemService(TelephonyManager::class.java)
        val signal = try { if (Build.VERSION.SDK_INT >= 28) tm.signalStrength?.level else null } catch (e: Exception) { null }
        val stat = StatFs(Environment.getDataDirectory().path)
        val nm = ctx.getSystemService(NotificationManager::class.java)
        return mapOf(
            "battery" to level,
            "charging" to charging,
            "network" to network,
            "carrier" to (tm.networkOperatorName ?: ""),
            "signal" to signal,
            "storageFree" to stat.availableBytes,
            "storageTotal" to stat.totalBytes,
            "dnd" to (nm.currentInterruptionFilter > NotificationManager.INTERRUPTION_FILTER_ALL),
            "screenOn" to ctx.getSystemService(PowerManager::class.java).isInteractive
        )
    }

    // The name the PC sees over Bluetooth, so it can pick this phone (and no other) for calls.
    private fun btInfo(): Map<String, Any?> {
        val adapterName = try {
            if (Build.VERSION.SDK_INT < 31 || ctx.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) == android.content.pm.PackageManager.PERMISSION_GRANTED)
                ctx.getSystemService(android.bluetooth.BluetoothManager::class.java)?.adapter?.name
            else null
        } catch (e: SecurityException) { null }
        val enabled = try { ctx.getSystemService(android.bluetooth.BluetoothManager::class.java)?.adapter?.isEnabled == true } catch (e: Exception) { false }
        return mapOf("name" to (adapterName ?: Settings.Global.getString(ctx.contentResolver, "device_name") ?: Build.MODEL), "enabled" to enabled)
    }

    // Android doesn't let apps switch Bluetooth on silently: show its one-tap prompt (or a
    // notification that opens it when D-Connect isn't on screen).
    private fun ensureBluetooth(): Boolean {
        val adapter = ctx.getSystemService(android.bluetooth.BluetoothManager::class.java)?.adapter ?: return false
        if (adapter.isEnabled) return true
        val ask = Intent(android.bluetooth.BluetoothAdapter.ACTION_REQUEST_ENABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val act = MainActivity.current
        if (act != null && MainActivity.resumed) {
            main.post { try { act.startActivity(ask) } catch (_: Exception) {} }
        } else {
            val pi = android.app.PendingIntent.getActivity(ctx, 77, ask, android.app.PendingIntent.FLAG_IMMUTABLE)
            val n = androidx.core.app.NotificationCompat.Builder(ctx, Notifs.ALERT)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentTitle("Turn on Bluetooth for calls on your PC")
                .setContentText("Tap to turn it on")
                .setContentIntent(pi).setAutoCancel(true)
                .build()
            ctx.getSystemService(NotificationManager::class.java).notify(77, n)
        }
        return false
    }

    private fun permissions(): Map<String, Boolean> {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val pm = ctx.getSystemService(PowerManager::class.java)
        val enabledA11y = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
        return mapOf(
            "notifications" to NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName),
            "accessibility" to (ControlService.instance != null || enabledA11y.contains("${ctx.packageName}/")),
            "dnd" to nm.isNotificationPolicyAccessGranted,
            "battery" to pm.isIgnoringBatteryOptimizations(ctx.packageName)
        )
    }

    private fun openSetting(which: String) {
        val i = when (which) {
            "notifications" -> Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            "dnd" -> Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
            "bluetooth" -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
            "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { ctx.startActivity(i) } catch (e: Exception) {
            ctx.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private fun setDnd(on: Boolean) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (!nm.isNotificationPolicyAccessGranted) return
        nm.setInterruptionFilter(if (on) NotificationManager.INTERRUPTION_FILTER_PRIORITY else NotificationManager.INTERRUPTION_FILTER_ALL)
    }

    // A link from the PC: open it now if we're in front, otherwise a tap-to-open notification.
    private fun openUri(uri: String) {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (MainActivity.resumed) {
            try { ctx.startActivity(i); return } catch (_: Exception) {}
        }
        Notifs.link(ctx, uri)
    }

    @Suppress("unused")
    fun listenerComponent() = ComponentName(ctx, NotifListener::class.java)
}
