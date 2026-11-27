# Google Play permission declarations: D-Connect

Play Console → **App content** (or Policy → App content) → **Sensitive app permissions**. Each video should be a 30–60 second screen recording, uploaded to YouTube as **Unlisted** (or a Google Drive link anyone can view). It should show the in-app disclosure, the permission prompt, and the feature working on the PC.

---

## 1. SMS and Call Log permissions
Permissions: READ_SMS, RECEIVE_SMS, SEND_SMS, READ_CALL_LOG

**Core functionality:** choose **"Connected device companion app"**. If that isn't offered, choose the closest option ("Device automation" / "Cross-device synchronisation").

**Description:**
```
D-Connect is a companion app that links the user's Android phone to their own Linux or Windows computer (like Phone Link). Its core feature is reading, sending and replying to SMS and seeing calls from the computer.
READ_SMS / RECEIVE_SMS: show the user's SMS conversations and new messages on their paired computer.
SEND_SMS: send the texts the user types on their computer, through the phone's SIM.
READ_CALL_LOG: show recent calls on the computer and let the user call back.
Data goes only to the computer the user paired by QR code, over an encrypted local connection (TLS, certificate-pinned, Wi-Fi or USB). There is no server, no account, and nothing is collected by the developer. The app explains this and asks for consent before requesting these permissions.
```
**Video:** the disclosure screen → allow SMS → a text arriving on the PC → a reply sent from the PC.

---

## 2. Accessibility API (AccessibilityService)
**Is the app an accessibility tool?** No.

**Description:**
```
D-Connect uses the AccessibilityService API only for features the user starts from their own paired computer:
1. Remote control while screen mirroring: the user's mouse clicks and key presses on the computer are performed on the phone (dispatchGesture, global Back/Home/Recents).
2. Answering calls from the computer and moving call audio to it: pressing the phone's call-screen buttons when the user clicks Answer or "This PC" on the computer.
The service does not collect, store or transmit screen content or personal data. It is off until the user enables it after an in-app explanation, and it can be turned off at any time in Settings.
```
**Video:** the disclosure → enabling D-Connect in Accessibility settings → mirroring the phone on the PC and tapping with the mouse.

---

## 3. Foreground service permissions
Answer **Yes**, the app uses foreground services, then declare two types:

**connectedDevice** (FOREGROUND_SERVICE_CONNECTED_DEVICE)
```
Keeps the encrypted link to the user's paired computer open so notifications, messages and calls reach the computer while the phone screen is off. Shown as an ongoing "Linked to <PC name>" notification; the user can turn it off from the app or the quick-settings tile.
```
Task type: "Connected device / companion"; the user notices it: Yes (persistent notification).

**mediaProjection** (FOREGROUND_SERVICE_MEDIA_PROJECTION)
```
Screen mirroring: streams the phone's screen to the user's own paired computer after the user starts mirroring and accepts Android's screen-capture prompt. Stops when the user ends mirroring.
```
**Video:** starting the link (notification appears) and starting mirroring from the PC (the capture prompt, then the phone screen on the PC).

---

## 4. Photo and video permissions
Permissions: READ_MEDIA_IMAGES, READ_MEDIA_VIDEO

**Core functionality:**
```
Browsing the phone's gallery from the computer is a core feature: the Photos page on the user's paired computer shows all photos and videos, organised by album, so the user can view and copy them to the computer. This needs ongoing access to the whole library, not a one-time selection, so the Android photo picker can't provide it.
```

---

## 5. Other items Play may ask about
- **REQUEST_IGNORE_BATTERY_OPTIMIZATIONS:** "Companion device app: keeps the link to the user's computer alive with the screen off so calls and messages arrive on time. The user grants it in system settings after an in-app explanation."
- **CAMERA:** used only to scan the pairing QR code. Usually no form is needed.
- **ANSWER_PHONE_CALLS / CALL_PHONE / READ_PHONE_STATE:** covered by the companion-app description: answering, declining and dialling from the computer.
