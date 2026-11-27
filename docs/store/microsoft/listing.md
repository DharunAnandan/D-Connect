# Microsoft Store: D-Connect

## Identity (Partner Center → D-Connect → Product management → Product identity)
Send these three values so the MSIX package can be built:
- `Package/Identity/Name`
- `Package/Identity/Publisher` (starts with `CN=`)
- `Package/Properties/PublisherDisplayName`

## Store listing (Submission → Store listings → English)

**Product name:** `D-Connect – Phone to PC Link` (or `D-Connect`, whichever was reserved)

**Description**
```
D-Connect puts your Android phone on your Windows PC, so you can stay on your computer and still keep up with your phone.

WHAT YOU CAN DO
• Notifications: see your phone's notifications on your PC, reply inline and dismiss them
• Messages: read and send SMS from your keyboard
• Calls: see who's calling, answer or decline from the PC, and talk through your PC's speakers and mic
• Files: send files both ways by drag and drop
• Clipboard: copy on one device, paste on the other
• Photos and videos: browse your phone's gallery and albums
• Screen: mirror your phone and control it with your mouse and keyboard
• Remote: use your phone as a touchpad, keyboard or presentation remote
• Media: control music on either device from the other
• Find my phone, PC actions from the phone, battery alerts, and 20-20-20 eye care

PRIVATE BY DESIGN
No accounts, no servers, no tracking. Your data goes only between your phone and your PC, over an encrypted connection on your own Wi-Fi or USB cable.

GETTING STARTED
1. Install D-Connect on your Android phone from Google Play
2. Open D-Connect on your PC and scan the QR code with the phone app
3. Allow only the features you want to use
```

**Short description** (shown at the top on some views)
```
Calls, messages, notifications and files from your Android phone on your Windows PC.
```

**What's new in this version:** e.g. `First release.`

**Product features** (one per line, up to 20)
```
Phone notifications on your PC with reply
Read and send SMS from your keyboard
Answer calls and talk through your PC
Send files both ways
Shared clipboard
Browse your phone's photos and videos
Mirror and control your phone's screen
Phone as touchpad, keyboard and presenter
20-20-20 eye care across phone and PC
No accounts, no servers, encrypted
```

**Screenshots (Desktop):** `store-home-1920x1080.png`, `store-messages-…`, `store-notifications-…`, `store-calls-…`, `store-eye-…`, `store-pair-…` (this folder)

**Store logo (optional):** `store-logo-300.png`

**Search terms** (up to 7)
```
phone link
android
sms
notifications
phone to pc
file transfer
mirror
```

**Copyright:** `© 2026 Dharun.A`
**Privacy policy URL:** `https://github.com/DharunAnandan/D-Connect/blob/main/docs/PRIVACY.md`
**Website:** `https://github.com/DharunAnandan/D-Connect`
**Support contact:** `https://github.com/DharunAnandan/D-Connect/issues` (or your email)

## Properties
- Category: **Productivity** (subcategory none), or **Utilities & tools**
- Privacy policy: Yes, URL above
- System requirements: Windows 10 version 2004 or later, x64; Bluetooth recommended (for calls)

## Restricted capability: runFullTrust
Submission options → **Restricted capabilities**, explain:
```
D-Connect is a desktop (Electron) app packaged as MSIX. It needs full trust to run as a normal Win32 desktop app: it accepts the local encrypted connection from the user's paired phone, uses Windows Core Audio and Bluetooth hands-free audio for calls, runs PowerShell helpers for the volume mixer and phone audio, and runs adb for phone app windows over USB.
```
