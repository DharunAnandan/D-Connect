# D-Connect

Your Android phone on your Linux (or Windows) PC: Phone Link, plus the things Phone Link doesn't
do, plus 20-20-20 eye care that follows you from screen to screen.

| | |
|---|---|
| `desktop/` | Electron + React + TypeScript + Tailwind + Framer Motion |
| `mobile/` | Flutter (Android), with native Kotlin services |
| `protocol/PROTOCOL.md` | the wire protocol both sides speak |

## Download
Get the Windows installer (.exe), Linux .deb / AppImage and the Android .apk from the
[latest release](https://github.com/DharunAnandan/D-Connect/releases/latest).
How to install each one: [docs/INSTALL.md](docs/INSTALL.md).

## Features
**Phone Link parity**: notifications (custom desktop toasts with inline reply, actions, per-app mute) ·
SMS threads, send and reply · incoming-call card with answer/decline, dialler, call log ·
files both ways (drag and drop, share sheet, resumable flow control) · shared clipboard with history ·
battery/storage/network status · recent photos · screen mirroring with mouse/keyboard control,
screenshot and recording.

**Beyond Phone Link**: phone as touchpad, keyboard and presenter for the PC (uinput, works on Wayland) ·
media control both ways (PC players over MPRIS, phone media sessions) · find my phone (rings through
silent) and find my PC · proximity lock · send links/text "continue on device" · phone DND from the PC ·
one-tap PC actions on the phone (lock, sleep, mute, screenshot, keep awake, your own shell commands) ·
low-battery and fully-charged alerts · USB mode over `adb reverse` · take calls on the laptop over
Bluetooth hands-free.

**Eye care (20-20-20, from side-eye)**: the same screen-on timer, sleep/rest handling, snooze and the
drifting-lights overlay, now across devices. The break shows on the PC and phone at the same moment,
ending it on either ends both, phone screen time counts towards the timer, and every break is kept
for daily stats and streaks.

## Run the desktop
```bash
cd desktop
npm install
npm run dev          # development, hot reload
npm test             # vitest: eye-break timer, streaks, protocol
npm run dist:linux   # AppImage + .deb in desktop/dist
```
Needs: Node 20+. Optional: `adb` (USB mode), `python3` and write access to `/dev/uinput` (phone as
touchpad on Wayland; otherwise `xdotool` on X11). On Linux the app runs under XWayland
(`--ozone-platform=x11`) so the toasts, call card and eye-break overlay can place themselves.

`npm run fake-phone -- "<dconnect://pair?… URI>"` runs a simulated phone that speaks the full
protocol. Handy for working on the desktop without a device; type `notif`, `sms`, `call`, `eye`,
`find`, `file <path>` and so on into it.

## Run the phone app
```bash
cd mobile
flutter run          # or: flutter build apk --release
```
Pair by scanning the QR on the PC (in the app, or with any camera app: `dconnect://` links open
D-Connect). Then grant what you want in **Settings**: notification access, SMS, phone, contacts,
photos, accessibility (for screen control), Do Not Disturb access, and "run in background".

## Calls through the laptop (Linux)
The PC becomes a Bluetooth hands-free (HFP HF) device for the phone. This needs **PipeWire** with
the `hfp_hf` role. Ubuntu 22.04 ships PulseAudio, so do the one-time switch shown in
**Settings → Take calls on this PC**, then press **Enable hands-free** and pair the phone to the PC
over Bluetooth. Answer/decline always works over the D-Connect link, even without Bluetooth audio.

## Known limits
- Android 14+ asks for screen-sharing consent each time mirroring starts. If the phone app is in
  the background, the request arrives as a notification you tap.
- Sideloaded apps must "Allow restricted settings" (App info → ⋮) once before Android lets you
  enable accessibility and notification access.
- Android only lets the foreground app read the clipboard, so phone → PC clipboard sync happens
  when you open D-Connect, or with the Clipboard tile.
- Windows: everything except Bluetooth call audio and MPRIS media (Windows media control is a
  later addition).
