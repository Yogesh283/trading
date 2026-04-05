# Android APK (website → app)

This is a **separate folder**. It does **not** change the main `tradeing` web project by itself.  
Capacitor opens your **live website** in a **WebView** (`server.url`).

**APK link on the landing page:** After a web `frontend` build, place the APK as `frontend/public/downloads/Iqfxpro.apk`, or set `VITE_APK_DOWNLOAD_URL` in `.env` — see `frontend/public/downloads/README.txt` for details.

**Launcher icon:** `npm run sync:brand` copies `frontend/public/brand/IQ00Fx Logo.png` (fallbacks: logoiq.jpeg, apkl.png, …) → `drawable/ic_apk_launcher_icon.*`. Run `sync:brand` before building.

**Top gap in the APK:** On the web `frontend`, the `html.cap-native` class removes the extra top safe-area on `#root` (avoids double insets in the Capacitor WebView). After a new **frontend build**, run `npx cap copy` / sync, then rebuild the APK.

## 1) Change the site URL

In `capacitor.config.json`, set `server.url` to your domain:

```json
"server": {
  "url": "https://your-domain.com",
  "androidScheme": "https"
}
```

- **HTTP** (local test): if the URL looks like `http://192.168.x.x:3000`, Android needs **cleartext** — see below.

## 2) One-time setup

Always **`cd` into the `mobile-apk` folder first** (that is where `package.json` lives).

From **repo root** (`tradeing`):

```bash
cd mobile-apk
npm install
npx cap add android
npx cap sync android
```

### Git Bash (Windows) — avoid a broken `cd`

In `cd d:\xampp\...` the **`\`** can escape → the path breaks → `npx cap` may not run.

Use:

```bash
cd /d/xampp/htdocs/tradeing/mobile-apk
```

Or with quotes:

```bash
cd "d:/xampp/htdocs/tradeing/mobile-apk"
```

Then:

```bash
npx cap sync android
npx cap open android
```

## 3) Build the APK (Android Studio)

### If you see `Unable to launch Android Studio`

**`npx cap sync android` is fine** — the issue is only with `cap open android`: **Android Studio is not installed** on the PC, or Capacitor does not know the **path to the .exe**.

**A) Install Android Studio**

1. Download and install **Android Studio** from [developer.android.com/studio](https://developer.android.com/studio).  
2. Open it once and complete **Android SDK** setup (JDK 17 is bundled).  
3. Then:

```bash
cd mobile-apk
npx cap open android
```

**B) Studio is installed but you still get an error — set the path (Windows)**

Capacitor needs **`studio64.exe`**. Typical locations:

- `C:\Program Files\Android\Android Studio\bin\studio64.exe`
- `C:\Program Files\JetBrains\AndroidStudio\bin\studio64.exe`

**Git Bash** (forward slashes):

```bash
export CAPACITOR_ANDROID_STUDIO_PATH="/c/Program Files/Android/Android Studio/bin/studio64.exe"
npx cap open android
```

**PowerShell** (current session only):

```powershell
$env:CAPACITOR_ANDROID_STUDIO_PATH = "C:\Program Files\Android\Android Studio\bin\studio64.exe"
npx cap open android
```

**C) Without `cap open` — open the project manually**

1. Open **Android Studio** → **File → Open**  
2. Select the folder **`mobile-apk/android`** (only `android`, not the whole `tradeing` repo)  
3. Let Gradle sync finish, then use the build steps below.

### Build APK in Studio

1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
2. Or **Build → Generate Signed Bundle / APK** (signed APK/AAB for Play Store).

The first time, **Android SDK** and **JDK 17** must be installed.

## HTTP (non-SSL) dev server

If `server.url` is **http://**, add this on the `<application>` element in `android/app/src/main/AndroidManifest.xml`:

```xml
android:usesCleartextTraffic="true"
```

Use this **only for testing**; **HTTPS** is better in production.

## `appId` / app name

- Package name: `capacitor.config.json` → `appId` (e.g. `com.updowanfx.app`; a new store listing may use a different ID such as `com.iqfxpro.app`)  
- App label: `appName`  
Set these before the first `cap add android`; changing them later may require updates inside the Android project too.

## “Download APK” button on the website

Default landing links: **`/api/system/android-apk`** — **`/api/android-app.apk`**, **`/downloads/Iqfxpro.apk`**, and **`/api/mobile-app`** serve the same file.

1. Build the APK in Android Studio.  
2. From repo root: **`npm run copy-apk`** — copies `app-release.apk` / `app-debug.apk` to **`frontend/public/downloads/Iqfxpro.apk`**.  
3. Then **`npm run build:all`** (or at least a frontend build) so the APK is included in `dist`.

**On the server without a full rebuild:** place **`releases/Iqfxpro.apk`** next to the repo root on the VPS, or set **`APK_FILE_PATH`** in `.env` — Node will serve that file directly.

## How users get updates in the APK

Your APK opens the **live site** from **`server.url`** in a **WebView** (production: **`https://www.iqfxpro.com`**).

### Most changes (UI, React, same API server)

1. On your PC run **`npm run build:all`** (or your VPS deploy script) → deploy **frontend `dist`** to the server.  
2. Users usually **do not need a new APK** — they can close and reopen the app or refresh; the **new website** loads.  
3. Sometimes the WebView shows **stale cache** → user can **force-stop** the app and reopen, or you fix **cache headers** on the server.

### When you **must** build a new APK

- **`server.url`** / domain changed  
- **Android permissions**, **app name**, **appId**, **icons**, or a **native plugin**  
- Major **Capacitor / Gradle** upgrade  

Then: in `mobile-apk` run `npx cap sync android` → build a **new APK/AAB** in Studio → Play Store or direct install.

## Summary

| Step | Command |
|------|---------|
| Set URL | Edit `capacitor.config.json` |
| Sync | `npx cap sync android` |
| Open Studio | `npx cap open android` or Studio **Open → `mobile-apk/android`** |

**Web updates:** deploy the site on the server — in most cases you **do not** need to ship a new APK again.  
**Native / URL changes:** build a new APK.
