// The signature connecting animation, the same choreography as the desktop's ConnectScene:
// searching (radar pulses + orbiting sparks around the phone), found (the PC flies in),
// handshake (a particle beam arcs between them, violet -> cyan), connected (the beam
// tightens, a burst, a check mark).
import 'dart:math';
import 'package:flutter/material.dart';
import '../../theme/tokens.dart';

enum SceneState { searching, found, handshake, connected }

class ConnectScene extends StatefulWidget {
  final SceneState state;
  final String phoneName;
  final String pcName;
  final double height;
  const ConnectScene({super.key, required this.state, this.phoneName = 'This phone', this.pcName = 'PC', this.height = 300});
  @override
  State<ConnectScene> createState() => _ConnectSceneState();
}

class _P {
  double t, speed, off, size, hue;
  _P(Random r)
      : t = r.nextDouble(),
        speed = .12 + r.nextDouble() * .25,
        off = r.nextDouble() * 2 - 1,
        size = .8 + r.nextDouble() * 2,
        hue = r.nextDouble();
}

class _B {
  double x, y, vx, vy, life = 1, hue;
  _B(this.x, this.y, this.vx, this.vy, this.hue);
}

class _ConnectSceneState extends State<ConnectScene> with SingleTickerProviderStateMixin {
  late final AnimationController _ticker = AnimationController(vsync: this, duration: const Duration(days: 1))..forward();
  final _rnd = Random();
  late final List<_P> parts = List.generate(60, (_) => _P(_rnd));
  late final List<List<double>> sparks = List.generate(22, (i) => [i / 22 * 2 * pi, 60 + _rnd.nextDouble() * 50, .15 + _rnd.nextDouble() * .35, .8 + _rnd.nextDouble() * 1.6]);
  final List<_B> burst = [];
  double link = 0, hue = 0, tight = 0, time = 0;
  bool burstDone = false;
  Duration _last = Duration.zero;

  @override
  void initState() {
    super.initState();
    _ticker.addListener(_tick);
  }

  void _tick() {
    final now = _ticker.lastElapsedDuration ?? Duration.zero;
    final dt = min(.05, (now - _last).inMicroseconds / 1e6);
    _last = now;
    final reduce = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    time += reduce ? 0 : dt;
    final s = widget.state;
    link += ((s == SceneState.searching ? 0 : 1) - link) * min(1, dt * 3);
    hue += ((s == SceneState.handshake ? .55 : s == SceneState.connected ? 1 : 0) - hue) * min(1, dt * 2);
    tight += ((s == SceneState.connected ? 1 : 0) - tight) * min(1, dt * 4);
    for (final p in parts) {
      p.t += p.speed * dt * (1 + tight * 1.5);
      if (p.t > 1) p.t -= 1;
    }
    for (final sp in sparks) {
      sp[0] += sp[2] * dt;
    }
    if (s == SceneState.connected && !burstDone && tight > .6) {
      burstDone = true;
      final size = context.size ?? const Size(300, 300);
      for (final x in [size.width * .27, size.width * .73, size.width / 2]) {
        for (var i = 0; i < 30; i++) {
          final a = _rnd.nextDouble() * 2 * pi;
          final v = 60 + _rnd.nextDouble() * 180;
          burst.add(_B(x, size.height / 2, cos(a) * v, sin(a) * v, 150 + _rnd.nextDouble() * 120));
        }
      }
    }
    if (s != SceneState.connected) burstDone = false;
    for (final b in burst) {
      b.life -= dt * 1.3;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= .96;
      b.vy *= .96;
    }
    burst.removeWhere((b) => b.life <= 0);
    _frame.value++; // repaint the canvas only
  }

  final _frame = ValueNotifier<int>(0);

  @override
  void didUpdateWidget(ConnectScene old) {
    super.didUpdateWidget(old);
  }

  @override
  void dispose() {
    _ticker.dispose();
    _frame.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final found = widget.state != SceneState.searching;
    return SizedBox(
      height: widget.height,
      child: LayoutBuilder(builder: (context, box) {
        final w = box.maxWidth;
        return Stack(clipBehavior: Clip.none, children: [
          Positioned.fill(child: RepaintBoundary(child: CustomPaint(painter: _ScenePainter(this, _frame)))),
          // the phone: centre while searching, left once found
          AnimatedPositioned(
            duration: M.slow,
            curve: M.ease,
            left: (found ? w * .27 : w / 2) - 36,
            top: widget.height / 2 - 52,
            child: _Device(icon: Icons.smartphone_rounded, label: widget.phoneName, tall: true, glow: widget.state == SceneState.connected),
          ),
          // the PC flies in
          AnimatedPositioned(
            duration: M.slow,
            curve: M.spring,
            left: found ? w * .73 - 44 : w + 40,
            top: widget.height / 2 - 44,
            child: AnimatedOpacity(
              duration: M.med,
              opacity: found ? 1 : 0,
              child: AnimatedRotation(duration: M.slow, curve: M.spring, turns: found ? 0 : .06, child: _Device(icon: Icons.laptop_rounded, label: widget.pcName, glow: widget.state == SceneState.connected)),
            ),
          ),
          // the check
          Positioned(
            left: w / 2 - 24,
            top: widget.height / 2 - 38,
            child: AnimatedScale(
              scale: widget.state == SceneState.connected ? 1 : 0,
              duration: M.slow,
              curve: M.spring,
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: C.mint, shape: BoxShape.circle, boxShadow: [BoxShadow(color: C.mint.withValues(alpha: .8), blurRadius: 30)]),
                child: const Icon(Icons.check_rounded, color: C.ink950, size: 28),
              ),
            ),
          ),
        ]);
      }),
    );
  }
}

