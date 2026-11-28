// First open: allow what D-Connect needs, then go on to pairing with the PC. Each permission
// explains itself first; none is required to continue.
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../theme/tokens.dart';
import '../widgets/aurora.dart';
import '../widgets/glass.dart';
import '../widgets/permissions.dart';

class Setup {
  static final done = ValueNotifier<bool>(true);
  static Future<void> load(bool alreadyPaired) async {
    final p = await SharedPreferences.getInstance();
    done.value = p.getBool('setupDone') ?? alreadyPaired; // people already paired skip it
  }

  static Future<void> finish() async {
    (await SharedPreferences.getInstance()).setBool('setupDone', true);
    done.value = true;
  }
}

class SetupScreen extends StatelessWidget {
  const SetupScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Aurora(
        child: SafeArea(
          child: Column(children: [
            Expanded(
              child: ListView(padding: const EdgeInsets.fromLTRB(20, 24, 20, 12), children: [
                Row(children: [
                  Image.asset('assets/logo.png', width: 40, height: 40),
                  const SizedBox(width: 12),
                  const Text('Step 1 of 2', style: TextStyle(color: C.muted, fontWeight: FontWeight.w600)),
                ]),
                const SizedBox(height: 18),
                const Text('Set up D-Connect', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -.5)),
                const SizedBox(height: 8),
                Text('Allow what you want to use on your PC. Each one explains what it does first. You can skip any and change them later in Settings.',
                    style: TextStyle(fontSize: 14.5, height: 1.45, color: Colors.white.withValues(alpha: .65))),
                const SizedBox(height: 16),
                const PermissionList(),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
              child: GradientButton(label: 'Continue to pairing', icon: Icons.arrow_forward_rounded, expand: true, onTap: Setup.finish),
            ),
          ]),
        ),
      ),
    );
  }
}
