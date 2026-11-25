import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/connection.dart';
import '../../features/app_state.dart';
import '../../features/bridge.dart';
import '../../theme/tokens.dart';
import 'glass.dart';

// Clipboard history from the PC, kept apart by where it was copied. Tap an item to copy it on
// this phone; "Send my clipboard" puts what's copied here on the PC.
Future<void> showClipSheet(BuildContext context) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _ClipSheet(),
    );

class _ClipSheet extends StatefulWidget {
  const _ClipSheet();
  @override
  State<_ClipSheet> createState() => _ClipSheetState();
}

class _ClipSheetState extends State<_ClipSheet> {
  String tab = 'pc';
  String copied = '';

  String _ago(int t) {
    final s = (DateTime.now().millisecondsSinceEpoch - t) ~/ 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return '${s ~/ 60} min ago';
    if (s < 86400) return '${s ~/ 3600} h ago';
    return '${s ~/ 86400} d ago';
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppState.I,
      builder: (context, _) {
        final items = AppState.I.clips.where((c) => c.from == tab).toList();
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * .78),
          child: Glass(
            strong: true,
            radius: 28,
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Expanded(child: Text('Clipboard', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
                TextButton.icon(
                  onPressed: Link.I.connected
                      ? () async {
                          await Bridge.sendClipboard();
                          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sent to your PC'), duration: Duration(seconds: 1)));
                        }
                      : null,
                  icon: const Icon(Icons.upload_rounded, size: 18),
                  label: const Text('Send my clipboard'),
                ),
              ]),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: .06), borderRadius: BorderRadius.circular(99)),
                child: Row(children: [
                  for (final t in const [('pc', 'From PC', Icons.laptop_rounded), ('phone', 'From phone', Icons.smartphone_rounded)])
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => tab = t.$1),
                        child: AnimatedContainer(
                          duration: M.med,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(color: tab == t.$1 ? Colors.white : Colors.transparent, borderRadius: BorderRadius.circular(99)),
                          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            Icon(t.$3, size: 15, color: tab == t.$1 ? C.ink950 : Colors.white60),
                            const SizedBox(width: 6),
                            Text('${t.$2}  ${AppState.I.clips.where((c) => c.from == t.$1).length}', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: tab == t.$1 ? C.ink950 : Colors.white60)),
                          ]),
                        ),
                      ),
                    ),
                ]),
              ),
              const SizedBox(height: 10),
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 28),
                  child: Center(
                    child: Text(tab == 'pc' ? 'Nothing copied on the PC yet.' : 'Nothing from this phone yet. Copy something, then open D-Connect or tap Send my clipboard.',
                        textAlign: TextAlign.center, style: const TextStyle(color: C.muted)),
                  ),
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (_, i) {
                      final c = items[i];
                      final done = copied == '${c.from}${c.time}';
                      return InkWell(
                        borderRadius: BorderRadius.circular(16),
                        onTap: () async {
                          Bridge.markClip(c.text); // so it isn't sent back to the PC as a new copy
                          await Clipboard.setData(ClipboardData(text: c.text));
                          setState(() => copied = '${c.from}${c.time}');
                        },
                        child: Container(
                          padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
                          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .05), borderRadius: BorderRadius.circular(16)),
                          child: Row(children: [
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(c.text, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5)),
                                const SizedBox(height: 3),
                                Text(done ? 'Copied on this phone' : _ago(c.time), style: TextStyle(fontSize: 11, color: done ? C.mint : C.muted)),
                              ]),
                            ),
                            const SizedBox(width: 8),
                            Icon(done ? Icons.check_circle_rounded : Icons.copy_rounded, size: 19, color: done ? C.mint : Colors.white54),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
            ]),
          ),
        );
      },
    );
  }
}
