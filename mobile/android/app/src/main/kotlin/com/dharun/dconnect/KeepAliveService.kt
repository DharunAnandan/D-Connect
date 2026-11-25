package com.dharun.dconnect

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.provider.Telephony as SysTelephony
import android.telephony.TelephonyManager

// Keeps the process (and the Dart engine with the PC link) alive, and listens for the system
// events the PC cares about: screen on/off (eye care), battery, SMS, calls.
class KeepAliveService : Service() {
    private var callSince = 0L
    private var lastCallState = TelephonyManager.EXTRA_STATE_IDLE

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, i: Intent) {
            when (i.action) {
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> Bridge.emit("screen", true)
                Intent.ACTION_SCREEN_OFF -> Bridge.emit("screen", false)
                Intent.ACTION_BATTERY_CHANGED, Intent.ACTION_POWER_CONNECTED, Intent.ACTION_POWER_DISCONNECTED -> Bridge.emit("battery", null)
                SysTelephony.Sms.Intents.SMS_RECEIVED_ACTION -> onSms(i)
                TelephonyManager.ACTION_PHONE_STATE_CHANGED -> onCall(i)
                android.bluetooth.BluetoothAdapter.ACTION_STATE_CHANGED -> {
                    val st = i.getIntExtra(android.bluetooth.BluetoothAdapter.EXTRA_STATE, -1)
                    if (st == android.bluetooth.BluetoothAdapter.STATE_ON) Bridge.emit("bt.state", mapOf("on" to true))
                    if (st == android.bluetooth.BluetoothAdapter.STATE_OFF) Bridge.emit("bt.state", mapOf("on" to false))
                }
            }
        }
    }

    private var lastBattery = -1

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val n = Notifs.keepAlive(this, intent?.getStringExtra("pc"))
        if (Build.VERSION.SDK_INT >= 29) startForeground(Notifs.KEEP_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        else startForeground(Notifs.KEEP_ID, n)
        return START_STICKY
    }

    // While linked to the PC, keep Wi-Fi responsive with the screen off. (A CPU wake lock does
    // not help on OnePlus/Oppo: their battery manager freezes the app regardless, unless
    // "Allow background activity" is on for D-Connect. Settings → "Work when locked" opens it.)
    private var wifi: android.net.wifi.WifiManager.WifiLock? = null

    override fun onCreate() {
        super.onCreate()
        CallLines.start(this)
        try {
            @Suppress("DEPRECATION")
            val mode = if (Build.VERSION.SDK_INT >= 29) android.net.wifi.WifiManager.WIFI_MODE_FULL_LOW_LATENCY else android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF
            wifi = applicationContext.getSystemService(android.net.wifi.WifiManager::class.java)
                .createWifiLock(mode, "dconnect:link").apply { setReferenceCounted(false); acquire() }
        } catch (_: Exception) {}
        val f = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(SysTelephony.Sms.Intents.SMS_RECEIVED_ACTION)
            addAction(TelephonyManager.ACTION_PHONE_STATE_CHANGED)
            addAction(android.bluetooth.BluetoothAdapter.ACTION_STATE_CHANGED)
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, f, RECEIVER_EXPORTED) else registerReceiver(receiver, f)
        // battery level: only tell the PC when it moves
        val bf = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryReceiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                val level = i.getIntExtra("level", -1)
                if (level != lastBattery) {
                    lastBattery = level
                    Bridge.emit("battery", null)
                }
            }
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(batteryReceiver, bf, RECEIVER_NOT_EXPORTED) else registerReceiver(batteryReceiver, bf)
    }

    override fun onDestroy() {
        try { unregisterReceiver(receiver) } catch (_: Exception) {}
        try { wifi?.release() } catch (_: Exception) {}
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        // the call in progress (for a PC that connects mid-call)
        @Volatile var current: Map<String, Any?>? = null
        @Volatile var lastNumber: String? = null
    }

    // Report where the call's audio really is (the PC over Bluetooth, the receiver, the
    // loudspeaker), so the PC's call card shows the truth even when it's changed on the phone.
    private val routeHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var lastRoute: Map<String, Any?>? = null
    private val routeTick = object : Runnable {
        override fun run() {
            val r = currentRoute()
            if (r != lastRoute) {
                lastRoute = r
                Bridge.emit("call.audio", r)
            }
            routeHandler.postDelayed(this, 1000)
        }
    }

    private fun currentRoute(): Map<String, Any?> {
        val am = getSystemService(android.media.AudioManager::class.java)
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            val d = am.communicationDevice
            return when (d?.type) {
                android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> mapOf("route" to "bluetooth", "address" to d.address)
                android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> mapOf("route" to "speaker")
                android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET, android.media.AudioDeviceInfo.TYPE_WIRED_HEADPHONES, android.media.AudioDeviceInfo.TYPE_USB_HEADSET -> mapOf("route" to "headset")
                else -> mapOf("route" to "receiver")
            }
        }
        @Suppress("DEPRECATION")
        return when {
            am.isBluetoothScoOn -> mapOf("route" to "bluetooth")
            am.isSpeakerphoneOn -> mapOf("route" to "speaker")
            else -> mapOf("route" to "receiver")
        }
    }

    private fun watchRoute() {
        routeHandler.removeCallbacks(routeTick)
        lastRoute = null
        routeHandler.post(routeTick)
    }

    private fun stopRouteWatch() {
        routeHandler.removeCallbacks(routeTick)
        lastRoute = null
    }

    private fun onSms(i: Intent) {
        val msgs = SysTelephony.Sms.Intents.getMessagesFromIntent(i) ?: return
        if (msgs.isEmpty()) return
        val address = msgs[0].displayOriginatingAddress ?: ""
        val body = msgs.joinToString("") { it.displayMessageBody ?: "" }
        Bridge.emit("sms.received", mapOf(
            "id" to "r${System.currentTimeMillis()}",
            "threadId" to "",
            "address" to address,
            "name" to Telephony.contactName(this, address),
            "body" to body,
            "date" to System.currentTimeMillis(),
            "out" to false
        ))
    }

    private fun onCall(i: Intent) {
        val state = i.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        @Suppress("DEPRECATION")
        val number = i.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
        // the broadcast comes twice (with and without the number): skip the empty one
        if (state == lastCallState && number == null) return
        if (state == TelephonyManager.EXTRA_STATE_OFFHOOK && callSince == 0L) callSince = System.currentTimeMillis()
        if (state == TelephonyManager.EXTRA_STATE_IDLE) callSince = 0L
        if (state == TelephonyManager.EXTRA_STATE_OFFHOOK) watchRoute() else stopRouteWatch()
        lastCallState = state
        if (number != null && state == TelephonyManager.EXTRA_STATE_RINGING && CallLines.snapshot() == null) lastNumber = number
        if (state == TelephonyManager.EXTRA_STATE_IDLE) lastNumber = null
        // every call as its own line (call waiting, hold, swap, merge), sent to the PC
        CallLines.onPhoneState(state, number)
        // keep the call in front across app restarts (Android only gives the number at the start)
        val m = current
        getSharedPreferences("dc_call", MODE_PRIVATE).edit().apply {
            if (m == null) clear() else {
                putString("state", m["state"] as String?); putString("number", m["number"] as String?); putString("name", m["name"] as String?)
                putLong("since", (m["since"] as Long?) ?: 0L)
            }
        }.apply()
    }
}
