// Everything the phone UI shows that comes from the PC.
import 'package:flutter/foundation.dart';
import '../core/connection.dart';

class PcPlayer {
  final String id, app, title;
  final String? artist;
  final bool playing;
  PcPlayer(this.id, this.app, this.title, this.artist, this.playing);
  factory PcPlayer.fromJson(Map j) => PcPlayer(j['id'] ?? '', j['app'] ?? '', j['title'] ?? '', j['artist'], j['playing'] == true);
}

class QuickCmd {
  final String id, name, icon;
  final bool toggle; // a switch (Mute audio, Keep awake) rather than a one-shot action
  bool on;
  QuickCmd(this.id, this.name, this.icon, {this.toggle = false, this.on = false});
}

class ClipItem {
  final String text, from; // from: 'pc' | 'phone'
  final int time;
  ClipItem(this.text, this.from, this.time);
}

class Transfer {
  final String fid, name;
  final int size;
  int done = 0;
  final bool incoming;
  String state = 'waiting'; // waiting | active | done | failed
  String? savedUri;
  Transfer(this.fid, this.name, this.size, this.incoming);
  double get pct => size == 0 ? 0 : done / size;
}

class AppState extends ChangeNotifier {
  AppState._();
  static final AppState I = AppState._();

  List<PcPlayer> pcPlayers = [];
  List<QuickCmd> commands = [];
  List<ClipItem> clips = []; // clipboard history, shared by the PC

  // something changed in place (e.g. a PC action switch flipped): redraw
  void changed() => notifyListeners();
  final List<Transfer> transfers = [];
  bool clipboardSync = true;

  void init() {
    Link.I.on('media.pc.state').listen((m) {
      pcPlayers = ((m.data?['players'] as List?) ?? []).map((e) => PcPlayer.fromJson(e as Map)).toList();
      notifyListeners();
    });
    Link.I.on('commands.list').listen((m) {
      commands = ((m.data?['commands'] as List?) ?? []).map((e) => QuickCmd(e['id'], e['name'], e['icon'] ?? 'terminal', toggle: e['toggle'] == true, on: e['on'] == true)).toList();
      notifyListeners();
    });
    Link.I.on('clip.history').listen((m) {
      clips = ((m.data?['items'] as List?) ?? []).map((e) => ClipItem(e['text'] ?? '', e['from'] ?? 'pc', (e['time'] as num?)?.toInt() ?? 0)).toList();
      notifyListeners();
    });
    Link.I.on('settings.sync').listen((m) {
      clipboardSync = m.data?['clipboardSync'] != false;
      notifyListeners();
    });
    Link.I.addListener(() {
      if (!Link.I.connected && pcPlayers.isNotEmpty) {
        pcPlayers = [];
        notifyListeners();
      }
    });
  }

  void touch() => notifyListeners();
}
