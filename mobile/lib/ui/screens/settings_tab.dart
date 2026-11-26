import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/connection.dart';
import '../../core/updates.dart';
import '../widgets/update_gate.dart';
import '../../core/native.dart';
import '../../theme/tokens.dart';
import '../widgets/glass.dart';

class SettingsTab extends StatefulWidget {
  const SettingsTab({super.key});
  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> with WidgetsBindingObserver {
  Map<String, dynamic> _perm = {};
  final _runtime = <String, PermissionStatus>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final p = await Native.permissions();
    for (final e in {'sms': Permission.sms, 'phone': Permission.phone, 'contacts': Permission.contacts, 'photos': Permission.photos, 'videos': Permission.videos, 'notify': Permission.notification, 'bt': Permission.bluetoothConnect}.entries) {
      _runtime[e.key] = await e.value.status;
    }
    if (mounted) setState(() => _perm = p);
  }

  Future<void> _ask(Permission p) async {
    final s = await p.request();
    if (s.isPermanentlyDenied) await openAppSettings();
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    bool ok(String k) => _runtime[k]?.isGranted == true;
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
          Glass(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Column(children: [
              _Perm(Icons.notifications_active_rounded, 'Notification access', 'Mirror notifications, reply, media controls', _perm['notifications'] == true, () => Native.openSetting('notifications')),
              _Perm(Icons.sms_rounded, 'SMS', 'Read and send texts from the PC', ok('sms'), () => _ask(Permission.sms)),
              _Perm(Icons.call_rounded, 'Phone & call log', 'Incoming calls, answer and dial from the PC', ok('phone'), () => _ask(Permission.phone)),
              _Perm(Icons.contacts_rounded, 'Contacts', 'Show names instead of numbers', ok('contacts'), () => _ask(Permission.contacts)),
              _Perm(Icons.photo_library_rounded, 'Photos & videos', 'Browse your gallery and albums on the PC', ok('photos') && ok('videos'), () async {
                await Permission.photos.request();
                await _ask(Permission.videos);
              }),
              _Perm(Icons.accessibility_new_rounded, 'Screen control', 'Let the PC tap and type while mirroring (Accessibility)', _perm['accessibility'] == true, () => Native.openSetting('accessibility')),
              _Perm(Icons.do_not_disturb_on_rounded, 'Do Not Disturb access', 'Let the PC switch focus mode', _perm['dnd'] == true, () => Native.openSetting('dnd')),
              _Perm(Icons.battery_charging_full_rounded, 'Run in background', 'Stay connected with the screen off', _perm['battery'] == true, () => Native.openSetting('battery')),
              _Perm(Icons.lock_clock_rounded, 'Work when locked', 'App info → Battery usage → Allow background activity. Without it the phone freezes D-Connect when locked', _perm['background'] == true, () => Native.openSetting('background')),
              _Perm(Icons.bluetooth_rounded, 'Nearby devices', 'Lets the PC pick this phone for call audio', ok('bt'), () => _ask(Permission.bluetoothConnect)),
              _Perm(Icons.notifications_rounded, 'Show notifications', 'Eye breaks and the connection status', ok('notify'), () => _ask(Permission.notification)),
            ]),
          ),
          const SectionTitle('Shortcuts'),
          Glass(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: _Perm(Icons.dashboard_customize_rounded, 'Quick settings tile', 'Pull down the shade: tap D-Connect to send what you copied to the PC', false, () async {
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

class _Perm extends StatelessWidget {
  final IconData icon;
  final String title, body;
  final bool granted;
  final VoidCallback onTap;
  const _Perm(this.icon, this.title, this.body, this.granted, this.onTap);
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: granted ? null : onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(children: [
          Container(width: 38, height: 38, decoration: BoxDecoration(color: Colors.white.withValues(alpha: .05), borderRadius: BorderRadius.circular(12)), child: Icon(icon, size: 19, color: granted ? C.mint : Colors.white70)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w600)), Text(body, style: const TextStyle(color: C.muted, fontSize: 12))])),
          AnimatedSwitcher(
            duration: M.med,
            child: granted
                ? const Icon(Icons.check_circle_rounded, color: C.mint, key: ValueKey('y'))
                : Container(key: const ValueKey('n'), padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), decoration: BoxDecoration(gradient: C.primary, borderRadius: BorderRadius.circular(99)), child: const Text('Allow', style: TextStyle(color: C.ink950, fontWeight: FontWeight.w700, fontSize: 12))),
          ),
        ]),
      ),
    );
  }
}
