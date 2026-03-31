# Android APK (website → app)

यह **अलग फ़ोल्डर** है। मुख्य `tradeing` वेब प्रोजेक्ट में **कोई बदलाव नहीं**।  
Capacitor एक **WebView** में आपकी **live website** खोलता है (`server.url`).

**Landing पर APK लिंक:** वेब `frontend` में बिल्ड के बाद APK को `frontend/public/downloads/Iqfxpro.apk` नाम से रखें, या `.env` में `VITE_APK_DOWNLOAD_URL` सेट करें — विवरण `frontend/public/downloads/README.txt` में।

**Launcher icon:** `npm run sync:brand` `frontend/public/brand/IQ00Fx Logo.png` (फ़ॉलबैक: logoiq.jpeg, apkl.png, …) → `drawable/ic_apk_launcher_icon.*`। बनाने से पहले `sync:brand` चलाएँ।

**ऊपर की खाली जगह (APK):** वेब `frontend` में `html.cap-native` क्लास से `#root` का ऊपर वाला safe-area हटता है (Capacitor WebView डबल inset से बचने के लिए)। नया **frontend build** + `npx cap copy` / sync के बाद APK।

## 1) साइट URL बदलें

`capacitor.config.json` में `server.url` अपना डोमेन लिखें:

```json
"server": {
  "url": "https://your-domain.com",
  "androidScheme": "https"
}
```

- **HTTP** (local test): URL `http://192.168.x.x:3000` जैसा हो तो Android पर **cleartext** चाहिए — नीचे देखें।

## 2) एक बार setup

पहले **हमेशा `mobile-apk` फ़ोल्डर के अंदर** जाएँ (यहीं `package.json` है)।

**Repo root** (`tradeing`) से:

```bash
cd mobile-apk
npm install
npx cap add android
npx cap sync android
```

### Git Bash (Windows) — `cd` गलत न हो

`cd d:\xampp\...` में **`\`** escape हो जाता है → path टूटता है → `npx cap` चलता ही नहीं।

इस्तेमाल करें:

```bash
cd /d/xampp/htdocs/tradeing/mobile-apk
```

या कोट्स के साथ:

```bash
cd "d:/xampp/htdocs/tradeing/mobile-apk"
```

फिर:

```bash
npx cap sync android
npx cap open android
```

## 3) APK बनाना (Android Studio)

### अगर `Unable to launch Android Studio` आए

**`npx cap sync android` सही है** — गलती सिर्फ `cap open android` में है: PC पर **Android Studio install नहीं** है, या Capacitor को **exe का path** नहीं पता।

**A) Android Studio install करें**

1. [developer.android.com/studio](https://developer.android.com/studio) से **Android Studio** डाउनलोड + install करें।  
2. पहली बार खोलकर **Android SDK** setup पूरा करें (JDK 17 bundled आता है)।  
3. फिर:

```bash
cd mobile-apk
npx cap open android
```

**B) Studio है फिर भी error — path बताएँ (Windows)**

Capacitor को **`studio64.exe`** चाहिए। आम जगहें:

- `C:\Program Files\Android\Android Studio\bin\studio64.exe`
- `C:\Program Files\JetBrains\AndroidStudio\bin\studio64.exe`

**Git Bash** में (forward slashes):

```bash
export CAPACITOR_ANDROID_STUDIO_PATH="/c/Program Files/Android/Android Studio/bin/studio64.exe"
npx cap open android
```

**PowerShell** (एक session के लिए):

```powershell
$env:CAPACITOR_ANDROID_STUDIO_PATH = "C:\Program Files\Android\Android Studio\bin\studio64.exe"
npx cap open android
```

**C) बिना `cap open` — हाथ से project खोलें**

1. **Android Studio** खोलें → **File → Open**  
2. फ़ोल्डर चुनें: **`mobile-apk/android`** (सिर्फ `android`, पूरा `tradeing` नहीं)  
3. Gradle sync होने दें, फिर नीचे वाला build step करें।

### Studio में APK

1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
2. या **Build → Generate Signed Bundle / APK** (Play Store के लिए signed APK/AAB).

पहली बार **Android SDK** + **JDK 17** install होना चाहिए।

## HTTP (बिना SSL) dev server

अगर `server.url` **http://** है, तो `android/app/src/main/AndroidManifest.xml` में `<application` पर:

```xml
android:usesCleartextTraffic="true"
```

जोड़ें (सिर्फ टेस्टिंग; production में **HTTPS** बेहतर है).

## `appId` / ऐप का नाम

- Package name: `capacitor.config.json` → `appId` (जैसे `com.updowanfx.app`)  
- ऐप लेबल: `appName`  
पहली बार `cap add android` से पहले सही कर लें; बाद में बदलने पर Android project में भी अपडेट लग सकता है।

## वेबसाइट पर “Download APK” बटन

लैंडिंग लिंक (default): **`/api/system/android-apk`** — **`/api/android-app.apk`**, **`/downloads/Iqfxpro.apk`**, **`/api/mobile-app`** bhi same file।

1. Android Studio से APK बनाएँ।  
2. Repo root से: **`npm run copy-apk`** — यह `app-release.apk` / `app-debug.apk` को **`frontend/public/downloads/Iqfxpro.apk`** पर कॉपी करता है।  
3. फिर **`npm run build:all`** (या कम से कम frontend build) ताकि `dist` में APK जाए।

**सर्वर पर बिना rebuild:** VPS पर **`releases/Iqfxpro.apk`** रखें (repo root के बगल में), या `.env` में **`APK_FILE_PATH`** — Node सीधे वहीं से serve करेगा।

## APK में नया अपडेट कैसे मिलेगा?

तुम्हारा APK **WebView** में **`server.url`** वाली **live site** खोलता है (जैसे `https://updowanfx.com`).

### ज़्यादातर बदलाव (UI, React, API वही server)

1. PC पर **`npm run build:all`** (या VPS पर जो deploy script है) → **frontend `dist`** server पर deploy करो।  
2. Users को **नया APK देने की ज़रूरत नहीं** — ऐप बंद-खोल करें या कुछ देर बाद refresh; सीधे **नई वेबसाइट** लोड होगी।  
3. कभी-कभी WebView **पुराना cache** दिखाए → user **ऐप को force stop** करके खोले, या तुम server पर cache headers ठीक रखो।

### जब **नया APK** बनाना पड़ेगा

- **`server.url`** / डोमेन बदला  
- **Android permissions**, **app name**, **appId**, **icons**, या कोई **native plugin**  
- Capacitor / Gradle major अपडेट

तब: `mobile-apk` में `npx cap sync android` → Studio से **नया APK/AAB** build → Play Store या direct install।

## सारांश

| Step | Command |
|------|---------|
| URL सेट करें | Edit `capacitor.config.json` |
| Sync | `npx cap sync android` |
| Studio खोलें | `npx cap open android` या Studio में **Open → `mobile-apk/android`** |

**वेब अपडेट:** सिर्फ **server पर site deploy** — ज़्यादातर में APK दुबारा जरूरी नहीं।  
**नेटिव / URL बदलाव:** नया APK build करो।
