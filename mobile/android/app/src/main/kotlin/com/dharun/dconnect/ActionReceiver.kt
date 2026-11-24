package com.dharun.dconnect

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, i: Intent) {
        when (i.action) {
            STOP_FIND -> FindPhone.stop()
            STOP_MIRROR -> MirrorService.stop(ctx)
        }
    }

    companion object {
        const val STOP_FIND = "com.dharun.dconnect.STOP_FIND"
        const val STOP_MIRROR = "com.dharun.dconnect.STOP_MIRROR"
    }
}
