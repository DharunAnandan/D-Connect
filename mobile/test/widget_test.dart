import 'package:dconnect/core/protocol.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses the pairing URI the desktop puts in the QR', () {
    final p = PairPayload.parse('dconnect://pair?v=1&n=My+PC&h=192.168.1.4%2C10.0.0.2&p=47820&f=${'ab' * 32}&t=tok_-x&i=id1');
    expect(p, isNotNull);
    expect(p!.name, 'My PC');
    expect(p.hosts, ['192.168.1.4', '10.0.0.2']);
    expect(p.port, 47820);
    expect(p.token, 'tok_-x');
  });

  test('rejects other codes', () {
    expect(PairPayload.parse('https://example.com'), isNull);
    expect(PairPayload.parse('dconnect://pair?n=x'), isNull);
  });

  test('binary frames round-trip (same layout as the desktop)', () {
    final f = encodeBinary(Ch.file, {'fid': 'abc', 'seq': 7}, [1, 2, 3, 250]);
    final d = decodeBinary(f);
    expect(d.channel, Ch.file);
    expect(d.header, {'fid': 'abc', 'seq': 7});
    expect(d.payload, [1, 2, 3, 250]);
  });
}
