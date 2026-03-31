# Release APK (optional)

Place your signed **`Iqfxpro.apk`** here as:

```
releases/Iqfxpro.apk
```

Same folder level as **`frontend/`** and **`src/`** (repo root).

## PC par auto-copy (Android Studio build ke baad)

```bash
# Pehle Studio se APK build, phir:
npm run copy-apk          # → frontend/public/downloads/Iqfxpro.apk
npm run copy-apk:releases # → releases/Iqfxpro.apk

# Ya ek saath:
npm run apk:sync
```

Phir **`releases/Iqfxpro.apk`** ko SFTP se VPS par bhejo:

` /home/user/htdocs/site/releases/Iqfxpro.apk `

The Node server serves this APK from **`GET /api/system/android-apk`** (and other aliases) if this file is present (see **`APK_FILE_PATH`** in **`.env.example`** for a custom path).

`*.apk` is **gitignored** — upload to the server via SCP/FTP; do not commit binaries to GitHub.
