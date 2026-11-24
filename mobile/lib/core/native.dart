// The Kotlin side (android/app/src/main/kotlin/com/dharun/dconnect): notifications, SMS, calls,
// photos, screen capture, accessibility input, media sessions, find-my-phone.
import 'dart:async';
import 'package:flutter/services.dart';

class Native {
  static const _m = MethodChannel('dconnect/native');
  static const _events = EventChannel('dconnect/events');
  static const _video = EventChannel('dconnect/video');

  static Stream<Map<String, dynamic>>? _ev;
  static Stream<Map<String, dynamic>> get events => _ev ??= _events.receiveBroadcastStream().map((e) => Map<String, dynamic>.from(e as Map)).asBroadcastStream();
  static Stream<Map<String, dynamic>> get video => _video.receiveBroadcastStream().map((e) => Map<String, dynamic>.from(e as Map));

  static Future<T?> call<T>(String method, [Map<String, dynamic>? args]) async {
    try {
      return await _m.invokeMethod<T>(method, args);
    } on PlatformException {
      return null;
    } on MissingPluginException {
      return null;
    }
  }

  static Future<List<dynamic>> list(String method, [Map<String, dynamic>? args]) async => (await call<List<dynamic>>(method, args)) ?? [];
  static Future<Map<String, dynamic>> map(String method, [Map<String, dynamic>? args]) async => Map<String, dynamic>.from((await call<Map>(method, args)) ?? {});

  static Future<Map<String, dynamic>> deviceInfo() => map('deviceInfo');
  static Future<Map<String, dynamic>> status() => map('status');
  static Future<Map<String, dynamic>> permissions() => map('permissions');
  static Future<void> keepAlive(bool on, String pcName) => call('keepAlive', {'on': on, 'pc': pcName});
  static Future<void> openSetting(String which) => call('openSetting', {'which': which});
  static Future<void> vibrate(List<int> pattern) => call('vibrate', {'pattern': pattern});
  static Future<void> showEyeBreakNotification(int seconds) => call('eyeNotification', {'seconds': seconds});
  static Future<void> cancelEyeBreakNotification() => call('eyeNotificationCancel');
  static Future<String?> saveDownload(String path, String name, String? mime) => call<String>('saveDownload', {'path': path, 'name': name, 'mime': mime});
  static Future<void> openUri(String uri) => call('openUri', {'uri': uri});
  static Future<void> openFile(String uri) => call('openFile', {'uri': uri});
}
