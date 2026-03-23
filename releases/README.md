# Release APK (optional)

Place your signed **`UpDownFX.apk`** here as:

```
releases/UpDownFX.apk
```

Same folder level as **`frontend/`** and **`src/`** (repo root).

## PC par auto-copy (Android Studio build ke baad)

```bash
# Pehle Studio se APK build, phir:
npm run copy-apk          # → frontend/public/downloads/UpDownFX.apk
npm run copy-apk:releases # → releases/UpDownFX.apk

# Ya ek saath:
npm run apk:sync
```

Phir **`releases/UpDownFX.apk`** ko SFTP se VPS par bhejo:

` /home/updowanfx/htdocs/updowanfx.com/releases/UpDownFX.apk `

The Node server serves this APK from **`GET /api/system/android-apk`** (and other aliases) if this file is present (see **`APK_FILE_PATH`** in **`.env.example`** for a custom path).

`*.apk` is **gitignored** — upload to the server via SCP/FTP; do not commit binaries to GitHub.
