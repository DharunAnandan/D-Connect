# Snap Store: classic confinement request

Post at https://forum.snapcraft.io → **New Topic** → category **store-requests**.
Sign in with the same Ubuntu One account that registered `d-connect`.

**Title**
```
Classic confinement request: d-connect
```

**Body**
```
Hello,

I'd like to request classic confinement for the snap **d-connect**.

**What it is**
D-Connect is a phone-to-PC companion (similar to Microsoft Phone Link) that links an Android phone to a Linux desktop: notifications with reply, SMS, calls, file transfer, clipboard, screen mirroring with remote control, and using the phone as a touchpad/keyboard. Source: https://github.com/DharunAnandan/D-Connect

**Why strict confinement doesn't work**
1. **Phone calls through the laptop.** The PC becomes a Bluetooth hands-free device for the phone. To route call audio, the app loads and unloads PulseAudio modules at runtime (module-loopback, module-echo-cancel, a LADSPA noise filter, module-tunnel-sink/source to PipeWire) with `pactl`, and on first setup writes WirePlumber/PulseAudio user configuration (~/.config/pulse, ~/.config/wireplumber) and a systemd user drop-in. The pulseaudio/audio-record interfaces don't allow loading modules or changing that config.
2. **Bluetooth.** It pairs with and connects to the phone's hands-free profile through BlueZ and needs the host's PipeWire/WirePlumber HFP role, not only the bluez interface's limited access.
3. **Input injection.** Using the phone as a touchpad, keyboard and presenter writes to /dev/uinput to create a virtual input device (works on Wayland and X11). There's no interface for creating uinput devices.
4. **adb.** App windows and USB mode run the host's `adb` (Android platform tools) to start the phone's screen server and set up `adb reverse` port forwarding over USB.
5. **Host tools.** It calls host tools such as `pactl`, `loginctl lock-session`, `systemctl --user`, `gdbus`, and GNOME Shell's Screencast/Screenshot D-Bus APIs for screen recording and screenshots.

If some of this can be done under strict confinement with specific interfaces, I'm happy to adjust. Please advise which parts.

The app is open source; no data leaves the user's phone and PC (no servers or accounts).

Thank you!
```
