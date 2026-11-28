// App updates: optional (a banner) or required (a screen that blocks the app until updated).
//
// Two sources decide it:
//  * the update file online (docs/latest.json in the repo): the newest phone app and the oldest
//    one still allowed;
//  * the PC itself: when linking, it says the oldest phone app it works with.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'native.dart';

class AppLinks {
  // update info for both apps; must be publicly readable
  static const manifest = 'https://raw.githubusercontent.com/DharunAnandan/D-Connect/main/docs/latest.json';
  static const playStore = 'https://play.google.com/store/apps/details?id=com.dharun.dconnect';
  static const playMarket = 'market://details?id=com.dharun.dconnect';
  // the PC app in each PC store
  static const pcUbuntu = 'https://snapcraft.io/d-connect';
  static const pcWindows = 'https://apps.microsoft.com/detail/9N981DC1LCQ6';
}

int cmpVersion(String a, String b) {
  List<int> p(String v) => v.split(RegExp(r'[+-]')).first.split('.').map((x) => int.tryParse(x) ?? 0).toList();
  final x = p(a), y = p(b);
  for (var i = 0; i < (x.length > y.length ? x.length : y.length); i++) {
    final d = (i < x.length ? x[i] : 0) - (i < y.length ? y[i] : 0);
    if (d != 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

class Updates extends ChangeNotifier {
  Updates._();
  static final Updates I = Updates._();

  String version = ''; // installed, as Android knows it
  bool fromPlay = false;
  String latest = '';
  String min = '';
  String notes = '';
  String apk = '';
  String? pcVersion; // the linked PC's app version
  String? pcMinPhone; // the oldest phone app the linked PC works with
  String? pcLatest; // newest PC app (from the update file)
  String? pcMin; // oldest PC app still allowed
  String _skipped = '';
  Timer? _timer;

  bool get force => (min.isNotEmpty && cmpVersion(version, min) < 0) || (pcMinPhone != null && cmpVersion(version, pcMinPhone!) < 0);
  bool get optional => !force && latest.isNotEmpty && cmpVersion(version, latest) < 0 && _skipped != latest;
  // the PC app is older than it should be (told to the user here; the PC shows its own too)
  bool get pcOld => pcVersion != null && pcLatest != null && cmpVersion(pcVersion!, pcLatest!) < 0;
  String get why => pcMinPhone != null && cmpVersion(version, pcMinPhone!) < 0
      ? 'Your PC has a newer D-Connect that needs a newer phone app.'
      : 'This version of D-Connect is no longer supported.';

  Future<void> init(Map<String, dynamic> info) async {
    version = (info['app'] as String?) ?? '';
    fromPlay = info['store'] == true;
    final prefs = await SharedPreferences.getInstance();
    _skipped = prefs.getString('updateSkipped') ?? '';
    unawaited(check());
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(hours: 6), (_) => check());
  }

  Future<void> check() async {
    try {
      final c = HttpClient()..connectionTimeout = const Duration(seconds: 8);
      final req = await c.getUrl(Uri.parse(AppLinks.manifest));
      final res = await req.close().timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return;
      final j = jsonDecode(await res.transform(utf8.decoder).join()) as Map<String, dynamic>;
      c.close();
      final a = Map<String, dynamic>.from(j['android'] ?? {});
      latest = '${a['latest'] ?? ''}';
      min = '${a['min'] ?? ''}';
      notes = '${a['notes'] ?? ''}';
      apk = '${a['apk'] ?? ''}';
      final d = Map<String, dynamic>.from(j['desktop'] ?? {});
      pcLatest = d['latest'] as String?;
      pcMin = d['min'] as String?;
      notifyListeners();
    } catch (_) {
      // offline or the file isn't reachable: say nothing
    }
  }

  void fromPc(Map w) {
    pcVersion = w['app'] as String?;
    pcMinPhone = w['minPhone'] as String?;
    notifyListeners();
  }

  Future<void> skip() async {
    _skipped = latest;
    (await SharedPreferences.getInstance()).setString('updateSkipped', latest);
    notifyListeners();
  }

  // updates always come from Google Play (the Play app if it's there, else its web page)
  void open() => openPlay();
  static void openPlay() => Native.call('openUrl', {'url': AppLinks.playMarket, 'fallback': AppLinks.playStore});
}
