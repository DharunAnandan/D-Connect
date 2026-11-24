// The break on the phone: same drifting lights and countdown ring as the PC overlay.
import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/native.dart';
import '../../features/eye.dart';
import '../../theme/tokens.dart';

class EyeBreakScreen extends StatefulWidget {
  const EyeBreakScreen({super.key});
  @override
  State<EyeBreakScreen> createState() => _EyeBreakScreenState();
}

class _Star {
  double x, y, z, hue;
  _Star(Random r)
      : x = r.nextDouble() * 2 - 1,
        y = r.nextDouble() * 2 - 1,
        z = r.nextDouble(),
        hue = r.nextDouble();
}

class _EyeBreakScreenState extends State<EyeBreakScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(days: 1))..forward();
  final _rnd = Random();
  late final stars = List.generate(160, (_) => _Star(_rnd));
  late final int total = Eye.I.breakSeconds ?? 20;
  late final DateTime start = Eye.I.breakStarted ?? DateTime.now();
  StreamSubscription? _sub;
  bool _finished = false;
  bool _closing = false;
  Duration _last = Duration.zero;
  static const _tips = ['A window, a tree, the far wall. Let your eyes soften.', 'Blink slowly a few times.', 'Relax your shoulders. Breathe out.', 'Find the farthest thing you can see.'];

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _c.addListener(_tick);
    _sub = Eye.I.ended.listen((_) => _close());
  }

  void _tick() {
    final now = _c.lastElapsedDuration ?? Duration.zero;
    final dt = min(.05, (now - _last).inMicroseconds / 1e6);
    _last = now;
    for (final s in stars) {
      s.z += dt * .045;
      if (s.z > 1) {
        s.z = .02;
        s.x = _rnd.nextDouble() * 2 - 1;
        s.y = _rnd.nextDouble() * 2 - 1;
      }
    }
    final left = total - DateTime.now().difference(start).inMilliseconds / 1000;
    if (left <= 0 && !_finished) {
      _finished = true;
      HapticFeedback.mediumImpact();
      Native.vibrate([0, 40, 80, 40, 80, 40]);
      Future.delayed(const Duration(milliseconds: 1500), () => _end('done'));
    }
    setState(() {});
  }

  void _end(String r) {
    Eye.I.finish(r);
    _close();
  }

  void _close() {
    if (_closing || !mounted) return;
    _closing = true;
    Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    _sub?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = max(0.0, total - DateTime.now().difference(start).inMilliseconds / 1000);
    final tip = _tips[min(_tips.length - 1, ((1 - left / total) * _tips.length).floor())];
    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop && !_closing) Eye.I.finish('skip');
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF04060F),
        body: Stack(children: [
          Positioned.fill(child: CustomPaint(painter: _Stars(stars))),
          Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: RadialGradient(colors: [Colors.transparent, Colors.black.withValues(alpha: .55)], stops: const [.55, 1])))),
          SafeArea(
            child: Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                ShaderMask(shaderCallback: (r) => C.aurora.createShader(r), child: const Text('EYE BREAK · 20 · 20 · 20', style: TextStyle(letterSpacing: 4, fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white))),
                const SizedBox(height: 26),
                SizedBox(
                  width: 230,
                  height: 230,
                  child: CustomPaint(
                    painter: _Dial(left / total),
                    child: Center(
                      child: AnimatedSwitcher(
                        duration: M.med,
                        transitionBuilder: (c, a) => ScaleTransition(scale: CurvedAnimation(parent: a, curve: M.spring), child: FadeTransition(opacity: a, child: c)),
                        child: _finished
                            ? Container(key: const ValueKey('ok'), width: 64, height: 64, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: C.mint, width: 3), boxShadow: [BoxShadow(color: C.mint.withValues(alpha: .6), blurRadius: 24)]), child: const Icon(Icons.check_rounded, color: C.mint, size: 38))
                            : Column(key: const ValueKey('n'), mainAxisSize: MainAxisSize.min, children: [
                                Text('${left.ceil()}', style: TextStyle(fontSize: 84, fontWeight: FontWeight.w200, height: 1, shadows: [Shadow(color: C.cyan.withValues(alpha: .6), blurRadius: 28)], fontFeatures: const [FontFeature.tabularFigures()])),
                                Text('SECONDS', style: TextStyle(fontSize: 10, letterSpacing: 3, color: Colors.white.withValues(alpha: .55))),
                              ]),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                Text(_finished ? 'Nice. Back to it.' : 'Look at something 20 feet away', textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w300)),
                const SizedBox(height: 8),
                AnimatedSwitcher(duration: M.slow, child: Text(_finished ? '' : tip, key: ValueKey(tip), textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: .6)))),
                const SizedBox(height: 40),
                AnimatedOpacity(
                  duration: M.med,
                  opacity: _finished ? 0 : 1,
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    _Chip('5 more minutes', () => _end('snooze')),
                    const SizedBox(width: 12),
                    _Chip('Skip', () => _end('skip')),
                  ]),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _Chip(this.label, this.onTap);
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), color: const Color(0x99081220), border: Border.all(color: C.cyanSoft.withValues(alpha: .2))),
          child: Text(label, style: TextStyle(color: Colors.white.withValues(alpha: .7), fontSize: 13)),
        ),
      );
}

class _Stars extends CustomPainter {
  final List<_Star> stars;
  _Stars(this.stars);
  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2, cy = size.height * .45, scale = max(size.width, size.height) * .5;
    canvas.drawRect(Rect.fromLTWH(0, cy - .5, size.width, 1), Paint()..shader = LinearGradient(colors: [Colors.transparent, C.cyan.withValues(alpha: .18), Colors.transparent]).createShader(Rect.fromLTWH(0, cy, size.width, 1)));
    for (final s in stars) {
      final d = .25 + s.z * 3.2;
      final near = 1 - s.z;
      final p = Offset(cx + s.x / d * scale, cy + s.y / d * scale);
      canvas.drawCircle(p, max(.4, 2.2 * near), Paint()..color = HSLColor.fromAHSL((.12 + .6 * near * near).clamp(0, 1), 262 - s.hue * 110, .95, .78).toColor());
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

class _Dial extends CustomPainter {
  final double frac;
  _Dial(this.frac);
  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2 - 14;
    canvas.drawCircle(c, r, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..color = C.cyanSoft.withValues(alpha: .1));
    for (var i = 0; i < 60; i++) {
      final a = i / 60 * 2 * pi;
      canvas.drawLine(c + Offset(cos(a), sin(a)) * (r + 7), c + Offset(cos(a), sin(a)) * (r + 11), Paint()
        ..strokeWidth = 1.4
        ..color = C.cyanSoft.withValues(alpha: .28));
    }
    final rect = Rect.fromCircle(center: c, radius: r);
    canvas.drawArc(rect, -pi / 2, 2 * pi * frac.clamp(0, 1), false, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round
      ..shader = const SweepGradient(colors: [C.violetSoft, C.cyan, C.mint, C.violetSoft], transform: GradientRotation(-pi / 2)).createShader(rect)
      ..maskFilter = const MaskFilter.blur(BlurStyle.solid, 4));
  }

  @override
  bool shouldRepaint(_Dial o) => o.frac != frac;
}
