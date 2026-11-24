// Files both ways. Phone -> PC streams chunks with a flow-control window the PC acks;
// PC -> phone lands in Downloads/D-Connect through MediaStore.
import 'dart:async';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../core/connection.dart';
import '../core/native.dart';
import '../core/protocol.dart';
import 'app_state.dart';

const _chunk = 256 * 1024;
const _window = 8 * 1024 * 1024;

class Files {
  static final _sinks = <String, IOSink>{};
  static final _paths = <String, String>{};
  static final _acked = <String, int>{};
  static final _accepted = <String, Completer<bool>>{};
  static final _photoWaiters = <String, Completer<String>>{};

  static void init() {
    final link = Link.I;
    link.on('file.offer').listen((m) async {
      final d = m.data as Map;
      final fid = d['fid'] as String;
      final t = Transfer(fid, d['name'] ?? 'file', d['size'] ?? 0, true);
      AppState.I.transfers.insert(0, t);
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/dc-$fid';
      _paths[fid] = path;
      _sinks[fid] = File(path).openWrite();
      t.state = 'active';
      AppState.I.touch();
      link.send('file.accept', {'fid': fid});
    });
    link.binary.where((b) => b.channel == Ch.file).listen((b) {
      final fid = b.header['fid'] as String;
      final sink = _sinks[fid];
      if (sink == null) return;
      sink.add(b.payload);
      final t = _find(fid);
      if (t == null) return;
      final before = t.done;
      t.done += b.payload.length;
      if (t.done ~/ (4 * 1024 * 1024) != before ~/ (4 * 1024 * 1024)) link.send('file.ack', {'fid': fid, 'done': t.done});
      if (t.done - before > 0 && (t.done * 20 ~/ (t.size == 0 ? 1 : t.size)) != (before * 20 ~/ (t.size == 0 ? 1 : t.size))) AppState.I.touch();
    });
    link.on('file.done').listen((m) async {
      final fid = m.data['fid'] as String;
      final sink = _sinks.remove(fid);
      final t = _find(fid);
      if (sink == null || t == null) return;
      await sink.close();
      t.savedUri = await Native.saveDownload(_paths[fid]!, t.name, null);
      t.state = 'done';
      AppState.I.touch();
    });
    link.on('file.accept').listen((m) => _accepted.remove(m.data['fid'])?.complete(true));
    link.on('file.reject').listen((m) => _accepted.remove(m.data['fid'])?.complete(false));
    link.on('file.ack').listen((m) => _acked[m.data['fid']] = m.data['done'] ?? 0);
    link.on('file.cancel').listen((m) {
      final t = _find(m.data['fid']);
      if (t != null) t.state = 'failed';
      _sinks.remove(m.data['fid'])?.close();
      AppState.I.touch();
    });
  }

  static Transfer? _find(String fid) {
    for (final t in AppState.I.transfers) {
      if (t.fid == fid) return t;
    }
    return null;
  }

  // Send a file on disk to the PC. tag "photo" answers photos.fetch.
  static Future<bool> send(String path, {String? name, String? tag}) async {
    final f = File(path);
    if (!await f.exists()) return false;
    final size = await f.length();
    final fid = const Uuid().v4();
    final t = Transfer(fid, name ?? path.split('/').last, size, false);
    if (tag == null) {
      AppState.I.transfers.insert(0, t);
      AppState.I.touch();
    }
    final accepted = Completer<bool>();
    _accepted[fid] = accepted;
    _acked[fid] = 0;
    Link.I.send('file.offer', {'fid': fid, 'name': t.name, 'size': size, if (tag != null) 'tag': tag});
    final ok = await accepted.future.timeout(const Duration(minutes: 2), onTimeout: () => false);
    if (!ok) {
      t.state = 'failed';
      AppState.I.touch();
      return false;
    }
    t.state = 'active';
    final raf = await f.open();
    try {
      var seq = 0;
      var lastUi = 0;
      while (t.done < size) {
        if (!Link.I.connected) throw 'disconnected';
        while (t.done - (_acked[fid] ?? 0) > _window) {
          await Future.delayed(const Duration(milliseconds: 15));
          if (!Link.I.connected) throw 'disconnected';
        }
        final bytes = await raf.read(_chunk);
        if (bytes.isEmpty) break;
        Link.I.sendBinary(Ch.file, {'fid': fid, 'seq': seq++}, bytes);
        t.done += bytes.length;
        final now = DateTime.now().millisecondsSinceEpoch;
        if (now - lastUi > 120) {
          lastUi = now;
          AppState.I.touch();
        }
        if (seq % 8 == 0) await Future.delayed(Duration.zero); // let the socket breathe
      }
      Link.I.send('file.done', {'fid': fid});
      t.state = 'done';
    } catch (_) {
      t.state = 'failed';
    } finally {
      await raf.close();
      _acked.remove(fid);
      AppState.I.touch();
    }
    return t.state == 'done';
  }

  static Completer<String> waitPhoto(String id) => _photoWaiters[id] = Completer<String>();
}
