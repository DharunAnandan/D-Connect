import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'tokens.dart';

ThemeData buildTheme() {
  final base = ThemeData(useMaterial3: true, brightness: Brightness.dark, colorScheme: ColorScheme.fromSeed(seedColor: C.violet, brightness: Brightness.dark, surface: C.ink900, primary: C.cyan, secondary: C.violet));
  final text = GoogleFonts.interTextTheme(base.textTheme).apply(bodyColor: C.text, displayColor: C.text);
  return base.copyWith(
    scaffoldBackgroundColor: C.ink900,
    textTheme: text,
    splashFactory: InkSparkle.splashFactory,
    pageTransitionsTheme: const PageTransitionsTheme(builders: {TargetPlatform.android: _FadeThroughBuilder()}),
    snackBarTheme: SnackBarThemeData(backgroundColor: C.ink700, contentTextStyle: text.bodyMedium, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white.withValues(alpha: .05),
      hintStyle: TextStyle(color: Colors.white.withValues(alpha: .3)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.white.withValues(alpha: .08))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.white.withValues(alpha: .08))),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: C.cyan.withValues(alpha: .6))),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.all(Colors.white),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? C.violet : Colors.white12),
      trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
    ),
  );
}

// Fade + slight scale + slide, like the desktop page transition.
class _FadeThroughBuilder extends PageTransitionsBuilder {
  const _FadeThroughBuilder();
  @override
  Widget buildTransitions<T>(PageRoute<T> route, BuildContext context, Animation<double> a, Animation<double> b, Widget child) {
    final curved = CurvedAnimation(parent: a, curve: M.ease, reverseCurve: Curves.easeIn);
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween(begin: const Offset(0, .03), end: Offset.zero).animate(curved),
        child: ScaleTransition(scale: Tween(begin: .98, end: 1.0).animate(curved), child: child),
      ),
    );
  }
}
