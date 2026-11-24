// Mirror of desktop/src/shared/protocol.ts.
import 'dart:convert';
import 'dart:typed_data';

const protocolVersion = 1;
const defaultPort = 47820;
const mdnsType = '_dconnect._tcp';

class Ch {
  static const file = 1;
  static const video = 2;
  static const thumb = 3;
}

class Envelope {
  final String type;
  final String? id;
  final dynamic data;
  Envelope(this.type, this.data, [this.id]);
  static Envelope? parse(String raw) {
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return Envelope(m['type'] as String, m['data'], m['id'] as String?);
    } catch (_) {
      return null;
    }
  }

  String encode() => jsonEncode({'type': type, if (id != null) 'id': id, if (data != null) 'data': data});
}

Uint8List encodeBinary(int channel, Map<String, dynamic> header, List<int> payload) {
  final h = utf8.encode(jsonEncode(header));
  final out = Uint8List(3 + h.length + payload.length);
  out[0] = channel;
  out[1] = (h.length >> 8) & 0xff;
  out[2] = h.length & 0xff;
  out.setRange(3, 3 + h.length, h);
  out.setRange(3 + h.length, out.length, payload);
  return out;
}

({int channel, Map<String, dynamic> header, Uint8List payload}) decodeBinary(Uint8List buf) {
  final hlen = (buf[1] << 8) | buf[2];
  final header = jsonDecode(utf8.decode(buf.sublist(3, 3 + hlen))) as Map<String, dynamic>;
  return (channel: buf[0], header: header, payload: Uint8List.sublistView(buf, 3 + hlen));
}

class PairPayload {
  final String name;
  final List<String> hosts;
  final int port;
  final String fp;
  final String token;
  final String id;
  PairPayload({required this.name, required this.hosts, required this.port, required this.fp, required this.token, required this.id});

  static PairPayload? parse(String raw) {
    final u = Uri.tryParse(raw.trim());
    if (u == null || u.scheme != 'dconnect') return null;
    final q = u.queryParameters;
    if ((q['f'] ?? '').isEmpty || (q['t'] ?? '').isEmpty) return null;
    return PairPayload(
      name: q['n'] ?? 'PC',
      hosts: (q['h'] ?? '').split(',').where((e) => e.isNotEmpty).toList(),
      port: int.tryParse(q['p'] ?? '') ?? defaultPort,
      fp: q['f']!.toLowerCase(),
      token: q['t']!,
      id: q['i'] ?? '',
    );
  }
}

// A PC this phone is paired with.
class PairedPc {
  final String id;
  String name;
  List<String> hosts;
  int port;
  final String fp;
  String key;
  int lastSeen;
  PairedPc({required this.id, required this.name, required this.hosts, required this.port, required this.fp, required this.key, this.lastSeen = 0});

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'hosts': hosts, 'port': port, 'fp': fp, 'key': key, 'lastSeen': lastSeen};
  factory PairedPc.fromJson(Map<String, dynamic> j) => PairedPc(
        id: j['id'] ?? '',
        name: j['name'] ?? 'PC',
        hosts: (j['hosts'] as List? ?? []).cast<String>(),
        port: j['port'] ?? defaultPort,
        fp: j['fp'] ?? '',
        key: j['key'] ?? '',
        lastSeen: j['lastSeen'] ?? 0,
      );
}
