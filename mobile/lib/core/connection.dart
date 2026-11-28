// The link to the PC. Finds it (USB via adb reverse -> mDNS -> saved IPs), connects over TLS
// pinned to the fingerprint from the pairing QR, does the hello/welcome handshake, keeps it
// alive and reconnects by itself.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:nsd/nsd.dart' as nsd;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'native.dart';
import 'updates.dart';
import 'protocol.dart';

enum LinkState { unpaired, searching, connecting, handshake, standby, connected }

class Link extends ChangeNotifier {
  Link._();
  static final Link I = Link._();

  LinkState state = LinkState.unpaired;
  String via = 'wifi';
  int rtt = 0;
  String? error;
  PairedPc? pc;
  late String deviceId;
  String deviceName = 'Android';
  String model = '';
  String android = '';
  String appVersion = '';

  WebSocket? _ws;
  bool _running = false;
  // Offline: the user turned D-Connect off (app switch or the quick-settings tile). Nothing
  // connects or searches until they turn it back on.
  bool offline = false;
  Timer? _retry;
  int _attempt = 0;
  nsd.Discovery? _discovery;
  final Map<String, String> _mdnsHosts = {}; // pc id -> host
  final _messages = StreamController<Envelope>.broadcast();
  final _binary = StreamController<({int channel, Map<String, dynamic> header, Uint8List payload})>.broadcast();
  final _pending = <String, Completer<dynamic>>{};

  Stream<Envelope> get messages => _messages.stream;
  Stream<({int channel, Map<String, dynamic> header, Uint8List payload})> get binary => _binary.stream;
  bool get connected => state == LinkState.connected;
  // linked and online, but the PC is using another paired phone right now
  bool get standby => state == LinkState.standby;
  String? activeElsewhere;
  bool pcIsOffline = false;

  // ask the PC to use this phone instead of the other one
  void claim() => _ws?.add(Envelope('standby.claim', {}).encode());

  Stream<Envelope> on(String type) => messages.where((m) => m.type == type);

