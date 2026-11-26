// Decides between pairing and the app, and plays the connect moment on every new link.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/connection.dart';
import '../../core/native.dart';
import '../../core/protocol.dart';
import '../../features/bridge.dart';
import '../../theme/tokens.dart';
import '../widgets/connect_scene.dart';
import '../widgets/update_gate.dart';
import 'home_shell.dart';
import 'pair_screen.dart';

class Root extends StatefulWidget {
  const Root({super.key});
  @override
  State<Root> createState() => _RootState();
}

class _RootState extends State<Root> with WidgetsBindingObserver {
  SceneState? _celebrate;
  bool _was = false;
  final _timers = <Timer>[];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Link.I.addListener(_onLink);
    _was = Link.I.connected;
    // dconnect://pair?... opened from a camera app or a link
    Native.events.where((e) => e['type'] == 'pairLink').listen((e) {
      final p = PairPayload.parse(e['data'] as String? ?? '');
      if (p != null) Link.I.pair(p);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    Link.I.removeListener(_onLink);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) {
      Link.I.nudge();
      Future.delayed(const Duration(milliseconds: 400), Bridge.syncClipboardFromPhone);
    }
  }

  void _onLink() {
    final now = Link.I.connected;
    if (now && !_was) {
      HapticFeedback.mediumImpact();
      for (final t in _timers) {
        t.cancel();
      }
      setState(() => _celebrate = SceneState.found);
      _timers
        ..add(Timer(const Duration(milliseconds: 650), () {
          if (mounted) setState(() => _celebrate = SceneState.handshake);
        }))
        ..add(Timer(const Duration(milliseconds: 1350), () {
          HapticFeedback.heavyImpact();
          if (mounted) setState(() => _celebrate = SceneState.connected);
        }))
        ..add(Timer(const Duration(milliseconds: 2700), () {
          if (mounted) setState(() => _celebrate = null);
        }));
    }
    _was = now;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final paired = Link.I.pc != null;
    return Stack(children: [
      AnimatedSwitcher(
        duration: M.slow,
        switchInCurve: M.ease,
        transitionBuilder: (c, a) => FadeTransition(opacity: a, child: ScaleTransition(scale: Tween(begin: .97, end: 1.0).animate(a), child: c)),
        child: paired ? const HomeShell(key: ValueKey('home')) : const PairScreen(key: ValueKey('pair')),
      ),
      IgnorePointer(
        ignoring: _celebrate == null,
        child: AnimatedOpacity(
          opacity: _celebrate == null ? 0 : 1,
          duration: M.med,
          child: _celebrate == null
              ? const SizedBox.shrink()
              : Material(
                  color: C.ink950.withValues(alpha: .86),
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        ConnectScene(state: _celebrate!, phoneName: Link.I.deviceName, pcName: Link.I.pc?.name ?? 'PC', height: 300),
                        const SizedBox(height: 4),
                        // fixed height, centred, never wider than the screen: no jumping or overflow
                        SizedBox(
                          height: 74,
                          child: AnimatedSwitcher(
                            duration: M.fast,
                            child: _celebrate == SceneState.connected
                                ? Center(
                                    key: const ValueKey('c'),
                                    child: ShaderMask(
                                      shaderCallback: (r) => C.aurora.createShader(r),
                                      child: const Text('Connected', textAlign: TextAlign.center, style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white)),
                                    ),
                                  )
                                : Column(key: ValueKey(_celebrate), mainAxisAlignment: MainAxisAlignment.center, children: [
                                    Text(_celebrate == SceneState.handshake ? 'Securing the link…' : 'Found', textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                                    if (_celebrate != SceneState.handshake) ...[
                                      const SizedBox(height: 4),
                                      Text(Link.I.pc?.name ?? 'your PC', maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: .75))),
                                    ],
                                  ]),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(Link.I.via == 'usb' ? 'Over USB · encrypted' : 'Over Wi-Fi · encrypted', textAlign: TextAlign.center, style: const TextStyle(color: C.muted)),
                      ]),
                    ),
                  ),
                ),
        ),
      ),
      const Positioned.fill(child: UpdateGate()),
    ]);
  }
}
