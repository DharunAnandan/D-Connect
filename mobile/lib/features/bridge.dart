// Routes the PC's requests to Android and Android's events to the PC.
import 'dart:async';

import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

import '../core/connection.dart';
import '../core/native.dart';
import '../core/protocol.dart';
import 'app_state.dart';
import 'files.dart';

class Bridge {
  static Timer? _statusTimer;
  static String _lastClip = '';

  static void init() {
    final link = Link.I;

    // ---------------------------------------------------------------- PC -> phone
    link.messages.listen((m) async {
      final d = (m.data is Map) ? Map<String, dynamic>.from(m.data) : <String, dynamic>{};
      switch (m.type) {
        // notifications
        case 'notif.dismiss':
          Native.call('notifDismiss', {'key': d['key']});
        case 'notif.reply':
          final r = await Native.call<String>('notifReply', {'key': d['key'], 'text': d['text']});
          if (m.id != null) link.reply(m, 'notif.replied', {'result': r ?? 'failed'});
        case 'notif.action':
          Native.call('notifAction', {'key': d['key'], 'index': d['index']});
        // sms
        case 'sms.threads.get':
          link.reply(m, 'sms.threads', {'threads': await Native.list('smsThreads')});
        case 'sms.messages.get':
          link.reply(m, 'sms.messages', {'messages': await Native.list('smsMessages', {'threadId': d['threadId']})});
        case 'sms.send':
          final ok = await Native.call<bool>('smsSend', {'address': d['address'], 'body': d['body']});
          if (m.id != null) link.reply(m, 'sms.sent', {'ok': ok == true});
        case 'contacts.search':
          link.reply(m, 'contacts', {'items': await Native.list('contacts', {'q': d['q']})});
        // calls
        case 'calllog.get':
          link.reply(m, 'calllog', {'calls': await Native.list('callLog')});
        case 'call.answer':
          Native.call('callAnswer');
        case 'call.reject':
        case 'call.end':
          Native.call('callEnd');
        case 'call.dial':
          Native.call('callDial', {'number': d['number'], 'sim': d['sim']});
        case 'calls.sims':
          link.reply(m, 'calls.sims', {'sims': await Native.list('sims')});
        case 'call.current':
          if (m.id != null) link.reply(m, 'call.current', await Native.map('callCurrent'));
        case 'call.control':
          final ok = await Native.call<bool>('callControl', {'action': d['action'], 'target': d['target']});
          if (m.id != null) link.reply(m, 'call.control', {'ok': ok == true});
        case 'call.route.bt':
          Native.call('callRouteBt');
        case 'call.mute':
          Native.call('callMute', {'muted': d['muted']});
        // photos
        case 'apps.list':
          link.reply(m, 'apps', {'apps': await Native.list('apps')});
        case 'photos.get':
          link.reply(m, 'photos.list', {'items': await Native.list('photos', {'offset': d['offset'] ?? 0, 'limit': d['limit'] ?? 48, 'kind': d['kind'], 'bucket': d['bucket']})});
        case 'photos.albums':
          link.reply(m, 'photos.albums', {'albums': await Native.list('albums', {'kind': d['kind']})});
        case 'photos.fetch':
          final p = await Native.map('photoFile', {'id': d['id']});
          if (p['path'] != null) Files.send(p['path'], name: p['name'], tag: 'photo');
        // clipboard / share
        case 'clip.set':
          final text = d['text'] as String? ?? '';
          _lastClip = text;
          await Clipboard.setData(ClipboardData(text: text));
        case 'pc.alert':
          Native.call('pcAlert', {'title': d['title'] ?? 'Your PC', 'body': d['body'] ?? '', 'tag': d['tag'] ?? 'pc'});
        case 'clip.put':
          // the PC picked an item for this phone: copy it here, don't send it back
          _lastClip = d['text'] ?? '';
          await Clipboard.setData(ClipboardData(text: _lastClip));
          Native.call('toast', {'text': 'Copied from your PC'});
        case 'share.url':
          Native.openUri(d['url']);
        case 'share.text':
          _lastClip = d['text'] ?? '';
          await Clipboard.setData(ClipboardData(text: _lastClip));
          Native.call('toast', {'text': 'Copied from your PC'});
        // extras
        case 'find.ring':
          Native.call('findPhone', {'on': d['on'] != false});
        case 'dnd.set':
          Native.call('setDnd', {'on': d['on'] == true});
          _sendStatus();
        case 'media.phone.cmd':
          Native.call('mediaCmd', {'cmd': d['cmd']});
        // mirror + control
        case 'mirror.start':
          final r = await Native.map('mirrorStart', d);
          if (r['ok'] != true) link.send(r['denied'] == true ? 'mirror.denied' : 'mirror.error', {'message': r['message']});
        case 'mirror.stop':
          Native.call('mirrorStop');
        case 'mirror.keyframe':
          Native.call('mirrorKeyframe');
        case 'phone.volume':
          final r = await Native.map('mediaVolume', d['pct'] == null ? {} : {'pct': d['pct']});
          if (m.id != null) link.reply(m, 'phone.volume', r);
        case 'bt.ensure':
          final on = await Native.call<bool>('btEnsure');
          if (m.id != null) link.reply(m, 'bt.ensure', {'enabled': on == true});
        case 'bt.refresh':
          final ok = await Native.call<bool>('btRefresh', {'address': d['address']});
          if (m.id != null) link.reply(m, 'bt.refresh', {'ok': ok == true});
        case 'bt.pair':
          // ask for "Nearby devices" first if needed, then bond with the PC
          var r = await Native.map('btPair', {'address': d['address']});
          if (r['reason'] == 'permission' && await Permission.bluetoothConnect.request().isGranted) {
            link.send('bt.info', await Native.map('btInfo'));
        // already on a call when the PC connected: show it there right away
        final call = await Native.map('callCurrent');
        if (call['state'] != null && call['state'] != 'idle') link.send('call.state', {...call, 'existing': true});
            r = await Native.map('btPair', {'address': d['address']});
          }
        case 'control.status':
          if (m.id != null) link.reply(m, 'control.status', {'on': await Native.call<bool>('controlAvailable') == true});
        case 'open.setting':
          Native.openSetting(d['which'] ?? 'app');
        case 'input.touch':
          if (await Native.call<bool>('controlAvailable') != true) {
            link.send('mirror.control', {'control': false});
          }
          Native.call('inputTouch', d);
        case 'input.scroll':
          Native.call('inputScroll', d);
        case 'input.key':
          Native.call('inputKey', d);
        case 'input.text':
          Native.call('inputText', d);
      }
    });

    // ---------------------------------------------------------------- phone -> PC
    Native.events.listen((e) {
      final type = e['type'] as String?;
      final data = e['data'];
      switch (type) {
        case 'clip.tile':
          // sent from the quick-settings tile
          if (data is String && data.isNotEmpty) {
            _lastClip = data;
            link.send('clip.set', {'text': data});
          }
        case 'notif.posted':
        case 'notif.removed':
        case 'sms.received':
        case 'call.state':
        case 'call.audio':
        case 'call.route.result':
        case 'call.debug':
        case 'media.phone.state':
          link.send(type!, data);
        case 'mirror.control':
        case 'mirror.started':
        case 'mirror.stopped':
        case 'mirror.denied':
        case 'mirror.error':
          link.send(type!, data);
        case 'screen':
          link.send('eye.screen', {'on': data == true});
        case 'battery':
          _sendStatus();
        case 'bt.bond':
          link.send('bt.bond', data);
        case 'bt.state':
          link.send('bt.state', data);
        case 'share':
          _onShare(Map<String, dynamic>.from(data as Map));
      }
    });

    // video frames straight onto the socket
    Native.video.listen((f) {
      final bytes = f['data'] as Uint8List;
      link.sendBinary(Ch.video, {'config': f['config'] == true, 'key': f['key'] == true, 'pts': f['pts'] ?? 0}, bytes);
    });

    link.addListener(() async {
      if (link.connected) {
        _sendStatus();
        _statusTimer ??= Timer.periodic(const Duration(seconds: 30), (_) => _sendStatus());
        link.send('notif.all', {'items': await Native.list('notifications')});
        final media = await Native.map('mediaState');
        if (media.isNotEmpty) link.send('media.phone.state', media);
        link.send('eye.screen', {'on': true});
        link.send('bt.info', await Native.map('btInfo'));
        // already on a call when the PC connected: show it there right away
        // (and "no call" too, so a card left over from a call that ended meanwhile closes)
        final call = await Native.map('callCurrent');
        link.send('call.state', {...call, 'existing': true});
      } else {
        _statusTimer?.cancel();
        _statusTimer = null;
      }
    });
  }

