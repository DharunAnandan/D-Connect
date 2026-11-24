import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/tokens.dart';

class Glass extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final bool strong;
  final Gradient? border;
  const Glass({super.key, required this.child, this.padding = const EdgeInsets.all(18), this.radius = R.md, this.strong = false, this.border});

  @override
  Widget build(BuildContext context) {
    // No BackdropFilter: over the moving aurora it re-blurs every frame. A richer translucent
    // gradient keeps the glass look at a fraction of the cost.
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: strong ? [const Color(0xF2242C52), const Color(0xF5101428)] : [const Color(0xC8202848), const Color(0xD10F1326)],
        ),
        border: Border.all(color: const Color(0xFFAABEFF).withValues(alpha: strong ? .12 : .09)),
      ),
      child: child,
    );
  }
}

// Scales down on press, springs back: the micro-interaction on every tappable card.
class Press extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double scale;
  const Press({super.key, required this.child, this.onTap, this.onLongPress, this.scale = .95});
  @override
  State<Press> createState() => _PressState();
}

class _PressState extends State<Press> {
  bool _down = false;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => setState(() => _down = true),
      onTapCancel: () => setState(() => _down = false),
      onTapUp: (_) => setState(() => _down = false),
      onTap: widget.onTap == null
          ? null
          : () {
              HapticFeedback.selectionClick();
              widget.onTap!();
            },
      onLongPress: widget.onLongPress,
      child: AnimatedScale(scale: _down ? widget.scale : 1, duration: M.fast, curve: _down ? Curves.easeOut : M.spring, child: widget.child),
    );
  }
}

class GradientButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final Gradient gradient;
  final Color fg;
  final bool expand;
  const GradientButton({super.key, required this.label, this.icon, this.onTap, this.gradient = C.primary, this.fg = C.ink950, this.expand = false});

  @override
  Widget build(BuildContext context) {
    return Press(
      onTap: onTap,
      child: Opacity(
        opacity: onTap == null ? .4 : 1,
        child: Container(
          height: 54,
          width: expand ? double.infinity : null,
          padding: const EdgeInsets.symmetric(horizontal: 24),
          decoration: BoxDecoration(
            gradient: gradient,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [BoxShadow(color: C.cyan.withValues(alpha: .35), blurRadius: 28, offset: const Offset(0, 10), spreadRadius: -8)],
          ),
          child: Row(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
            if (icon != null) ...[Icon(icon, color: fg, size: 20), const SizedBox(width: 10)],
            Text(label, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 15.5)),
          ]),
        ),
      ),
    );
  }
}

class Pill extends StatelessWidget {
  final String text;
  final Color color;
  final bool dot;
  const Pill(this.text, {super.key, this.color = C.cyan, this.dot = false});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: color.withValues(alpha: .12), borderRadius: BorderRadius.circular(99), border: Border.all(color: color.withValues(alpha: .25))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (dot) ...[Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle, boxShadow: [BoxShadow(color: color, blurRadius: 6)])), const SizedBox(width: 6)],
        Text(text, style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

class SectionTitle extends StatelessWidget {
  final String text;
  final Widget? trailing;
  const SectionTitle(this.text, {super.key, this.trailing});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 4, 10),
        child: Row(children: [
          Expanded(child: Text(text.toUpperCase(), style: TextStyle(fontSize: 11.5, letterSpacing: 1.6, fontWeight: FontWeight.w700, color: Colors.white.withValues(alpha: .45)))),
          if (trailing != null) trailing!,
        ]),
      );
}

// Title pinned at the top; only the content under it scrolls.
class PinnedPage extends StatelessWidget {
  final Widget header;
  final List<Widget> children;
  const PinnedPage({super.key, required this.header, required this.children});
  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(padding: EdgeInsets.fromLTRB(18, top + 14, 18, 8), child: header),
      Expanded(
        child: ShaderMask(
          // content fades out under the title instead of cutting off hard
          shaderCallback: (r) => const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.transparent, Colors.black], stops: [0, .04]).createShader(r),
          blendMode: BlendMode.dstIn,
          child: ListView(padding: const EdgeInsets.fromLTRB(18, 8, 18, 110), children: children),
        ),
      ),
    ]);
  }
}
