// The phone as the PC's touchpad, keyboard, presenter and media remote.
// Touchpad: one finger moves (with acceleration), tap = click, two-finger tap = right click,
// two-finger drag = scroll, double-tap-and-drag = drag.
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';



import '../../core/connection.dart';
import '../../features/app_state.dart';
import '../../theme/tokens.dart';
import '../widgets/glass.dart';

class RemoteTab extends StatefulWidget {
  const RemoteTab({super.key});
  @override
  State<RemoteTab> createState() => _RemoteTabState();
}

class _RemoteTabState extends State<RemoteTab> {
  int _mode = 0;
  static const _modes = ['Touchpad', 'Keyboard', 'Presenter', 'Media'];

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Link.I,
      builder: (context, _) => Padding(
        padding: EdgeInsets.fromLTRB(18, MediaQuery.of(context).padding.top + 14, 18, 96 + MediaQuery.of(context).padding.bottom),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Remote', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -.5)),
          Text(Link.I.connected ? 'Controlling ${Link.I.pc?.name}' : 'Connect to your PC to use the remote', style: const TextStyle(color: C.muted)),
          const SizedBox(height: 16),
          _Segmented(value: _mode, labels: _modes, onChanged: (v) => setState(() => _mode = v)),
          const SizedBox(height: 16),
          Expanded(
            child: AbsorbPointer(
              absorbing: !Link.I.connected,
              child: AnimatedOpacity(
                duration: M.med,
                opacity: Link.I.connected ? 1 : .4,
                child: AnimatedSwitcher(
                  duration: M.med,
                  switchInCurve: M.ease,
                  transitionBuilder: (c, a) => FadeTransition(opacity: a, child: ScaleTransition(scale: Tween(begin: .97, end: 1.0).animate(a), child: c)),
                  child: KeyedSubtree(key: ValueKey(_mode), child: [const _Touchpad(), const _Keyboard(), const _Presenter(), const _PcMedia()][_mode]),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Segmented extends StatelessWidget {
  final int value;
  final List<String> labels;
  final ValueChanged<int> onChanged;
  const _Segmented({required this.value, required this.labels, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: .05), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white.withValues(alpha: .06))),
      child: LayoutBuilder(builder: (context, box) {
        final w = box.maxWidth / labels.length;
        return Stack(children: [
          AnimatedPositioned(duration: M.med, curve: M.spring, left: value * w, width: w, top: 0, bottom: 0, child: Container(decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), gradient: LinearGradient(colors: [C.violet.withValues(alpha: .4), C.cyan.withValues(alpha: .2)])))),
          Row(children: [
            for (var i = 0; i < labels.length; i++)
              Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    onChanged(i);
                  },
                  child: Center(child: Text(labels[i], maxLines: 1, overflow: TextOverflow.fade, softWrap: false, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: value == i ? Colors.white : Colors.white.withValues(alpha: .5)))),
                ),
              ),
          ]),
        ]);
      }),
    );
  }
}

// ---------------------------------------------------------------- touchpad
class _Touchpad extends StatefulWidget {
  const _Touchpad();
  @override
  State<_Touchpad> createState() => _TouchpadState();
}

class _TouchpadState extends State<_Touchpad> {
  final _pointers = <int, Offset>{};
  Offset? _ripple;
  int _maxPointers = 0;
  DateTime _downAt = DateTime.now();
  double _moved = 0;
  DateTime _lastTap = DateTime(0);
  bool _dragging = false;
  double _accX = 0, _accY = 0;
  DateTime _lastSend = DateTime(0);

  void _flush() {
    final now = DateTime.now();
    if (now.difference(_lastSend).inMilliseconds < 12) return;
    _lastSend = now;
    if (_accX.abs() >= 1 || _accY.abs() >= 1) {
      Link.I.send('pc.mouse.move', {'dx': _accX.round(), 'dy': _accY.round()});
      _accX -= _accX.round();
      _accY -= _accY.round();
    }
  }

  void _down(PointerDownEvent e) {
    _pointers[e.pointer] = e.localPosition;
    if (_pointers.length == 1) {
      _downAt = DateTime.now();
      _moved = 0;
      _maxPointers = 1;
      // a tap quickly followed by a press = drag
      if (DateTime.now().difference(_lastTap).inMilliseconds < 260) {
        _dragging = true;
        Link.I.send('pc.mouse.button', {'button': 'left', 'state': 'down'});
        HapticFeedback.lightImpact();
      }
    }
    _maxPointers = max(_maxPointers, _pointers.length);
    setState(() => _ripple = e.localPosition);
  }

