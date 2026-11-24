import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/connection.dart';
import '../../core/native.dart';
import '../../features/app_state.dart';
import '../../features/bridge.dart';
import '../../features/eye.dart';
import '../../features/files.dart';
import '../../theme/tokens.dart';
import '../widgets/connect_scene.dart';
import '../widgets/glass.dart';
import '../widgets/ring.dart';

class HomeTab extends StatelessWidget {
  final void Function(int) onGo;
  const HomeTab({super.key, required this.onGo});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([Link.I, AppState.I, Eye.I]),
      builder: (context, _) {
        final link = Link.I;
        final app = AppState.I;
        return PinnedPage(
          header: _Header(),
          children: [
            _PcCard().animate().fadeIn(duration: 400.ms).slideY(begin: .08, curve: M.ease),
            if (!link.connected && !link.standby) ...[
              const SizedBox(height: 4),
              ConnectScene(state: SceneState.searching, phoneName: link.deviceName, pcName: link.pc?.name ?? 'PC', height: 220),
              Center(child: Text(link.error ?? 'Open D-Connect on ${link.pc?.name ?? 'your PC'}. Same Wi-Fi, or plug in USB.', textAlign: TextAlign.center, style: const TextStyle(color: C.muted))),
            ],
            const SectionTitle('Quick actions'),
            GridView.count(
              padding: EdgeInsets.zero,
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.02,
              children: [
                _Tile(Icons.upload_file_rounded, 'Send files', [C.violet, C.cyan], link.connected ? () => _pickFiles(context) : null),
                _Tile(Icons.content_paste_go_rounded, 'Clipboard', [C.cyan, C.mint], link.connected ? () => _clip(context) : null),
                _Tile(Icons.touch_app_rounded, 'Touchpad', [C.pink, C.violet], link.connected ? () => onGo(1) : null),
                _Tile(Icons.radar_rounded, 'Find PC', [C.amber, C.pink], link.connected ? () => Link.I.send('find.pc', {'on': true}) : null),
                _Tile(Icons.link_rounded, 'Send link', [C.violet, C.pink], link.connected ? () => _shareLink(context) : null),
                _Tile(Icons.visibility_rounded, 'Eye break', [C.cyan, C.mint], link.connected ? Eye.I.takeNow : null),
              ].animate(interval: 40.ms).fadeIn(duration: 350.ms).scale(begin: const Offset(.92, .92), curve: M.spring),
            ),
            if (app.pcPlayers.isNotEmpty) ...[const SectionTitle('Playing on your PC'), for (final p in app.pcPlayers.take(2)) _MediaCard(p)],
            if (link.connected && app.commands.isNotEmpty) ...[
              const SectionTitle('PC actions'),
              GridView.count(
                padding: EdgeInsets.zero,
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.15,
                children: [
                  for (final c in app.commands)
                    Press(
                      onTap: () {
                        Link.I.send('commands.run', {'id': c.id});
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${c.name} ✓'), duration: const Duration(seconds: 1)));
                      },
                      child: Glass(
                        padding: const EdgeInsets.all(12),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Icon(_cmdIcon(c.icon), color: C.violetSoft),
                          const SizedBox(height: 8),
                          Text(c.name, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        ]),
                      ),
                    ),
                ],
              ),
            ],
            _EyeMini(onTap: () => onGo(2)),
            if (app.transfers.isNotEmpty) ...[const SectionTitle('Transfers'), for (final t in app.transfers.take(5)) _TransferRow(t)],
          ],
        );
      },
    );
  }

  static IconData _cmdIcon(String i) => switch (i) {
        'lock' => Icons.lock_rounded,
        'moon' => Icons.bedtime_rounded,
        'volume-x' => Icons.volume_off_rounded,
        'camera' => Icons.screenshot_monitor_rounded,
        'coffee' => Icons.coffee_rounded,
        _ => Icons.terminal_rounded,
      };

  Future<void> _pickFiles(BuildContext context) async {
    final files = await FilePicker.pickFiles(); // multi-select by default since file_picker 13
    for (final f in files) {
      if (f.path != null) Files.send(f.path!, name: f.name);
    }
  }

  Future<void> _clip(BuildContext context) async {
    await Bridge.sendClipboard();
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Clipboard sent to your PC'), duration: Duration(seconds: 1)));
  }

  Future<void> _shareLink(BuildContext context) async {
    final c = TextEditingController();
    final v = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: Glass(
          strong: true,
          radius: 28,
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Open on your PC', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('A link opens in the PC\'s browser. Any other text lands on its clipboard.', style: TextStyle(color: C.muted)),
            const SizedBox(height: 16),
            TextField(controller: c, autofocus: true, decoration: const InputDecoration(hintText: 'https://…')),
            const SizedBox(height: 14),
            GradientButton(label: 'Send', icon: Icons.send_rounded, expand: true, onTap: () => Navigator.pop(ctx, c.text.trim())),
          ]),
        ),
      ),
    );
    if (v == null || v.isEmpty) return;
    if (RegExp(r'^https?://').hasMatch(v)) {
      Link.I.send('share.url', {'url': v, 'open': true});
    } else {
      Link.I.send('share.text', {'text': v});
    }
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final h = DateTime.now().hour;
    return Row(children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening', style: const TextStyle(color: C.muted, fontSize: 14)),
          const Text('D-Connect', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -.5)),
        ]),
      ),
      Press(
        onTap: () => Native.openSetting('app'),
        child: Container(width: 44, height: 44, decoration: BoxDecoration(gradient: C.aurora, borderRadius: BorderRadius.circular(14)), child: const Center(child: Text('D', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: C.ink850)))),
      ),
    ]);
  }
}

