import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/connection.dart';
import 'features/app_state.dart';
import 'features/bridge.dart';
import 'features/eye.dart';
import 'features/files.dart';
import 'theme/theme.dart';
import 'ui/screens/eye_break_screen.dart';
import 'ui/screens/root.dart';
import 'ui/screens/scanner_screen.dart';
import 'ui/screens/setup_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent, systemNavigationBarColor: Colors.transparent, statusBarIconBrightness: Brightness.light));
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  AppState.I.init();
  Files.init();
  Bridge.init();
  Eye.I.init();
  await Link.I.init();
  await Setup.load(Link.I.pc != null);
  runApp(const DConnectApp());
}

class DConnectApp extends StatelessWidget {
  const DConnectApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'D-Connect',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      navigatorKey: Eye.navigatorKey,
      home: const Root(),
      routes: {
        '/scan': (_) => const ScannerScreen(),
        '/eyebreak': (_) => const EyeBreakScreen(),
      },
    );
  }
}