  void _move(PointerMoveEvent e) {
    final prev = _pointers[e.pointer];
    if (prev == null) return;
    _pointers[e.pointer] = e.localPosition;
    final d = e.localPosition - prev;
    _moved += d.distance;
    if (_pointers.length == 1) {
      // pointer acceleration: faster swipes travel further
      final speed = d.distance;
      final gain = 1.4 + min(2.6, speed / 9);
      _accX += d.dx * gain;
      _accY += d.dy * gain;
      _flush();
    } else if (_pointers.length == 2 && e.pointer == _pointers.keys.first) {
      Link.I.send('pc.mouse.scroll', {'dy': (-d.dy * 6).round(), 'dx': (-d.dx * 6).round()});
    }
  }

  void _up(PointerEvent e) {
    _pointers.remove(e.pointer);
    if (_pointers.isNotEmpty) return;
    final quick = DateTime.now().difference(_downAt).inMilliseconds < 220 && _moved < 12;
    if (_dragging) {
      _dragging = false;
      Link.I.send('pc.mouse.button', {'button': 'left', 'state': 'up'});
    } else if (quick) {
      final button = _maxPointers >= 2 ? 'right' : 'left';
      Link.I.send('pc.mouse.button', {'button': button, 'state': 'click'});
      HapticFeedback.selectionClick();
      _lastTap = DateTime.now();
    }
    setState(() => _ripple = null);
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Expanded(
        child: Listener(
          onPointerDown: _down,
          onPointerMove: _move,
          onPointerUp: _up,
          onPointerCancel: _up,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                gradient: LinearGradient(colors: [const Color(0xFF1C2448).withValues(alpha: .8), const Color(0xFF0E1226).withValues(alpha: .8)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                border: Border.all(color: Colors.white.withValues(alpha: .08)),
              ),
              child: Stack(children: [
                CustomPaint(size: Size.infinite, painter: _DotGrid()),
                if (_ripple != null)
                  Positioned(
                    left: _ripple!.dx - 60,
                    top: _ripple!.dy - 60,
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: 1),
                      duration: M.slow,
                      builder: (_, v, __) => Opacity(
                        opacity: 1 - v * .7,
                        child: Container(width: 120, height: 120, decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [C.cyan.withValues(alpha: .35), Colors.transparent]))),
                      ),
                    ),
                  ),
                Center(
                  child: IgnorePointer(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.touch_app_outlined, size: 38, color: Colors.white.withValues(alpha: .18)),
                      const SizedBox(height: 10),
                      Text('Tap to click · two fingers to scroll\nTwo-finger tap for right-click · double-tap & hold to drag', textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: .28), fontSize: 12, height: 1.6)),
                    ]),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _Btn('Left', () => Link.I.send('pc.mouse.button', {'button': 'left'}))),
        const SizedBox(width: 10),
        Expanded(child: _Btn('Right', () => Link.I.send('pc.mouse.button', {'button': 'right'}))),
      ]),
    ]);
  }
}