class _PcCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final link = Link.I;
    final on = link.connected;
    return Glass(
      strong: true,
      radius: 26,
      padding: const EdgeInsets.all(20),
      child: Row(children: [
        Hero(
          tag: 'pc',
          child: AnimatedContainer(
            duration: M.slow,
            width: 70,
            height: 56,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(colors: [Color(0xFF2A3360), Color(0xFF121731)]),
              border: Border.all(color: Colors.white.withValues(alpha: .15)),
              boxShadow: [BoxShadow(color: (on ? C.mint : C.violet).withValues(alpha: .4), blurRadius: 30)],
            ),
            child: const Icon(Icons.laptop_rounded, color: C.cyanSoft, size: 30),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Pill(on ? 'Connected' : link.standby ? 'Standby' : _stateText(link.state), color: on ? C.mint : link.standby ? C.violetSoft : C.amber, dot: true),
              if (on) ...[const SizedBox(width: 6), Pill(link.via == 'usb' ? 'USB' : 'Wi-Fi${link.rtt > 0 ? ' · ${link.rtt} ms' : ''}', color: link.via == 'usb' ? C.violetSoft : C.cyan)],
            ]),
            const SizedBox(height: 8),
            Text(link.pc?.name ?? 'Your PC', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            if (link.standby) ...[
              const SizedBox(height: 4),
              Text('The PC is using ${link.activeElsewhere ?? 'another phone'} right now.', style: const TextStyle(color: C.muted, fontSize: 12)),
              const SizedBox(height: 10),
              Press(
                onTap: link.claim,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(gradient: C.primary, borderRadius: BorderRadius.circular(12)),
                  child: const Text('Use this phone', style: TextStyle(color: C.ink950, fontWeight: FontWeight.w800, fontSize: 13)),
                ),
              ),
            ],
          ]),
        ),
      ]),
    );
  }

  String _stateText(LinkState s) => switch (s) {
        LinkState.searching => 'Searching',
        LinkState.connecting => 'Connecting',
        LinkState.handshake => 'Securing',
        _ => 'Offline',
      };
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final List<Color> colors;
  final VoidCallback? onTap;
  const _Tile(this.icon, this.label, this.colors, this.onTap);
  @override
  Widget build(BuildContext context) {
    return Press(
      onTap: onTap,
      child: AnimatedOpacity(
        duration: M.med,
        opacity: onTap == null ? .45 : 1,
        child: Glass(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(13), gradient: LinearGradient(colors: [colors[0].withValues(alpha: .4), colors[1].withValues(alpha: .18)]), border: Border.all(color: Colors.white12)),
              child: Icon(icon, size: 21),
            ),
            Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ]),
        ),
      ),
    );
  }
}

