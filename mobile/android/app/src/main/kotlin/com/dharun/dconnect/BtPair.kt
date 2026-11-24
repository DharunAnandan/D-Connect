package com.dharun.dconnect

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build

// Pair with the PC for call audio without opening Bluetooth settings: the PC sends its
// adapter address over the D-Connect link and we bond with it directly. Android and the PC
// each show a confirm prompt; that's the only thing the user does.
object BtPair {
    private var receiver: BroadcastReceiver? = null

    @SuppressLint("MissingPermission")
    fun start(ctx: Context, address: String): Map<String, Any?> {
        val adapter = ctx.getSystemService(BluetoothManager::class.java)?.adapter ?: return fail("This phone has no Bluetooth")
        if (Build.VERSION.SDK_INT >= 31 && ctx.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return fail("Allow Nearby devices for D-Connect", "permission")
        }
        if (!adapter.isEnabled) return fail("Turn on Bluetooth on the phone")
        val device = try { adapter.getRemoteDevice(address.uppercase()) } catch (e: Exception) { return fail("Bad PC address") }
        if (device.bondState == BluetoothDevice.BOND_BONDED) {
            Bridge.emit("bt.bond", mapOf("state" to "bonded"))
            return mapOf("ok" to true)
        }
        watch(ctx, address.uppercase())
        try { adapter.cancelDiscovery() } catch (_: Exception) {}
        val started = device.createBond()
        if (!started) return fail("The phone could not start pairing")
        Bridge.emit("bt.bond", mapOf("state" to "bonding"))
        return mapOf("ok" to true)
    }

    private fun watch(ctx: Context, address: String) {
        receiver?.let { try { ctx.unregisterReceiver(it) } catch (_: Exception) {} }
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                @Suppress("DEPRECATION")
                val d: BluetoothDevice? = if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java) else i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                if (d?.address?.uppercase() != address) return
                when (i.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1)) {
                    BluetoothDevice.BOND_BONDED -> { Bridge.emit("bt.bond", mapOf("state" to "bonded")); stop(c) }
                    BluetoothDevice.BOND_NONE -> { Bridge.emit("bt.bond", mapOf("state" to "failed", "message" to "Pairing was cancelled or timed out")); stop(c) }
                }
            }
        }
        receiver = r
        val f = IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(r, f, Context.RECEIVER_EXPORTED) else ctx.registerReceiver(r, f)
    }

    private fun stop(ctx: Context) {
        receiver?.let { try { ctx.unregisterReceiver(it) } catch (_: Exception) {} }
        receiver = null
    }

    private fun fail(message: String, reason: String? = null): Map<String, Any?> {
        Bridge.emit("bt.bond", mapOf("state" to "failed", "message" to message))
        return mapOf("ok" to false, "message" to message, "reason" to reason)
    }
}
