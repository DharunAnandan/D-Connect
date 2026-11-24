import 'dart:math';
import 'package:flutter/material.dart';

class Ring extends StatelessWidget {
  final double value;
  final double size;
  final double stroke;
  final List<Color> colors;
  final Widget? child;
  const Ring({super.key, required this.value, this.size = 64, this.stroke = 6, this.colors = const [Color(0xFF7C5CFF), Color(0xFF35E0FF)], this.child});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: value.clamp(0, 1)),
      duration: const Duration(milliseconds: 900),
      curve: const Cubic(0.2, 0.8, 0.2, 1),
      builder: (_, v, __) => SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _RingPainter(v, stroke, colors),
          child: Center(child: child),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double v;
  final double stroke;
  final List<Color> colors;
  _RingPainter(this.v, this.stroke, this.colors);
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final r = rect.deflate(stroke / 2);
    canvas.drawArc(r, 0, 2 * pi, false, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = Colors.white.withValues(alpha: .08));
    if (v < .005) return; // no stray dot at zero
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..shader = SweepGradient(colors: [...colors, colors.first], transform: const GradientRotation(-pi / 2)).createShader(rect);
    canvas.drawArc(r, -pi / 2, 2 * pi * v, false, p);
  }

  @override
  bool shouldRepaint(_RingPainter o) => o.v != v;
}
