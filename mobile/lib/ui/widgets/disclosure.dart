// Before D-Connect asks Android for a sensitive permission, it says plainly what it will access,
// why, and where it goes (Google Play's "prominent disclosure"). The user agrees or declines here;
// only "Allow" goes on to the system prompt or settings page.
import 'package:flutter/material.dart';

import '../../theme/tokens.dart';
import 'glass.dart';

class _Info {
  final IconData icon;
  final String title;
  final String what; // what is accessed
  final String why; // what it's used for
  final String after; // what happens when they tap Allow
  const _Info(this.icon, this.title, this.what, this.why, this.after);
}

const _where = 'It goes only to the computer you paired with this phone, over an encrypted connection on your own Wi-Fi or USB cable. '
    'D-Connect has no servers: nothing is sent to the developer or anyone else, and nothing is sold or used for ads.';

const _kinds = <String, _Info>{
  'notifications': _Info(
    Icons.notifications_active_rounded,
    'Notification access',
    'D-Connect reads the notifications on this phone: the app name, title, text, pictures in messages, and reply and action buttons.',
    'To show them on your PC so you can read, reply to, open or dismiss them there, and to control music playing on the phone.',
    'Android will open "Notification access". Turn on D-Connect there.',
  ),
  'sms': _Info(
    Icons.sms_rounded,
    'SMS messages',
    'D-Connect reads your text messages (SMS), receives new ones as they arrive, and sends the texts you write on your PC.',
    'To show your conversations on your PC and let you read and reply to texts from your keyboard. Messages you send go out from this phone\'s SIM, as usual.',
    'Android will ask you to allow D-Connect to send and view SMS messages.',
  ),
  'phone': _Info(
    Icons.call_rounded,
    'Phone and call log',
    'D-Connect sees incoming and ongoing calls (number and state), reads your call log, and can answer, decline and place calls.',
    'To show who\'s calling on your PC, answer or decline from there, dial from your PC, and list your recent calls.',
    'Android will ask you to allow D-Connect to make and manage phone calls and to access your call logs.',
  ),
  'contacts': _Info(
    Icons.contacts_rounded,
    'Contacts',
    'D-Connect reads your contacts\' names, numbers and photos.',
    'To show names and pictures instead of bare numbers in messages and calls on your PC, and to let you search contacts there.',
    'Android will ask you to allow D-Connect to access your contacts.',
  ),
  'photos': _Info(
    Icons.photo_library_rounded,
    'Photos and videos',
    'D-Connect reads the list of photos and videos on this phone, their albums, dates and thumbnails, and the files you choose to open or copy.',
    'To let you browse your gallery on your PC and copy pictures and videos to it.',
    'Android will ask you to allow access to your photos and videos.',
  ),
  'accessibility': _Info(
    Icons.accessibility_new_rounded,
    'Screen control (Accessibility)',
    'D-Connect uses Android\'s Accessibility service to perform taps, swipes, typing and the Back, Home and Recents buttons on this phone, and to press the call screen\'s buttons.',
    'So that, while you mirror this phone on your PC, your mouse and keyboard can control it; and so that answering a call or moving call audio from your PC presses the right button on the phone. '
        'It acts only on what you do from your paired PC. It does not read, store or send what\'s on your screen.',
    'Android will open "Accessibility". Tap "Installed apps" (or "Downloaded apps") → D-Connect, and turn it on. You can turn it off there any time.',
  ),
  'dnd': _Info(
    Icons.do_not_disturb_on_rounded,
    'Do Not Disturb access',
    'D-Connect can turn Do Not Disturb on and off on this phone.',
    'So that turning on focus mode on your PC also silences your phone, and the other way round.',
    'Android will open "Do Not Disturb access". Turn on D-Connect there.',
  ),
};

/// Shows the explanation for [kind]. Returns true only if the user tapped Allow.
Future<bool> disclose(BuildContext context, String kind) async {
  final info = _kinds[kind];
  if (info == null) return true;
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    backgroundColor: Colors.transparent,
    builder: (c) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Glass(
          strong: true,
          padding: const EdgeInsets.fromLTRB(22, 22, 22, 14),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(gradient: C.primary, borderRadius: BorderRadius.circular(14)),
                  child: Icon(info.icon, color: C.ink950),
                ),
                const SizedBox(width: 14),
                Expanded(child: Text(info.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
              ]),
              const SizedBox(height: 18),
              _Part('What D-Connect accesses', info.what),
              _Part('Why', info.why),
              const _Part('Where it goes', _where),
              const SizedBox(height: 4),
              Text(info.after, style: TextStyle(fontSize: 12.5, color: Colors.white.withValues(alpha: .55))),
              const SizedBox(height: 4),
              Text('You can turn this off any time in Android settings. The feature simply stops working.', style: TextStyle(fontSize: 12.5, color: Colors.white.withValues(alpha: .55))),
              const SizedBox(height: 16),
              GradientButton(label: 'Allow', icon: Icons.check_rounded, expand: true, onTap: () => Navigator.pop(c, true)),
              const SizedBox(height: 4),
              SizedBox(
                width: double.infinity,
                child: TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Not now', style: TextStyle(color: C.muted))),
              ),
            ]),
          ),
        ),
      ),
    ),
  );
  return ok == true;
}

class _Part extends StatelessWidget {
  final String label, text;
  const _Part(this.label, this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: TextStyle(fontSize: 11, letterSpacing: 1.3, fontWeight: FontWeight.w700, color: C.cyanSoft.withValues(alpha: .9))),
          const SizedBox(height: 4),
          Text(text, style: TextStyle(fontSize: 14.5, height: 1.45, color: Colors.white.withValues(alpha: .88))),
        ]),
      );
}