class _MediaCard extends StatelessWidget {
  final PcPlayer p;
  const _MediaCard(this.p);
  @override
  Widget build(BuildContext context) {
    void cmd(String c) => Link.I.send('media.pc.cmd', {'id': p.id, 'cmd': c});
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Glass(
        child: Row(children: [
          Container(width: 48, height: 48, decoration: BoxDecoration(gradient: C.auroraPink, borderRadius: BorderRadius.circular(14)), child: Icon(p.playing ? Icons.graphic_eq_rounded : Icons.music_note_rounded)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)), Text('${p.artist ?? ''} · ${p.app}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: C.muted, fontSize: 12))])),
          IconButton(onPressed: () => cmd('prev'), icon: const Icon(Icons.skip_previous_rounded)),
          Press(onTap: () => cmd('toggle'), child: Container(width: 42, height: 42, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: Icon(p.playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: C.ink950))),
          IconButton(onPressed: () => cmd('next'), icon: const Icon(Icons.skip_next_rounded)),
        ]),
      ),
    );
  }
}

class _EyeMini extends StatelessWidget {
  final VoidCallback onTap;
  const _EyeMini({required this.onTap});
  @override
  Widget build(BuildContext context) {
    final e = Eye.I;
    final left = e.leftMs;
    return Padding(
      padding: const EdgeInsets.only(top: 22),
      child: Press(
        onTap: onTap,
        child: Glass(
          child: Row(children: [
            Ring(value: e.on ? 1 - left / e.everyMs : 0, size: 64, stroke: 6, colors: const [C.cyan, C.mint], child: const Icon(Icons.visibility_rounded, color: C.cyanSoft)),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('20 · 20 · 20', style: TextStyle(fontSize: 11, letterSpacing: 1.5, fontWeight: FontWeight.w700, color: Colors.white.withValues(alpha: .45))),
                const SizedBox(height: 3),
                Text(e.on ? 'Break in ${(left / 60000).ceil()} min' : 'Eye breaks off', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                Text(e.streak > 0 ? '🔥 ${e.streak}-day streak' : 'Synced with your PC', style: const TextStyle(color: C.muted, fontSize: 12)),
              ]),
            ),
            const Icon(Icons.chevron_right_rounded, color: C.muted),
          ]),
        ),
      ),
    );
  }
}

class _TransferRow extends StatelessWidget {
  final Transfer t;
  const _TransferRow(this.t);
  @override
  Widget build(BuildContext context) {
    final done = t.state == 'done';
    final bad = t.state == 'failed';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Press(
        onTap: done && t.savedUri != null ? () => Native.openFile(t.savedUri!) : null,
        child: Glass(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Ring(
              value: done ? 1 : t.pct,
              size: 42,
              stroke: 4,
              colors: bad ? const [C.rose, C.pink] : done ? const [C.mint, C.cyanSoft] : const [C.violet, C.cyan],
              child: Icon(done ? Icons.check_rounded : bad ? Icons.close_rounded : t.incoming ? Icons.south_rounded : Icons.north_rounded, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(t.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)), Text('${t.incoming ? 'From PC' : 'To PC'} · ${done ? 'done' : bad ? 'failed' : '${(t.pct * 100).round()}%'}', style: const TextStyle(color: C.muted, fontSize: 12))])),
          ]),
        ),
      ),
    );
  }
}
