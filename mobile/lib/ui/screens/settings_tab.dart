import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/connection.dart';
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
    for (final e in {'sms': Permission.sms, 'phone': Permission.phone, 'contacts': Permission.contacts, 'photos': Permission.photos, 'notify': Permission.notification, 'bt': Permission.bluetoothConnect}.entries) {
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
      builder: (context, _) => ListView(
        padding: EdgeInsets.fromLTRB(18, MediaQuery.of(context).padding.top + 14, 18, 110),
        children: [
          const Text('Settings', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -.5)),
          const Text('Give D-Connect what each feature needs', style: TextStyle(color: C.muted)),
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
              _Perm(Icons.photo_library_rounded, 'Photos', 'Browse recent photos on the PC', ok('photos'), () => _ask(Permission.photos)),
              _Perm(Icons.accessibility_new_rounded, 'Screen control', 'Let the PC tap and type while mirroring (Accessibility)', _perm['accessibility'] == true, () => Native.openSetting('accessibility')),
              _Perm(Icons.do_not_disturb_on_rounded, 'Do Not Disturb access', 'Let the PC switch focus mode', _perm['dnd'] == true, () => Native.openSetting('dnd')),
              _Perm(Icons.battery_charging_full_rounded, 'Run in background', 'Stay connected with the screen off', _perm['battery'] == true, () => Native.openSetting('battery')),
              _Perm(Icons.bluetooth_rounded, 'Nearby devices', 'Lets the PC pick this phone for call audio', ok('bt'), () => _ask(Permission.bluetoothConnect)),
              _Perm(Icons.notifications_rounded, 'Show notifications', 'Eye breaks and the connection status', ok('notify'), () => _ask(Permission.notification)),
            ]),
          ),
          const SectionTitle('About'),
          Glass(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('This phone: ${Link.I.deviceName}', style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text('${Link.I.model} · Android ${Link.I.android}', style: const TextStyle(color: C.muted, fontSize: 12)),
              const SizedBox(height: 4),
              const Text('D-Connect 0.1.0 · end-to-end TLS pinned to your PC', style: TextStyle(color: C.muted, fontSize: 12)),
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
