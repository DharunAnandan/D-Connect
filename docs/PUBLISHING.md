# Publishing D-Connect and shipping updates

All three apps use **one version number**: `desktop/package.json` → `"version"`.

- The phone app's versionCode is derived from it: 0.1.3 → 103, 1.2.0 → 10200.
- Keep `mobile/pubspec.yaml` the same (`version: 0.1.3+103`) so local builds match.

## Every release

1. Bump the version in `desktop/package.json` and `mobile/pubspec.yaml`.
2. If the PC↔phone messages changed incompatibly, raise `MIN_PHONE_VERSION` in `desktop/src/shared/links.ts`.
3. Commit and push, then `git tag v0.1.4 && git push origin v0.1.4`.
   - GitHub Actions builds the `.exe`, `.deb`, `.AppImage`, `.apk` and `.aab` into the release.
4. Upload to the stores (below).
5. After the stores have the new version, edit `docs/latest.json` on `main`:
   - `latest` = the new version, which turns on the **optional** update banner in both apps.
   - `min` = the oldest version still allowed. Anything older gets the **forced** update screen.
   - Only raise `min` for a security fix or a protocol break.

`docs/latest.json` must be **publicly readable**: the apps fetch it from `raw.githubusercontent.com`. If the repo stays private, do one of these, then set `LINKS.manifest` (desktop) and `AppLinks.manifest` (phone) to its URL:

- host the file somewhere public (GitHub Pages, a gist, your own site), or
- make the repo public.

---

## 1. Google Play (Android)

**One-time setup**

1. Make the upload key (keep it safe; losing it means a key reset through Play support):
   `keytool -genkey -v -keystore ~/dconnect-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
2. Create `mobile/android/key.properties` (git-ignored):
   ```
   storePassword=...
   keyPassword=...
   keyAlias=upload
   storeFile=/home/you/dconnect-upload.jks
   ```
3. Play Console → **Create app**:
   - Name: D-Connect
   - Default language
   - App, free
   - Accept the declarations.
4. **App content** (all required before review):
   - **Privacy policy URL.** A public page saying what is read (notifications, SMS, call log, contacts, photos) and that it only goes to the user's own paired PC over an encrypted local link, never to a server.
   - **Data safety.** Declare that the app collects nothing, because data goes only to the user's own device, encrypted in transit.
   - **Permissions declarations:**
     - SMS / Call log: pick the "Connected device / companion" style use. Google may refuse READ_SMS/READ_CALL_LOG for a non-default SMS app. If it does, ship a Play build without SMS/call log and keep the full build as the APK download.
     - **Accessibility API:** explain the remote control / screen control and the in-app consent. A video showing the in-app disclosure is required.
     - Foreground service types (connectedDevice, mediaProjection, and so on), each with a short video.
   - Content rating questionnaire, target audience (18+ is simplest), and ads: none.
5. **Store listing:** icon 512×512 (`desktop/build/icon.png` scaled), feature graphic 1024×500, at least 2 phone screenshots, and short and full descriptions.
6. **Testing.** New personal developer accounts must run a **closed test with at least 12 testers for 14 days** before Production is unlocked.
   - Create a Closed testing track.
   - Add testers' emails.
   - Upload the `.aab`.

**Each release**

1. Build `flutter build appbundle --release` locally (signed with your key), or take the `.aab` from the GitHub release. The CI `.aab` is only usable if you add the key to CI as secrets; otherwise it is debug-signed and Play rejects it.
2. Play Console → Testing or Production → **Create new release** → upload the `.aab` → release notes → **Review and roll out**.
3. Review takes from a few hours to a few days.
4. Updates reach phones through Play automatically. The in-app banner and forced screen open the Play page (`market://`) when the app came from Play, or the download page when it was installed from the APK.

## 2. Ubuntu

There are two routes; you can do both.

**a) Snap Store** (shows in Ubuntu's App Center)

1. Create an account at snapcraft.io, then run `sudo snap install snapcraft --classic` and `snapcraft login`.
2. Reserve the name: `snapcraft register d-connect`.
3. Add `snap` to the Linux targets in `desktop/electron-builder.yml`, with `confinement: classic`.
   - Classic is needed because D-Connect uses PulseAudio modules, BlueZ, `/dev/uinput`, adb and pactl.
   - Classic snaps need **manual approval**: request it on forum.snapcraft.io in the "store-requests" category, explaining each need.
4. Build with `npx electron-builder --linux snap`, then upload with `snapcraft upload --release=stable dist/d-connect_0.1.3_amd64.snap`.
5. Updates: snaps update themselves. The in-app banner just says so (`snap refresh d-connect`).

**b) .deb / AppImage from the GitHub release** (works today)

- People download `d-connect_<v>_amd64.deb` and open it in App Center, or run `sudo apt install ./d-connect_<v>_amd64.deb`.
- Updates: the in-app banner opens the download page. Installing the new `.deb` over the old one keeps the pairing and settings.
- Later you can add an APT repository (for example on Launchpad PPA or Cloudsmith) so that `apt upgrade` updates it.

## 3. Windows

**Now:**

- Share `D-Connect-<v>-windows-setup.exe` from the GitHub release.
- Unsigned installers trigger SmartScreen ("Windows protected your PC" → More info → Run anyway).
- Updates: the in-app banner opens the download page. Running the new installer upgrades in place and keeps pairing and settings.

**Better:**

1. **Code signing**, which removes the SmartScreen warning: an OV/EV certificate, or Azure Trusted Signing (cheapest). Set `win.signtoolOptions` or the Azure settings in `electron-builder.yml` and the CI secrets.
2. **Microsoft Store**, free for individuals:
   - Register at partner.microsoft.com.
   - Reserve the name "D-Connect".
   - Either submit the signed `.exe` as a Win32 app (you give the installer URL and silent switch `/S`), or build an MSIX (`appx` target).
   - The Store then handles updates.
3. **winget:** submit a manifest to `microsoft/winget-pkgs` pointing at the release `.exe`, so `winget install D-Connect` works.

---

## How the in-app updates work

**Where the information comes from**

- The PC and phone each read `docs/latest.json` 8 seconds after start, then every 6 hours. **Settings → Check for updates** checks immediately.
- When they link, the phone sends its app version and the PC sends its own version and `MIN_PHONE_VERSION`.

**What each app does with it**

| Situation | What the user sees |
|---|---|
| Version is below `latest` | A banner with **Update** and **Later**. Later hides it until the next version. |
| Version is below `min` | A full screen that blocks the app, with **Get the update** and **Quit**. |
| Phone app below what the PC needs | A forced update screen on the phone, plus a banner on the PC. |
