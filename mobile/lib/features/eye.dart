// 20-20-20 on the phone: mirrors the PC's timer, shows the break here at the same moment,
// and sends the result back so ending it on one device ends it on both.
import 'dart:async';

import 'package:flutter/material.dart';

import '../core/connection.dart';
import '../core/native.dart';

class EyeDay {
  final String date;
  final int done, skip, snooze;
  EyeDay(this.date, this.done, this.skip, this.snooze);
}

class Eye extends ChangeNotifier {
  Eye._();
  static final Eye I = Eye._();
  static final navigatorKey = GlobalKey<NavigatorState>();

  bool on = false;
  int? nextInMs;
  int everyMs = 20 * 60000;
  int seconds = 20;
  bool screenOn = true;
  bool showing = false;
  bool phoneCounts = true;
  DateTime statusAt = DateTime.now();
  List<EyeDay> days = [];
  int streak = 0;
  int best = 0;

  // a break in progress on the phone
  int? breakSeconds;
  DateTime? breakStarted;
  final _end = StreamController<String>.broadcast();
  Stream<String> get ended => _end.stream;

  void init() {
    final link = Link.I;
    link.on('eye.status').listen((m) {
      final d = m.data as Map;
      on = d['on'] == true;
      nextInMs = d['nextInMs'];
      everyMs = d['everyMs'] ?? everyMs;
      seconds = d['seconds'] ?? seconds;
      screenOn = d['screenOn'] != false;
      showing = d['showing'] == true;
      phoneCounts = d['phoneCounts'] != false;
      statusAt = DateTime.now();
      notifyListeners();
    });
    link.on('eye.stats').listen((m) {
      final d = m.data as Map;
      days = ((d['days'] as List?) ?? []).map((e) => EyeDay(e['date'], e['done'] ?? 0, e['skip'] ?? 0, e['snooze'] ?? 0)).toList();
      streak = d['streak'] ?? 0;
      best = d['best'] ?? 0;
      notifyListeners();
    });
    link.on('eye.start').listen((m) => _startBreak((m.data as Map)['seconds'] ?? 20));
    link.on('eye.end').listen((m) => _closeBreak(fromPc: true));
  }

  // remaining until the next break, counted down locally between status updates
  int get leftMs {
    if (!on || nextInMs == null) return 0;
    final passed = screenOn ? DateTime.now().difference(statusAt).inMilliseconds : 0;
    return (nextInMs! - passed).clamp(0, everyMs);
  }

  void _startBreak(int s) {
    breakSeconds = s;
    breakStarted = DateTime.now();
    notifyListeners();
    Native.vibrate([0, 60, 120, 60]);
    Native.showEyeBreakNotification(s);
    final nav = navigatorKey.currentState;
    if (nav != null) nav.pushNamed('/eyebreak');
  }

  void _closeBreak({bool fromPc = false}) {
    if (breakStarted == null) return;
    breakStarted = null;
    Native.cancelEyeBreakNotification();
    if (fromPc) _end.add('pc');
    notifyListeners();
  }

  // ended on the phone (done / skip / snooze)
  void finish(String result) {
    if (breakStarted == null) return;
    Link.I.send('eye.result', {'result': result});
    _closeBreak();
  }

  void takeNow() => Link.I.send('eye.take', {});
  void config({bool? enabled, int? minutes, int? secs, bool? counts, bool? sync}) => Link.I.send('eye.config', {
        if (enabled != null) 'on': enabled,
        if (minutes != null) 'minutes': minutes,
        if (secs != null) 'seconds': secs,
        if (counts != null) 'phoneCounts': counts,
        if (sync != null) 'sync': sync,
      });
}
