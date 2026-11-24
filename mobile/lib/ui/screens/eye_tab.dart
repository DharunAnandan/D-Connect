import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/connection.dart';
import '../../features/eye.dart';
import '../../theme/tokens.dart';
import '../widgets/glass.dart';
import '../widgets/ring.dart';

class EyeTab extends StatefulWidget {
  const EyeTab({super.key});
  @override
  State<EyeTab> createState() => _EyeTabState();
}

class _EyeTabState extends State<EyeTab> {
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
    Link.I.send('eye.stats.get', {});
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([Eye.I, Link.I]),
      builder: (context, _) {
        final e = Eye.I;
        final left = e.leftMs;
        final mm = left ~/ 60000, ss = (left % 60000) ~/ 1000;
        final maxDay = [4, ...e.days.map((d) => d.done + d.skip + d.snooze)].reduce((a, b) => a > b ? a : b);
        return PinnedPage(
          header: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Eye Care', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -.5)),
            Text('Every 20 minutes, look 20 feet away for 20 seconds', style: TextStyle(color: C.muted)),
          ]),
          children: [
            const SizedBox(height: 22),
            Center(
              child: Stack(alignment: Alignment.center, children: [
                Container(width: 230, height: 230, decoration: BoxDecoration(shape: BoxShape.circle, color: C.cyan.withValues(alpha: .08)))
                    .animate(onPlay: (c) => c.repeat(reverse: true))
                    .scale(begin: const Offset(.96, .96), end: const Offset(1.06, 1.06), duration: 2500.ms, curve: Curves.easeInOut),
                Ring(
                  value: e.on ? 1 - left / e.everyMs : 0,
                  size: 220,
                  stroke: 10,
                  colors: const [C.cyanSoft, C.cyan, C.mint],
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(e.on ? '$mm:${ss.toString().padLeft(2, '0')}' : 'Off', style: const TextStyle(fontSize: 50, fontWeight: FontWeight.w200, fontFeatures: [FontFeature.tabularFigures()])),
                    Text(!Link.I.connected ? 'PC OFFLINE' : e.screenOn ? 'UNTIL BREAK' : 'PAUSED · SCREENS OFF', style: TextStyle(fontSize: 10, letterSpacing: 3, fontWeight: FontWeight.w700, color: Colors.white.withValues(alpha: .45))),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 22),
            Row(children: [
              Expanded(child: _Stat(Icons.local_fire_department_rounded, C.amber, '${e.streak}', 'day streak')),
              const SizedBox(width: 10),
              Expanded(child: _Stat(Icons.emoji_events_rounded, C.violetSoft, '${e.best}', 'best')),
              const SizedBox(width: 10),
              Expanded(child: _Stat(Icons.visibility_rounded, C.mint, '${e.days.isEmpty ? 0 : e.days.last.done}', 'today')),
            ]),
            const SizedBox(height: 14),
            Glass(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('This week', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 16),
                SizedBox(
                  height: 140,
                  child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    for (var i = 0; i < e.days.length; i++)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                            Expanded(
                              child: Container(
                                decoration: BoxDecoration(color: Colors.white.withValues(alpha: .04), borderRadius: BorderRadius.circular(10)),
                                clipBehavior: Clip.antiAlias,
                                child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                                  _Bar(e.days[i].skip / maxDay, C.rose.withValues(alpha: .7), i),
                                  _Bar(e.days[i].snooze / maxDay, C.amber.withValues(alpha: .8), i),
                                  _Bar(e.days[i].done / maxDay, C.mint, i, gradient: true),
                                ]),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(_dow(e.days[i].date), style: TextStyle(fontSize: 11, color: i == e.days.length - 1 ? Colors.white : Colors.white.withValues(alpha: .45), fontWeight: i == e.days.length - 1 ? FontWeight.w700 : FontWeight.w400)),
                          ]),
                        ),
                      ),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 14),
            GradientButton(label: 'Take a break now', icon: Icons.self_improvement_rounded, gradient: const LinearGradient(colors: [C.cyan, C.mint]), expand: true, onTap: Link.I.connected ? e.takeNow : null),
            const SectionTitle('Settings'),
            Glass(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(children: [
                _Switch('Eye breaks', 'Counted on your PC\'s timer', e.on, (v) => e.config(enabled: v)),
                _Switch('Phone screen time counts', 'Moving from the PC to the phone isn\'t a rest', e.phoneCounts, (v) => e.config(counts: v)),
              ]),
            ),
          ],
        );
      },
    );
  }

  String _dow(String date) {
    final d = DateTime.tryParse(date);
    if (d == null) return '';
    return const ['M', 'T', 'W', 'T', 'F', 'S', 'S'][d.weekday - 1];
  }
}

class _Bar extends StatelessWidget {
  final double v;
  final Color color;
  final int i;
  final bool gradient;
  const _Bar(this.v, this.color, this.i, {this.gradient = false});
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      return TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: v.clamp(0, 1)),
        duration: Duration(milliseconds: 700 + i * 60),
        curve: M.spring,
        builder: (_, x, __) => Container(height: 116 * x, decoration: BoxDecoration(color: gradient ? null : color, gradient: gradient ? const LinearGradient(colors: [C.mint, C.cyan], begin: Alignment.bottomCenter, end: Alignment.topCenter) : null)),
      );
    });
  }
}

class _Stat extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String value, label;
  const _Stat(this.icon, this.color, this.value, this.label);
  @override
  Widget build(BuildContext context) => Glass(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 8),
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          Text(label, style: const TextStyle(color: C.muted, fontSize: 12)),
        ]),
      );
}

class _Switch extends StatelessWidget {
  final String title, body;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _Switch(this.title, this.body, this.value, this.onChanged);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w600)), Text(body, style: const TextStyle(color: C.muted, fontSize: 12))])),
          Switch(value: value, onChanged: onChanged),
        ]),
      );
}
