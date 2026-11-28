// A line drawing that draws itself: this phone and the PC sketched in light, then a wave of
// light linking them with sparks running both ways; it fades and redraws every few seconds.
// (The same drawing as on the PC's home screen.)
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../theme/tokens.dart';

class LinkSketch extends StatefulWidget {
  final double height;
  const LinkSketch({super.key, this.height = 64});
  @override
  State<LinkSketch> createState() => _LinkSketchState();
}

class _LinkSketchState extends State<LinkSketch> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 9))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        height: widget.height,
        width: double.infinity,
        child: RepaintBoundary(child: CustomPaint(painter: _Sketch(_c))),
      );
}

class _Sketch extends CustomPainter {
  final Animation<double> t;
  _Sketch(this.t) : super(repaint: t);

  // drawing in a 520 x 128 space (the PC drawing's), scaled to fit
  static Path _rr(double x, double y, double w, double h, double r) => Path()..addRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, y, w, h), Radius.circular(r)));
  static final _phone = _rr(62, 26, 46, 76, 8);
  static final _ear = Path()..moveTo(80, 33)..lineTo(90, 33);
  static final _arc1 = Path()..addArc(Rect.fromCircle(center: const Offset(118, 64), radius: 18), -1.1, 2.2);
  static final _arc2 = Path()..addArc(Rect.fromCircle(center: const Offset(124, 64), radius: 28), -1.0, 2.0);
  static final _screen = _rr(410, 30, 84, 60, 6);
  static final _d = Path()
    ..moveTo(440, 46)
    ..lineTo(446, 46)
    ..cubicTo(456, 46, 462, 52, 462, 60)
    ..cubicTo(462, 68, 456, 74, 446, 74)
    ..lineTo(440, 74)
    ..close();
  static final _base = Path()..moveTo(400, 98)..lineTo(504, 98)..lineTo(498, 106)..lineTo(406, 106)..close();
  static final _wave = Path()
    ..moveTo(140, 64)
    ..cubicTo(190, 22, 222, 106, 270, 64)
    ..cubicTo(318, 22, 350, 106, 400, 64);

  // part of a path, drawn from its start up to "p" (0..1)
  static Path _upTo(Path path, double p) {
    final out = Path();
    if (p <= 0) return out;
    for (final m in path.computeMetrics()) {
      out.addPath(m.extractPath(0, m.length * p.clamp(0, 1)), Offset.zero);
    }
    return out;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final v = t.value * 9; // seconds into the cycle
    final fade = v < 7.6 ? 1.0 : (1 - (v - 7.6) / 1.4).clamp(0.0, 1.0);
    final s = size.height / 128;
    final dx = (size.width - 520 * s) / 2;
    canvas.save();
    canvas.translate(dx, 0);
    canvas.scale(s);

    final ink = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..shader = ui.Gradient.linear(const Offset(60, 0), const Offset(500, 0), [C.violet, C.cyan, C.mint], [0, .55, 1]);
    final glow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5)
      ..shader = ink.shader;
    double prog(double start, double dur) => ((v - start) / dur).clamp(0.0, 1.0);
    void draw(Path p, double start, double dur, {double width = 2.4}) {
      final part = _upTo(p, Curves.easeInOut.transform(prog(start, dur)));
      glow.color = Colors.white.withValues(alpha: .35 * fade);
      ink
        ..strokeWidth = width
        ..color = Colors.white.withValues(alpha: fade);
      canvas.saveLayer(null, Paint()..color = Colors.white.withValues(alpha: fade));
      canvas.drawPath(part, glow);
      canvas.drawPath(part, ink);
      canvas.restore();
    }

    draw(_phone, 0, 1.2);
    draw(_ear, .8, .4);
    draw(_arc1, 1.1, .5, width: 1.8);
    draw(_arc2, 1.3, .5, width: 1.4);
    draw(_screen, .3, 1.2);
    draw(_d, 1.2, .7);
    draw(_base, .8, .7);
    draw(_wave, 1.6, 1.6, width: 2.2);

    // sparks along the wave, both ways, once it's drawn
    if (v > 3.2) {
      final m = _wave.computeMetrics().first;
      for (final (i, start) in [(0, 3.2), (1, 4.1), (2, 5.0)]) {
        final k = (v - start) / 2.6;
        if (k < 0 || k > 1) continue;
        final at = m.getTangentForOffset(m.length * (i == 1 ? 1 - k : k))!.position;
        final dot = Paint()..color = (i == 1 ? C.cyan : C.mint).withValues(alpha: fade * (1 - (k - .5).abs()));
        canvas.drawCircle(at, i == 1 ? 3.6 : 3, dot);
        canvas.drawCircle(at, 9, Paint()..color = dot.color.withValues(alpha: dot.color.a * .25)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6));
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_Sketch old) => false;
}
