import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/tokens.dart';
import '../widgets/aurora.dart';
import 'eye_tab.dart';
import 'home_tab.dart';
import 'remote_tab.dart';
import 'settings_tab.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  static const _items = [
    (Icons.space_dashboard_rounded, 'Home'),
    (Icons.touch_app_rounded, 'Remote'),
    (Icons.visibility_rounded, 'Eye Care'),
    (Icons.tune_rounded, 'Settings'),
  ];

  @override
  Widget build(BuildContext context) {
    final pages = [HomeTab(onGo: (i) => setState(() => _tab = i)), const RemoteTab(), const EyeTab(), const SettingsTab()];
    return Scaffold(
      extendBody: true,
      body: Aurora(
        colors: _tab == 2 ? const [C.cyan, C.mint, C.violet] : const [C.violet, C.cyan, C.pink],
        child: AnimatedSwitcher(
          duration: M.med,
          switchInCurve: M.ease,
          switchOutCurve: Curves.easeIn,
          transitionBuilder: (c, a) => FadeTransition(opacity: a, child: SlideTransition(position: Tween(begin: const Offset(0, .02), end: Offset.zero).animate(a), child: c)),
          child: KeyedSubtree(key: ValueKey(_tab), child: pages[_tab]),
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(26),
          child: RepaintBoundary(
            child: Container(
              height: 68,
              decoration: BoxDecoration(color: const Color(0xF2121830), borderRadius: BorderRadius.circular(26), border: Border.all(color: Colors.white.withValues(alpha: .08)), boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 24, offset: Offset(0, 8))]),
              child: LayoutBuilder(builder: (context, box) {
                final w = box.maxWidth / _items.length;
                return Stack(children: [
                  AnimatedPositioned(
                    duration: M.med,
                    curve: M.spring,
                    left: _tab * w + 8,
                    top: 8,
                    width: w - 16,
                    height: 52,
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(18),
                        gradient: LinearGradient(colors: [C.violet.withValues(alpha: .35), C.cyan.withValues(alpha: .18)]),
                        border: Border.all(color: Colors.white.withValues(alpha: .1)),
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      for (var i = 0; i < _items.length; i++)
                        Expanded(
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () {
                              HapticFeedback.selectionClick();
                              setState(() => _tab = i);
                            },
                            child: AnimatedScale(
                              scale: _tab == i ? 1.0 : .92,
                              duration: M.med,
                              curve: M.spring,
                              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                                Icon(_items[i].$1, size: 22, color: _tab == i ? C.cyanSoft : Colors.white.withValues(alpha: .5)),
                                const SizedBox(height: 3),
                                AnimatedDefaultTextStyle(
                                  duration: M.fast,
                                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: _tab == i ? Colors.white : Colors.white.withValues(alpha: .45)),
                                  child: Text(_items[i].$2),
                                ),
                              ]),
                            ),
                          ),
                        ),
                    ],
                  ),
                ]);
              }),
            ),
          ),
        ),
      ),
    );
  }
}
