// Slow drifting aurora behind every screen, matching the desktop background.
// Soft radial gradients moved by transforms: no blur filters, so it costs next to nothing.
import 'dart:math';
import 'package:flutter/material.dart';
import '../../theme/tokens.dart';

class Aurora extends StatefulWidget {
  final Widget child;
  final List<Color> colors;
  const Aurora({super.key, required this.child, this.colors = const [C.violet, C.cyan, C.pink]});
  @override
  State<Aurora> createState() => _AuroraState();
}

class _AuroraState extends State<Aurora> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 40))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    return Stack(children: [
      Positioned.fill(
        child: RepaintBoundary(
          child: CustomPaint(painter: _AuroraPainter(reduce ? const AlwaysStoppedAnimation(0) : _c, widget.colors)),
        ),
      ),
      widget.child,
    ]);
  }
}

class _AuroraPainter extends CustomPainter {
  final Animation<double> a;
  final List<Color> colors;
  _AuroraPainter(this.a, this.colors) : super(repaint: a);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = C.ink900);
    final t = a.value * 2 * pi;
    void blob(Color c, double x, double y, double r, double o) {
      final center = Offset(x, y);
      canvas.drawCircle(center, r, Paint()..shader = RadialGradient(colors: [c.withValues(alpha: o), c.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: center, radius: r)));
    }

    final w = size.width, h = size.height;
    blob(colors[0], w * (.1 + .12 * sin(t)), h * (.08 + .06 * cos(t)), w * .9, .42);
    blob(colors[1], w * (.95 - .1 * cos(t)), h * (.38 + .08 * sin(t * 2)), w * .75, .26);
    blob(colors[2], w * (.4 + .15 * sin(t)), h * (1.0 - .05 * cos(t)), w * .8, .2);
    // vignette
    canvas.drawRect(Offset.zero & size, Paint()..shader = RadialGradient(colors: [Colors.transparent, C.ink900.withValues(alpha: .55), C.ink900.withValues(alpha: .85)], stops: const [0, .7, 1], radius: 1.1).createShader(Offset.zero & size));
  }

  @override
  bool shouldRepaint(_AuroraPainter o) => o.colors != colors;
}
