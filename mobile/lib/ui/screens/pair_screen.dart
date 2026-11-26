import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/connection.dart';
import '../../core/protocol.dart';
import '../../theme/tokens.dart';
import '../widgets/aurora.dart';
import '../widgets/connect_scene.dart';
import '../widgets/glass.dart';
import '../widgets/update_gate.dart';

class PairScreen extends StatefulWidget {
  const PairScreen({super.key});
  @override
  State<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends State<PairScreen> {
  bool _busy = false;

  Future<void> _pair(String raw) async {
    final p = PairPayload.parse(raw);
    if (p == null) {
      _snack('That isn\'t a D-Connect code.');
      return;
    }
    setState(() => _busy = true);
    final ok = await Link.I.pair(p);
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) _snack(Link.I.error ?? 'Could not connect.');
  }

  void _snack(String s) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s)));

  Future<void> _scan() async {
    final r = await Navigator.of(context).pushNamed('/scan');
    if (r is String) _pair(r);
  }

  Future<void> _paste() async {
    final d = await Clipboard.getData(Clipboard.kTextPlain);
    if (d?.text != null) _pair(d!.text!);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Aurora(
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const SizedBox(height: 28),
              Row(children: [
                const _Logo(size: 40),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: .05), borderRadius: BorderRadius.circular(99), border: Border.all(color: Colors.white12)),
                  child: Text('Welcome', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: .6))),
                ),
              ]).animate().fadeIn(duration: 500.ms).slideY(begin: .2, curve: M.ease),
              const SizedBox(height: 26),
              const Text('Your PC,', style: TextStyle(fontSize: 40, height: 1.05, fontWeight: FontWeight.w800, letterSpacing: -1)).animate().fadeIn(delay: 100.ms, duration: 500.ms).slideY(begin: .2, curve: M.ease),
              ShaderMask(
                shaderCallback: (r) => C.aurora.createShader(r),
                child: const Text('one tap away.', style: TextStyle(fontSize: 40, height: 1.1, fontWeight: FontWeight.w800, letterSpacing: -1, color: Colors.white)),
              ).animate().fadeIn(delay: 180.ms, duration: 500.ms).slideY(begin: .2, curve: M.ease),
              const SizedBox(height: 14),
              Text('Messages, calls and notifications on your computer. Files, clipboard, a touchpad in your hand, and eye breaks that follow you.',
                      style: TextStyle(fontSize: 15, height: 1.5, color: Colors.white.withValues(alpha: .6)))
                  .animate()
                  .fadeIn(delay: 260.ms, duration: 500.ms),
              Expanded(child: Center(child: ConnectScene(state: SceneState.searching, phoneName: Link.I.deviceName, height: 200))),
              Glass(
                strong: true,
                padding: const EdgeInsets.all(20),
                child: Column(children: [
                  Row(children: [
                    const Icon(Icons.qr_code_2_rounded, color: C.cyan),
                    const SizedBox(width: 10),
                    Expanded(child: Text('Open D-Connect on your PC and scan the code on its screen.', style: TextStyle(color: Colors.white.withValues(alpha: .8)))),
                  ]),
                  const SizedBox(height: 16),
                  GradientButton(label: _busy ? 'Connecting…' : 'Scan QR code', icon: Icons.qr_code_scanner_rounded, expand: true, onTap: _busy ? null : _scan),
                  const SizedBox(height: 6),
                  TextButton(onPressed: _busy ? null : _paste, child: Text('Paste a pairing link instead', style: TextStyle(color: Colors.white.withValues(alpha: .6)))),
                ]),
              ).animate().fadeIn(delay: 350.ms, duration: 600.ms).slideY(begin: .25, curve: M.ease),
              const SizedBox(height: 10),
              const GetPcApp().animate().fadeIn(delay: 450.ms, duration: 600.ms),
              const SizedBox(height: 16),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  final double size;
  const _Logo({required this.size});
  @override
  Widget build(BuildContext context) {
    // the app icon: a computer with a D on its screen and a phone in front
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(size * .3), boxShadow: [BoxShadow(color: C.cyan.withValues(alpha: .4), blurRadius: 20)]),
      child: Image.asset('assets/logo.png', width: size, height: size, filterQuality: FilterQuality.medium),
    );
  }
}
