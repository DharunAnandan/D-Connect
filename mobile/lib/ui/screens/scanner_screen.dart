import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../theme/tokens.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});
  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> with SingleTickerProviderStateMixin {
  final _ctrl = MobileScannerController(formats: [BarcodeFormat.qrCode]);
  late final AnimationController _line = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat(reverse: true);
  bool _done = false;

  @override
  void dispose() {
    _ctrl.dispose();
    _line.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size.width * .72;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [
        MobileScanner(
          controller: _ctrl,
          onDetect: (cap) {
            final v = cap.barcodes.firstOrNull?.rawValue;
            if (_done || v == null || !v.startsWith('dconnect://')) return;
            _done = true;
            HapticFeedback.heavyImpact();
            Navigator.of(context).pop(v);
          },
        ),
        // dim everything but the window
        ColorFiltered(
          colorFilter: ColorFilter.mode(Colors.black.withValues(alpha: .62), BlendMode.srcOut),
          child: Stack(children: [
            Container(decoration: const BoxDecoration(color: Colors.transparent, backgroundBlendMode: BlendMode.dstOut)),
            Center(child: Container(width: size, height: size, decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(32)))),
          ]),
        ),
        Center(
          child: SizedBox(
            width: size,
            height: size,
            child: Stack(children: [
              Container(decoration: BoxDecoration(borderRadius: BorderRadius.circular(32), border: Border.all(color: C.cyan, width: 3), boxShadow: [BoxShadow(color: C.cyan.withValues(alpha: .4), blurRadius: 30)])),
              AnimatedBuilder(
                animation: _line,
                builder: (_, __) => Positioned(
                  left: 18,
                  right: 18,
                  top: 18 + (size - 36) * Curves.easeInOut.transform(_line.value),
                  child: Container(height: 3, decoration: BoxDecoration(gradient: C.primary, borderRadius: BorderRadius.circular(3), boxShadow: [BoxShadow(color: C.cyan.withValues(alpha: .9), blurRadius: 16)])),
                ),
              ),
            ]),
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded, size: 28)),
              const Spacer(),
              IconButton(onPressed: () => _ctrl.toggleTorch(), icon: const Icon(Icons.flashlight_on_rounded)),
            ]),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 80,
          child: Column(children: [
            const Text('Scan the code on your PC', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text('D-Connect → Pair a phone', style: TextStyle(color: Colors.white.withValues(alpha: .6))),
          ]),
        ),
      ]),
    );
  }
}
