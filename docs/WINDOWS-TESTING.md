# Testing D-Connect on Windows

A checklist for a session working on the Windows PC (for example Claude Code over VS Code Remote Tunnels). The PC app is Electron (`desktop/`); the Windows-only code is:

| Feature | Code | Status |
|---|---|---|
| Call audio on "This PC" | `desktop/src/main/features/winaudio.ts` (a hidden window bridges the phone's *Hands-Free AG Audio* devices to the PC speaker/mic) | **Reported not working; never tested on real Windows** |
| Phone music on the PC | `desktop/resources/win/phone-audio.ps1` (AudioPlaybackConnection, Windows 10 2004+) | untested |
| Sound mixer / per-app volume | `desktop/resources/win/mixer.ps1` (Core Audio via a C# class) | untested |
| Screen recording | `desktop/src/main/features/screenrec.ts` (desktopCapturer + MediaRecorder) | untested |
| Laptop battery alerts | `desktop/src/main/features/system.ts` (Win32_Battery via PowerShell) | untested |
| adb (app windows, USB mode) | `desktop/src/main/adb.ts`; CI bundles adb in `resources-win/adb` | untested |
| Update button | opens the Microsoft Store page (Store ID 9N981DC1LCQ6) | untested |

## Set up
```
cd desktop
npm ci
# PowerShell. VS Code's terminal sets ELECTRON_RUN_AS_NODE, which stops Electron opening windows,
# and `npm run dev` uses a Linux-only `env -u`, so start it like this on Windows:
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx electron-vite dev
```
Building the installer: `npx electron-vite build && npx electron-builder --win nsis --x64` (output in `desktop/dist`).

Dev control: set `DC_DEV_CONTROL=<folder>` before starting. The app then reads commands from `<folder>/cmd`: `nav /calls`, `snap name` (screenshot of the window to `<folder>/name.png`), `rpc <name> <args>`, `eval <js>`. See `desktop/src/main/devcontrol.ts`.

## Logs
- `%APPDATA%\D-Connect\call-route.log` lists the sound devices Windows offers for the phone when "This PC" is chosen during a call, and why the bridge failed.
- `%APPDATA%\D-Connect\d-connect.json` holds the settings.

## Call audio: what to check, in order
1. The phone is paired in Windows Settings → Bluetooth & devices and shows **Connected**. On the phone, the PC's Bluetooth entry has **Phone calls** turned on.
2. List the audio endpoints and look for the phone's hands-free devices:
   `Get-PnpDevice -Class AudioEndpoint | Format-Table Status, FriendlyName`
   Expected: something like "Headset (… Hands-Free AG Audio)" for both input and output. If they're missing, Windows isn't offering the phone's call audio, and the app can't bridge it.
3. During a call, choose **This PC** on the call card, then read `call-route.log`:
   - `no-link` plus the device list: the bridge didn't find the AG devices. Fix the label matching in `winaudio.ts` (`isAG`).
   - an error from getUserMedia/setSinkId: the device exists but couldn't be opened. Check that the call audio is actually connected (SCO). Windows may need the phone to route audio to it first, which the phone's Accessibility "Screen control" does by pressing the call screen's audio button.
4. The phone side: `mobile/android/.../Telephony.kt` (`audio-pc` action) and `ControlService.kt`.

## Rules for this project
- Commit as DharunAnandan (`git config user.email 102591962+DharunAnandan@users.noreply.github.com`), with no co-author trailer.
- Keep one version number across all apps (`desktop/package.json` and `mobile/pubspec.yaml`).
- Don't change phone security settings (Accessibility and so on) through adb. Ask the person.
- Don't capture personal messages or notifications in screenshots.
