// The permission list (Settings, and the first-run setup). Each row explains itself first
// (disclosure), then asks Android.
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/native.dart';
import '../../theme/tokens.dart';
import 'disclosure.dart';
import 'glass.dart';

class PermissionList extends StatefulWidget {
  const PermissionList({super.key});
  @override
  State<PermissionList> createState() => _PermissionListState();
}

class _PermissionListState extends State<PermissionList> with WidgetsBindingObserver {
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

  // explain first (what, why, where it goes); only "Allow" goes on to Android's prompt
  Future<void> _ask(Permission p, [String? kind]) async {
    if (kind != null && !await disclose(context, kind)) return;
    final s = await p.request();
    if (s.isPermanentlyDenied) await openAppSettings();
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    // "limited" (Android 14: only some photos chosen) still works for browsing
    bool ok(String k) => _runtime[k]?.isGranted == true || _runtime[k]?.isLimited == true;
    return Glass(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Column(children: [
              PermRow(Icons.notifications_active_rounded, 'Notification access', 'Mirror notifications, reply, media controls', _perm['notifications'] == true, () async {
                if (await disclose(context, 'notifications')) Native.openSetting('notifications');
              }),
              PermRow(Icons.sms_rounded, 'SMS', 'Read and send texts from the PC', ok('sms'), () => _ask(Permission.sms, 'sms')),
              PermRow(Icons.call_rounded, 'Phone & call log', 'Incoming calls, answer and dial from the PC', ok('phone'), () => _ask(Permission.phone, 'phone')),
              PermRow(Icons.contacts_rounded, 'Contacts', 'Show names instead of numbers', ok('contacts'), () => _ask(Permission.contacts, 'contacts')),
              PermRow(Icons.photo_library_rounded, 'Photos & videos',
                  ok('photos') && !ok('videos') ? 'Photos are allowed. Tap to allow videos too' : !ok('photos') && ok('videos') ? 'Videos are allowed. Tap to allow photos too' : 'Browse your gallery and albums on the PC',
                  ok('photos') && ok('videos'), () async {
                if (!await disclose(context, 'photos')) return;
                await Permission.photos.request();
                await _ask(Permission.videos);
              }),
              PermRow(Icons.accessibility_new_rounded, 'Screen control', 'Let the PC tap and type while mirroring (Accessibility)', _perm['accessibility'] == true, () async {
                if (await disclose(context, 'accessibility')) Native.openSetting('accessibility');
              }),
              PermRow(Icons.do_not_disturb_on_rounded, 'Do Not Disturb access', 'Let the PC switch focus mode', _perm['dnd'] == true, () async {
                if (await disclose(context, 'dnd')) Native.openSetting('dnd');
              }),
              PermRow(Icons.battery_charging_full_rounded, 'Run in background', 'Stay connected with the screen off', _perm['battery'] == true, () => Native.openSetting('battery')),
              PermRow(Icons.lock_clock_rounded, 'Work when locked', 'App info → Battery usage → Allow background activity. Without it the phone freezes D-Connect when locked', _perm['background'] == true, () => Native.openSetting('background')),
              PermRow(Icons.bluetooth_rounded, 'Nearby devices', 'Lets the PC pick this phone for call audio', ok('bt'), () => _ask(Permission.bluetoothConnect)),
              PermRow(Icons.notifications_rounded, 'Show notifications', 'Eye breaks and the connection status', ok('notify'), () => _ask(Permission.notification)),
            ]),
          );
  }
}

class PermRow extends StatelessWidget {
  final IconData icon;
  final String title, body;
  final bool granted;
  final VoidCallback onTap;
  const PermRow(this.icon, this.title, this.body, this.granted, this.onTap);
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