class _Device extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool tall;
  final bool glow;
  const _Device({required this.icon, required this.label, this.tall = false, this.glow = false});
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: tall ? 72 : 88,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        AnimatedContainer(
          duration: M.slow,
          width: tall ? 60 : 84,
          height: tall ? 88 : 68,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            gradient: const LinearGradient(colors: [Color(0xF2283058), Color(0xF2101428)], begin: Alignment.topLeft, end: Alignment.bottomRight),
            border: Border.all(color: Colors.white.withValues(alpha: .15)),
            boxShadow: [BoxShadow(color: (glow ? C.mint : C.violet).withValues(alpha: glow ? .5 : .35), blurRadius: glow ? 40 : 28)],
          ),
          child: Icon(icon, color: Colors.white, size: 30),
        ),
        const SizedBox(height: 10),
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: Colors.white.withValues(alpha: .7), fontWeight: FontWeight.w500)),
      ]),
    );
  }
}

class _ScenePainter extends CustomPainter {
  final _ConnectSceneState s;
  _ScenePainter(this.s, Listenable repaint) : super(repaint: repaint);

  double _lerp(double a, double b, double t) => a + (b - a) * t;
  double get _hue => s.hue < .5 ? _lerp(262, 190, s.hue * 2) : _lerp(190, 152, (s.hue - .5) * 2);
  Color _c(double h, double a, [double l = .70]) => HSLColor.fromAHSL(a.clamp(0, 1), h % 360, .95, l).toColor();

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height, cy = h / 2 - 8;
    final ax = w * .27, bx = w * .73;
    final hue = _hue;
    final radarA = 1 - s.link;

    if (radarA > .02) {
      final cx = _lerp(w / 2, ax, s.link);
      for (var i = 0; i < 4; i++) {
        final k = (s.time * .45 + i / 4) % 1;
        final r = 46 + k * min(w, h) * .45;
        canvas.drawCircle(Offset(cx, cy), r, Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..color = _c(hue, (1 - k) * .32 * radarA));
      }
      final sweep = Paint()
        ..shader = SweepGradient(
          colors: [_c(hue, .18 * radarA), Colors.transparent, Colors.transparent],
          stops: const [0, .12, 1],
          transform: GradientRotation(s.time * 1.4),
        ).createShader(Rect.fromCircle(center: Offset(cx, cy), radius: min(w, h) * .45));
      canvas.drawCircle(Offset(cx, cy), min(w, h) * .45, sweep);
      for (final sp in s.sparks) {
        final p = Offset(cx + cos(sp[0]) * sp[1], cy + sin(sp[0]) * sp[1] * .85);
        canvas.drawCircle(p, sp[3], Paint()..color = _c(hue, .55 * radarA, .8));
      }
    }

    if (s.link > .02) {
      final lift = _lerp(64, 12, s.tight);
      final ctrlY = cy - lift;
      Offset point(double t) => Offset(
            pow(1 - t, 2) * ax + 2 * (1 - t) * t * (w / 2) + t * t * bx,
            pow(1 - t, 2) * cy + 2 * (1 - t) * t * ctrlY + t * t * cy,
          );
      final reach = min(1.0, s.link * 1.15);
      final path = Path()..moveTo(ax, cy);
      for (var i = 1; i <= 50; i++) {
        final p = point(i / 50 * reach);
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(path, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = _lerp(8, 12, s.tight)
        ..color = _c(hue, .16 * s.link));
      canvas.drawPath(path, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = _lerp(1.2, 2.6, s.tight)
        ..shader = LinearGradient(colors: [_c(hue, .5 * s.link), _c(hue + 40, .8 * s.link), _c(hue, .5 * s.link)]).createShader(Rect.fromLTRB(ax, 0, bx, h)));
      for (final p in s.parts) {
        final dir = p.hue > .5 ? p.t : 1 - p.t;
        if (dir > reach) continue;
        final pt = point(dir);
        final spread = _lerp(14, 3, s.tight) * sin(dir * pi);
        canvas.drawCircle(Offset(pt.dx, pt.dy + p.off * spread), p.size, Paint()..color = _c(hue + p.hue * 60, sin(dir * pi) * s.link * .9, .78));
      }
    }

    for (final b in s.burst) {
      canvas.drawCircle(Offset(b.x, b.y), 2 * b.life + .5, Paint()..color = _c(b.hue, b.life, .75));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
