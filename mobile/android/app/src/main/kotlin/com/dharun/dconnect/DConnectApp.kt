package com.dharun.dconnect

import android.app.Application
import io.flutter.FlutterInjector
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.FlutterEngineCache
import io.flutter.embedding.engine.dart.DartExecutor

// One Flutter engine for the life of the process: the link to the PC keeps running when the
// activity is closed (the foreground service keeps the process alive).
class DConnectApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifs.createChannels(this)
        val engine = FlutterEngine(this)
        Bridge.attach(this, engine)
        val loader = FlutterInjector.instance().flutterLoader()
        loader.startInitialization(this)
        loader.ensureInitializationComplete(this, null)
        engine.dartExecutor.executeDartEntrypoint(DartExecutor.DartEntrypoint.createDefault())
        FlutterEngineCache.getInstance().put(ENGINE, engine)
    }

    companion object {
        const val ENGINE = "dconnect"
    }
}
