package com.dharun.dconnect

import android.content.Context
import android.os.VibrationEffect
import android.os.VibratorManager
import android.os.Build
import android.os.Vibrator

object Haptics {
    fun vibrator(ctx: Context): Vibrator = if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(VibratorManager::class.java).defaultVibrator
    else @Suppress("DEPRECATION") ctx.getSystemService(Vibrator::class.java)

    fun vibrate(ctx: Context, pattern: LongArray, repeat: Int = -1) {
        try { vibrator(ctx).vibrate(VibrationEffect.createWaveform(pattern, repeat)) } catch (_: Exception) {}
    }

    fun stop(ctx: Context) = try { vibrator(ctx).cancel() } catch (_: Exception) {}
}
