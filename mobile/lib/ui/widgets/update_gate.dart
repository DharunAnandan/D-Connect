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

// "Get D-Connect for your PC": shown while pairing, and in Settings
class GetPcApp extends StatelessWidget {
  const GetPcApp({super.key});
  @override
  Widget build(BuildContext context) {
    return Glass(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      child: Row(children: [
        const Icon(Icons.laptop_rounded, color: C.violetSoft),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            const Text('No D-Connect on your PC yet?', style: TextStyle(fontWeight: FontWeight.w700)),
            Text('Install it on Ubuntu or Windows from the download page', style: TextStyle(color: Colors.white.withValues(alpha: .6), fontSize: 12)),
          ]),
        ),
        IconButton(
          tooltip: 'Copy link',
          icon: const Icon(Icons.copy_rounded, size: 20, color: C.muted),
          onPressed: () {
            Clipboard.setData(const ClipboardData(text: AppLinks.pcApp));
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied: open it on your PC')));
          },
        ),
        TextButton(onPressed: () => Native.call('openUrl', {'url': AppLinks.pcApp}), child: const Text('Get it', style: TextStyle(color: C.cyan, fontWeight: FontWeight.w700))),
      ]),
    );
  }
}