  static Future<void> _sendStatus() async {
    if (!Link.I.connected) return;
    Link.I.send('phone.status', await Native.status());
  }

  // The app is in front: offer the phone's clipboard to the PC (Android only lets the
  // foreground app read it).
  static Future<void> syncClipboardFromPhone() async {
    if (!Link.I.connected || !AppState.I.clipboardSync) return;
    final d = await Clipboard.getData(Clipboard.kTextPlain);
    final text = d?.text ?? '';
    if (text.isEmpty || text == _lastClip) return;
    _lastClip = text;
    Link.I.send('clip.set', {'text': text});
  }

  // copied from the history on purpose: not a new copy to send to the PC
  static void markClip(String text) => _lastClip = text;

  static Future<void> sendClipboard() async {
    final d = await Clipboard.getData(Clipboard.kTextPlain);
    final text = d?.text ?? '';
    if (text.isEmpty) return;
    _lastClip = text;
    Link.I.send('clip.set', {'text': text});
  }

  // Shared to D-Connect from another app: files go as files, links open on the PC.
  static void _onShare(Map<String, dynamic> s) {
    final files = (s['files'] as List?)?.cast<Map>() ?? [];
    for (final f in files) {
      Files.send(f['path'], name: f['name']);
    }
    final text = s['text'] as String?;
    if (text != null && text.isNotEmpty) {
      final url = RegExp(r'https?://\S+').firstMatch(text)?.group(0);
      if (url != null) {
        Link.I.send('share.url', {'url': url, 'open': true});
      } else {
        Link.I.send('share.text', {'text': text});
      }
    }
  }
}
