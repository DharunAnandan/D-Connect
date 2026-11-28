import 'package:flutter/material.dart';

import '../../core/connection.dart';
import '../../core/updates.dart';
import '../widgets/update_gate.dart';
import '../widgets/permissions.dart';
import '../../core/native.dart';
import '../../theme/tokens.dart';
import '../widgets/glass.dart';

class SettingsTab extends StatefulWidget {
  const SettingsTab({super.key});
  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> {

  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Link.I,
      builder: (context, _) => PinnedPage(
        header: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Settings', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -.5)),
          Text('Give D-Connect what each feature needs', style: TextStyle(color: C.muted)),
        ]),
        children: [
          const SectionTitle('Linked PC'),
          Glass(
            child: Row(children: [
              const Icon(Icons.laptop_rounded, color: C.cyanSoft),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(Link.I.pc?.name ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)), Text(Link.I.connected ? 'Connected over ${Link.I.via == 'usb' ? 'USB' : 'Wi-Fi'}' : 'Not connected', style: const TextStyle(color: C.muted, fontSize: 12))])),
              TextButton(
                onPressed: () async {
                  final y = await showDialog<bool>(
                    context: context,
                    builder: (c) => AlertDialog(
                      backgroundColor: C.ink800,
                      title: const Text('Unlink this PC?'),
                      content: const Text('You can pair again any time by scanning its code.'),
                      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Unlink', style: TextStyle(color: C.rose)))],
                    ),
                  );
                  if (y == true) Link.I.forget();
                },
                child: const Text('Unlink', style: TextStyle(color: C.rose)),
              ),
            ]),
          ),
          const SectionTitle('Permissions'),
          const PermissionList(),
          const SectionTitle('Shortcuts'),
          Glass(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: PermRow(Icons.dashboard_customize_rounded, 'Quick settings tile', 'A D-Connect switch in your quick settings: tap it to connect to your PC or go offline', false, () async {
              final code = await Native.call<int>('addTile');
              if (!context.mounted) return;
              final msg = switch (code) {
                1 || 2 => 'D-Connect tile is in your quick settings',
                -1 => 'Pull down quick settings, tap the pencil, and drag D-Connect in',
                _ => 'Not added',
              };
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
            }),
          ),
          const SectionTitle('Your PC app'),
          const GetPcApp(),
          const SectionTitle('About'),
          Glass(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('This phone: ${Link.I.deviceName}', style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text('${Link.I.model} · Android ${Link.I.android}', style: const TextStyle(color: C.muted, fontSize: 12)),
              const SizedBox(height: 4),
              Text('D-Connect ${Link.I.appVersion} · end-to-end TLS pinned to your PC', style: const TextStyle(color: C.muted, fontSize: 12)),
              if (Updates.I.pcVersion != null) ...[
                const SizedBox(height: 4),
                Text('${Link.I.pc?.name ?? 'PC'}: D-Connect ${Updates.I.pcVersion}${Updates.I.pcOld ? ' · update available ${Updates.I.pcLatest}' : ''}', style: TextStyle(color: Updates.I.pcOld ? C.amber : C.muted, fontSize: 12)),
              ],
              const SizedBox(height: 8),
              Row(children: [
                TextButton.icon(
                  onPressed: () async {
                    await Updates.I.check();
                    if (!context.mounted) return;
                    final u = Updates.I;
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(u.latest.isEmpty ? 'Couldn\'t reach the update server' : cmpVersion(u.version, u.latest) < 0 ? 'Version ${u.latest} is available' : 'You have the newest version')));
                    if (u.latest.isNotEmpty && cmpVersion(u.version, u.latest) < 0) u.open();
                  },
                  icon: const Icon(Icons.system_update_rounded, size: 18),
                  label: const Text('Check for updates'),
                ),
              ]),
            ]),
          ),
        ],
      ),
    );
  }
}

