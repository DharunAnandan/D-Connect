// D-Connect design tokens, mirrored from desktop/src/renderer (tailwind.config.cjs + index.css).
import 'package:flutter/material.dart';

class C {
  static const ink950 = Color(0xFF05070F);
  static const ink900 = Color(0xFF070A14);
  static const ink850 = Color(0xFF0B1020);
  static const ink800 = Color(0xFF10172B);
  static const ink700 = Color(0xFF18213A);
  static const violet = Color(0xFF7C5CFF);
  static const violetSoft = Color(0xFFA08BFF);
  static const cyan = Color(0xFF35E0FF);
  static const cyanSoft = Color(0xFF8BE9FF);
  static const pink = Color(0xFFFF5CA8);
  static const mint = Color(0xFF3DDC97);
  static const amber = Color(0xFFFFB547);
  static const rose = Color(0xFFF87171);
  static const text = Color(0xFFEEF2FF);
  static const muted = Color(0x94D6E0FF);
  static const line = Color(0x1AA0B4FF);

  static const aurora = LinearGradient(colors: [violet, cyan, mint], stops: [0, .55, 1], begin: Alignment.topLeft, end: Alignment.bottomRight);
  static const auroraPink = LinearGradient(colors: [pink, violet, cyan], begin: Alignment.topLeft, end: Alignment.bottomRight);
  static const primary = LinearGradient(colors: [Color(0xFF8B6CFF), cyan], begin: Alignment.topLeft, end: Alignment.bottomRight);
}

class R {
  static const sm = 12.0;
  static const md = 20.0;
  static const lg = 28.0;
}

class M {
  // side-eye's ease and spring, as Flutter curves
  static const ease = Cubic(0.2, 0.8, 0.2, 1);
  static const spring = Cubic(0.34, 1.4, 0.64, 1);
  static const fast = Duration(milliseconds: 220);
  static const med = Duration(milliseconds: 420);
  static const slow = Duration(milliseconds: 700);
}