class _DotGrid extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = Colors.white.withValues(alpha: .05);
    for (double x = 14; x < size.width; x += 24) {
      for (double y = 14; y < size.height; y += 24) {
        canvas.drawCircle(Offset(x, y), 1.2, p);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _Btn extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final double height;
  const _Btn(this.label, this.onTap, {this.icon}) : height = 54;
  @override
  Widget build(BuildContext context) {
    return Press(
      onTap: onTap,
      child: Glass(
        padding: EdgeInsets.zero,
        radius: 18,
        child: SizedBox(
          height: height,
          child: Center(
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (icon != null) ...[Icon(icon, size: 20), if (label.isNotEmpty) const SizedBox(width: 8)],
              if (label.isNotEmpty) Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- keyboard
class _Keyboard extends StatefulWidget {
  const _Keyboard();
  @override
  State<_Keyboard> createState() => _KeyboardState();
}

class _KeyboardState extends State<_Keyboard> {
  final _c = TextEditingController();
  final _f = FocusNode();
  String _last = '';

  // Live typing: diff the field against what was already sent.
  void _changed(String v) {
    if (v.length > _last.length && v.startsWith(_last)) {
      Link.I.send('pc.text', {'text': v.substring(_last.length)});
    } else if (v.length < _last.length && _last.startsWith(v)) {
      for (var i = 0; i < _last.length - v.length; i++) {
        Link.I.send('pc.key', {'key': 'backspace'});
      }
    } else {
      Link.I.send('pc.text', {'text': v});
    }
    _last = v;
  }

  void _key(String k) => Link.I.send('pc.key', {'key': k});
  void _combo(List<String> k) => Link.I.send('pc.combo', {'keys': k});

  @override
  Widget build(BuildContext context) {
    return ListView(padding: EdgeInsets.zero, children: [
      Glass(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Type on your PC', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 4),
          const Text('Everything you type goes straight to the focused window.', style: TextStyle(color: C.muted, fontSize: 12.5)),
          const SizedBox(height: 14),
          TextField(
            controller: _c,
            focusNode: _f,
            autofocus: true,
            maxLines: 3,
            minLines: 1,
            onChanged: _changed,
            onSubmitted: (_) {
              _key('enter');
              _c.clear();
              _last = '';
              _f.requestFocus();
            },
            decoration: const InputDecoration(hintText: 'Start typing…'),
          ),
        ]),
      ),
      const SizedBox(height: 14),
      GridView.count(
        padding: EdgeInsets.zero,
        crossAxisCount: 4,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.5,
        children: [
          _Btn('Esc', () => _key('esc')),
          _Btn('Tab', () => _key('tab')),
          _Btn('', () => _key('up'), icon: Icons.keyboard_arrow_up_rounded),
          _Btn('⌫', () => _key('backspace')),
          _Btn('Enter', () {
            _key('enter');
            _c.clear();
            _last = '';
          }),
          _Btn('', () => _key('left'), icon: Icons.keyboard_arrow_left_rounded),
          _Btn('', () => _key('down'), icon: Icons.keyboard_arrow_down_rounded),
          _Btn('', () => _key('right'), icon: Icons.keyboard_arrow_right_rounded),
          _Btn('Copy', () => _combo(['leftctrl', 'c'])),
          _Btn('Paste', () => _combo(['leftctrl', 'v'])),
          _Btn('Undo', () => _combo(['leftctrl', 'z'])),
          _Btn('Alt+Tab', () => _combo(['leftalt', 'tab'])),
          _Btn('', () => _key('volumedown'), icon: Icons.volume_down_rounded),
          _Btn('', () => _key('mute'), icon: Icons.volume_off_rounded),
          _Btn('', () => _key('volumeup'), icon: Icons.volume_up_rounded),
          _Btn('', () => _key('leftmeta'), icon: Icons.window_rounded),
        ],
      ),
    ]);
  }
}

// ---------------------------------------------------------------- presenter
class _Presenter extends StatelessWidget {
  const _Presenter();
  void _slide(String dir) {
    HapticFeedback.mediumImpact();
    Link.I.send('pc.slide', {'dir': dir});
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Row(children: [
        Expanded(child: _Btn('Start', () => _slide('start'), icon: Icons.slideshow_rounded)),
        const SizedBox(width: 10),
        Expanded(child: _Btn('End', () => _slide('end'), icon: Icons.stop_circle_outlined)),
      ]),
      const SizedBox(height: 12),
      Expanded(
        child: Press(
          scale: .97,
          onTap: () => _slide('prev'),
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(28), color: Colors.white.withValues(alpha: .05), border: Border.all(color: Colors.white.withValues(alpha: .08))),
            child: const Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.arrow_back_rounded, size: 40), SizedBox(height: 6), Text('Previous', style: TextStyle(fontWeight: FontWeight.w600))]),
          ),
        ),
      ),
      const SizedBox(height: 12),
      Expanded(
        flex: 2,
        child: Press(
          scale: .97,
          onTap: () => _slide('next'),
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(28), gradient: C.primary, boxShadow: [BoxShadow(color: C.cyan.withValues(alpha: .4), blurRadius: 40, spreadRadius: -10)]),
            child: const Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.arrow_forward_rounded, size: 56, color: C.ink950), SizedBox(height: 6), Text('Next slide', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: C.ink950))]),
          ),
        ),
      ),
    ]);
  }
}

// ---------------------------------------------------------------- PC media
class _PcMedia extends StatelessWidget {
  const _PcMedia();
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppState.I,
      builder: (context, _) {
        final players = AppState.I.pcPlayers;
        if (players.isEmpty) {
          return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.music_off_rounded, size: 46, color: Colors.white.withValues(alpha: .25)), const SizedBox(height: 10), const Text('Nothing playing on your PC', style: TextStyle(color: C.muted))]));
        }
        final p = players.firstWhere((x) => x.playing, orElse: () => players.first);
        void cmd(String c) {
          HapticFeedback.selectionClick();
          Link.I.send('media.pc.cmd', {'id': p.id, 'cmd': c});
        }

        return Column(children: [
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(32), gradient: C.auroraPink, boxShadow: [BoxShadow(color: C.pink.withValues(alpha: .35), blurRadius: 50, spreadRadius: -12)]),
              child: Icon(p.playing ? Icons.graphic_eq_rounded : Icons.music_note_rounded, size: 90, color: Colors.white.withValues(alpha: .9)),
            ),
          ),
          const SizedBox(height: 22),
          Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          Text('${p.artist ?? ''} · ${p.app}', style: const TextStyle(color: C.muted)),
          const SizedBox(height: 18),
          Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
            IconButton(iconSize: 36, onPressed: () => cmd('prev'), icon: const Icon(Icons.skip_previous_rounded)),
            Press(onTap: () => cmd('toggle'), child: Container(width: 74, height: 74, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: Icon(p.playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: C.ink950, size: 38))),
            IconButton(iconSize: 36, onPressed: () => cmd('next'), icon: const Icon(Icons.skip_next_rounded)),
          ]),
          const SizedBox(height: 8),
        ]);
      },
    );
  }
}