  // ---------------------------------------------------------------- setup
  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    deviceId = prefs.getString('deviceId') ?? const Uuid().v4();
    await prefs.setString('deviceId', deviceId);
    final saved = prefs.getString('pc');
    if (saved != null) pc = PairedPc.fromJson(jsonDecode(saved));
    final info = await Native.deviceInfo();
    deviceName = prefs.getString('deviceName') ?? info['name'] ?? 'Android';
    model = info['model'] ?? '';
    android = info['android'] ?? '';
    appVersion = info['app'] ?? '';
    unawaited(Updates.I.init(info));
    await prefs.reload(); // the tile may have changed it while the app wasn't running
    offline = prefs.getBool('offline') ?? false;
    state = pc == null ? LinkState.unpaired : LinkState.searching;
    notifyListeners();
    if (pc != null && !offline) start();
  }

  // turn D-Connect off: disconnect from every PC and stop looking until it's turned on again
  Future<void> goOffline() async {
    // tell the PC it's on purpose, so it shows "offline" there instead of looking for us
    if (_ws != null) {
      send('link.offline', {});
      await Future.delayed(const Duration(milliseconds: 200));
    }
    offline = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('offline', true);
    stop();
    Native.call('linkState', {'on': false});
    if (pc != null) Native.keepAlive(false, pc!.name);
    state = pc == null ? LinkState.unpaired : LinkState.searching;
    notifyListeners();
  }

  // turn it back on: look for the PC and connect
  Future<void> goOnline() async {
    offline = false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('offline', false);
    notifyListeners();
    _attempt = 0;
    start();
  }

  Future<void> _savePc() async {
    final prefs = await SharedPreferences.getInstance();
    if (pc == null) {
      await prefs.remove('pc');
    } else {
      await prefs.setString('pc', jsonEncode(pc!.toJson()));
    }
  }

  // ---------------------------------------------------------------- pairing
  // Connects with the one-time token from the QR. Resolves true once the PC accepted us.
  Future<bool> pair(PairPayload p) async {
    stop();
    if (offline) {
      offline = false; // pairing means you want it on
      (await SharedPreferences.getInstance()).setBool('offline', false);
    }
    final candidate = PairedPc(id: p.id, name: p.name, hosts: p.hosts, port: p.port, fp: p.fp, key: '');
    state = LinkState.connecting;
    error = null;
    notifyListeners();
    for (final host in ['127.0.0.1', ...p.hosts]) {
      final ok = await _connect(candidate, host, token: p.token);
      if (ok) {
        _running = true;
        _startDiscovery();
        return true;
      }
    }
    state = pc == null ? LinkState.unpaired : LinkState.searching;
    error ??= 'Could not reach ${p.name}. Same Wi-Fi?';
    notifyListeners();
    if (pc != null) start();
    return false;
  }

  Future<void> forget() async {
    stop();
    pc = null;
    await _savePc();
    state = LinkState.unpaired;
    notifyListeners();
  }

  // ---------------------------------------------------------------- the loop
  void start() {
    if (_running || pc == null || offline) return;
    _running = true;
    _startDiscovery();
    _loop();
  }

  void stop() {
    _running = false;
    _retry?.cancel();
    _ws?.close(1000);
    _ws = null;
    _stopDiscovery();
  }

  // the app came to the front or the network changed: try now
  void nudge() {
    if (offline || !_running || connected || standby || state == LinkState.connecting) return;
    _retry?.cancel();
    _attempt = 0;
    _loop();
  }

  Future<void> _loop() async {
    if (!_running || connected || standby || pc == null) return;
    state = LinkState.searching;
    notifyListeners();
    final hosts = <String>{'127.0.0.1', if (_mdnsHosts[pc!.id] != null) _mdnsHosts[pc!.id]!, ...pc!.hosts};
    for (final h in hosts) {
      if (!_running) return;
      if (await _connect(pc!, h)) return;
    }
    // Not at any address we know, and network discovery found nothing: that's the PC on this
    // phone's own hotspot (Android picks a new address range each time and doesn't discover
    // there), or a PC whose address changed. Look for the port on our local networks. Only a PC
    // with the paired certificate is accepted, so a stranger's machine can't answer.
    if (_attempt % 3 == 0) {
      for (final h in await _scanLocal(pc!.port)) {
        if (!_running || hosts.contains(h)) continue;
        if (await _connect(pc!, h)) return;
      }
    }
    if (!_running) return;
    state = LinkState.searching;
    notifyListeners();
    _attempt++;
    final wait = Duration(milliseconds: min(15000, 1500 * _attempt));
    _retry = Timer(wait, _loop);
  }

  // Every address on this phone's local IPv4 networks (Wi-Fi, its hotspot, USB tethering) with
  // something listening on [port]. A /24 takes about half a second.
  Future<List<String>> _scanLocal(int port) async {
    final found = <String>[];
    try {
      final mine = <String>{};
      final bases = <String>{};
      for (final i in await NetworkInterface.list(type: InternetAddressType.IPv4)) {
        if (RegExp(r'^(rmnet|ccmni|lo|dummy|tun|ppp|v4-)').hasMatch(i.name)) continue; // mobile data, VPN
        for (final a in i.addresses) {
          final p = a.address.split('.');
          final private = p.length == 4 && (p[0] == '10' || (p[0] == '192' && p[1] == '168') || (p[0] == '172' && (int.tryParse(p[1]) ?? 0) >= 16 && (int.tryParse(p[1]) ?? 0) <= 31));
          if (!private) continue;
          mine.add(a.address);
          bases.add('${p[0]}.${p[1]}.${p[2]}');
        }
      }
      for (final b in bases) {
        final probes = <Future<String?>>[
          for (var n = 1; n < 255; n++)
            if (!mine.contains('$b.$n'))
              Socket.connect('$b.$n', port, timeout: const Duration(milliseconds: 600)).then<String?>((s) {
                s.destroy();
                return '$b.$n';
              }).catchError((_) => null),
        ];
        found.addAll((await Future.wait(probes)).whereType<String>());
      }
    } catch (_) {}
    return found;
  }

  Future<bool> _connect(PairedPc target, String host, {String? token}) async {
    final client = HttpClient()
      ..connectionTimeout = Duration(milliseconds: host == '127.0.0.1' ? 900 : 3500)
      ..badCertificateCallback = (cert, h, port) => sha256.convert(cert.der).toString() == target.fp;
    WebSocket ws;
    try {
      state = LinkState.connecting;
      notifyListeners();
      ws = await WebSocket.connect('wss://$host:${target.port}', customClient: client).timeout(const Duration(seconds: 5));
    } catch (_) {
      return false;
    }
    state = LinkState.handshake;
    notifyListeners();
    final welcome = Completer<Map<String, dynamic>?>();
    late StreamSubscription sub;
    sub = ws.listen((raw) {
      if (raw is String) {
        final m = Envelope.parse(raw);
        if (m == null) return;
        if (!welcome.isCompleted) {
          if (m.type == 'welcome') welcome.complete(Map<String, dynamic>.from(m.data));
          if (m.type == 'pc.offline') {
            pcIsOffline = true; // not "forgotten": keep the pairing, try again later
            error = 'D-Connect on ${target.name} is set to offline. Turn it on there.';
            welcome.complete(null);
            return;
          }
          if (m.type == 'denied') {
            error = m.data?['reason'] == 'not-paired' ? 'This PC doesn\'t know this phone anymore. Pair again.' : 'Pairing was refused.';
            welcome.complete(null);
          }
          return;
        }
        _onText(m);
      } else if (raw is List<int>) {
        try {
          _binary.add(decodeBinary(raw is Uint8List ? raw : Uint8List.fromList(raw)));
        } catch (_) {}
      }
    }, onDone: () {
      if (!welcome.isCompleted) welcome.complete(null);
      if (_ws == ws) _onClosed();
    }, onError: (_) {});

    ws.add(Envelope('hello', {
      'v': protocolVersion,
      'deviceId': deviceId,
      'name': deviceName,
      'model': model,
      'android': android,
      'app': appVersion,
      if (token != null) 'token': token,
      if (token == null) 'key': target.key,
    }).encode());

    final w = await welcome.future.timeout(const Duration(seconds: 6), onTimeout: () => null);
    if (w == null) {
      await sub.cancel();
      ws.close();
      if (error != null && token == null && !pcIsOffline) {
        // the PC forgot us: stop trying with a dead key
        _running = false;
        state = LinkState.unpaired;
        pc = null;
        await _savePc();
        notifyListeners();
      }
      return false;
    }
    Updates.I.fromPc(w);
    if (w['key'] != null) target.key = w['key'];
    target.name = w['name'] ?? target.name;
    if (host != '127.0.0.1' && !target.hosts.contains(host)) target.hosts = [host, ...target.hosts];
    target.lastSeen = DateTime.now().millisecondsSinceEpoch;
    pc = target;
    await _savePc();
    _ws = ws;
    ws.pingInterval = const Duration(seconds: 15);
    via = host == '127.0.0.1' ? 'usb' : 'wifi';
    state = w['standby'] == true ? LinkState.standby : LinkState.connected;
    error = null;
    pcIsOffline = false;
    _attempt = 0;
    notifyListeners();
    Native.keepAlive(true, pc!.name);
    Native.call('linkState', {'on': true});
    return true;
  }

  void _onClosed() {
    _ws = null;
    Native.call('linkState', {'on': false});
    for (final c in _pending.values) {
      if (!c.isCompleted) c.completeError('disconnected');
    }
    _pending.clear();
    if (state == LinkState.connected || state == LinkState.standby) {
      state = LinkState.searching;
      notifyListeners();
    }
    if (_running) _retry = Timer(const Duration(milliseconds: 800), _loop);
  }

  void _onText(Envelope m) {
    if (m.type == 'ping') {
      send('pong', m.data);
      final t = m.data?['t'];
      if (t is int) rtt = max(0, DateTime.now().millisecondsSinceEpoch - t);
      return;
    }
    if (m.type == 'standby') {
      activeElsewhere = m.data?['active'] as String?;
      if (state != LinkState.standby) {
        state = LinkState.standby;
        notifyListeners();
      }
      return;
    }
    if (m.type == 'activated') {
      activeElsewhere = null;
      if (state != LinkState.connected) {
        state = LinkState.connected;
        notifyListeners();
      }
      return;
    }
    if (m.id != null && _pending.containsKey(m.id)) {
      _pending.remove(m.id)!.complete(m.data);
      return;
    }
    _messages.add(m);
  }

  // ---------------------------------------------------------------- sending
  bool send(String type, [dynamic data, String? id]) {
    final ws = _ws;
    if (ws == null || !connected) return false;
    ws.add(Envelope(type, data, id).encode());
    return true;
  }

  // answer a request from the PC
  void reply(Envelope req, String type, dynamic data) => send(type, data, req.id);

  bool sendBinary(int channel, Map<String, dynamic> header, List<int> payload) {
    final ws = _ws;
    if (ws == null || !connected) return false;
    ws.add(encodeBinary(channel, header, payload));
    return true;
  }

  Future<dynamic> request(String type, [dynamic data, Duration timeout = const Duration(seconds: 15)]) {
    final id = const Uuid().v4();
    final c = Completer<dynamic>();
    _pending[id] = c;
    if (!send(type, data, id)) {
      _pending.remove(id);
      return Future.error('not connected');
    }
    return c.future.timeout(timeout, onTimeout: () {
      _pending.remove(id);
      throw TimeoutException(type);
    });
  }

  // ---------------------------------------------------------------- mDNS
  Future<void> _startDiscovery() async {
    if (_discovery != null) return;
    try {
      _discovery = await nsd.startDiscovery(mdnsType, ipLookupType: nsd.IpLookupType.v4);
      _discovery!.addServiceListener((s, status) {
        if (status != nsd.ServiceStatus.found) return;
        final txt = s.txt ?? {};
        final id = txt['id'] != null ? utf8.decode(txt['id']!) : '';
        final ip = s.addresses?.firstOrNull?.address ?? s.host;
        if (id.isNotEmpty && ip != null) {
          _mdnsHosts[id] = ip;
          if (pc?.id == id && !connected) nudge();
        }
      });
    } catch (_) {
      // multicast blocked: saved IPs and USB still work
    }
  }

  Future<void> _stopDiscovery() async {
    final d = _discovery;
    _discovery = null;
    if (d != null) {
      try {
        await nsd.stopDiscovery(d);
      } catch (_) {}
    }
  }
}
