// Update prompts: a required update covers the whole app; an optional one is a small banner.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/native.dart';
import '../../core/updates.dart';
import '../../theme/tokens.dart';
import 'aurora.dart';
import 'glass.dart';

class UpdateGate extends StatelessWidget {
  const UpdateGate({super.key});
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Updates.I,
      builder: (context, _) {
        final u = Updates.I;
        if (u.force) return const _ForceUpdate();
        if (!u.optional) return const SizedBox.shrink();
        return Align(
          alignment: Alignment.topCenter,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Material(
                color: Colors.transparent,
                child: Glass(
                  strong: true,
                  padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
                  child: Row(children: [
                    const Icon(Icons.system_update_rounded, color: C.cyan),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                        Text('Update available · ${u.latest}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        if (u.notes.isNotEmpty) Text(u.notes, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: C.muted, fontSize: 12)),
                      ]),
                    ),
                    TextButton(onPressed: u.skip, child: const Text('Later', style: TextStyle(color: C.muted))),
                    TextButton(onPressed: u.open, child: const Text('Update', style: TextStyle(color: C.cyan, fontWeight: FontWeight.w700))),
                  ]),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ForceUpdate extends StatelessWidget {
  const _ForceUpdate();
  @override
  Widget build(BuildContext context) {
    final u = Updates.I;
    return Material(
      color: C.ink950,
      child: Aurora(
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Center(child: Image.asset('assets/logo.png', width: 84, height: 84)),
              const SizedBox(height: 24),
              const Text('Update D-Connect', textAlign: TextAlign.center, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              Text('${u.why} Update to keep using it.', textAlign: TextAlign.center, style: TextStyle(fontSize: 15, height: 1.5, color: Colors.white.withValues(alpha: .7))),
              const SizedBox(height: 6),
              Text('Installed ${u.version}${u.latest.isNotEmpty ? ' · newest ${u.latest}' : ''}', textAlign: TextAlign.center, style: const TextStyle(color: C.muted, fontSize: 12)),
              if (u.notes.isNotEmpty) ...[
                const SizedBox(height: 18),
                Glass(child: Text(u.notes, style: TextStyle(color: Colors.white.withValues(alpha: .8)))),
              ],
              const SizedBox(height: 28),
              GradientButton(label: u.fromPlay ? 'Update on Google Play' : 'Download the update', icon: Icons.system_update_rounded, expand: true, onTap: u.open),
              const SizedBox(height: 8),
              TextButton(onPressed: () => SystemNavigator.pop(), child: const Text('Close', style: TextStyle(color: C.muted))),
            ]),
          ),
        ),
      ),
    );
  }
}

// "Get D-Connect for your PC": shown while pairing, and in Settings. Opens the PC app's store
// page (Snap Store for Ubuntu, Microsoft Store for Windows); the link can be copied to open it
// on the PC.
class GetPcApp extends StatelessWidget {
  const GetPcApp({super.key});

  void _pick(BuildContext context, String url, String store) {
    Clipboard.setData(ClipboardData(text: url));
    Native.call('openUrl', {'url': url});
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$store link copied too: open it on your PC')));
  }

  @override
  Widget build(BuildContext context) {
    Widget btn(IconData icon, String label, VoidCallback onTap) => Expanded(
          child: OutlinedButton.icon(
            onPressed: onTap,
            icon: Icon(icon, size: 18),
            label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: BorderSide(color: Colors.white.withValues(alpha: .18)),
              padding: const EdgeInsets.symmetric(vertical: 11),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
        );
    return Glass(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          const Icon(Icons.laptop_rounded, color: C.violetSoft, size: 20),
          const SizedBox(width: 10),
          const Expanded(child: Text('No D-Connect on your PC yet?', style: TextStyle(fontWeight: FontWeight.w700))),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          btn(Icons.window_rounded, 'Windows', () => _pick(context, AppLinks.pcWindows, 'Microsoft Store')),
          const SizedBox(width: 10),
          btn(Icons.terminal_rounded, 'Ubuntu', () => _pick(context, AppLinks.pcUbuntu, 'Snap Store')),
        ]),
      ]),
    );
  }
}
