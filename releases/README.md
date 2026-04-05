# Release APK (optional)

Place your signed **`Iqfxpro.apk`** here as:

```
releases/Iqfxpro.apk
```

Same folder level as **`frontend/`** and **`src/`** (repo root).

## Auto-copy on PC (after an Android Studio build)

```bash
# Build the APK in Studio first, then:
npm run copy-apk          # → frontend/public/downloads/Iqfxpro.apk
npm run copy-apk:releases # → releases/Iqfxpro.apk

# Or both at once:
npm run apk:sync
```

Then upload **`releases/Iqfxpro.apk`** to the VPS via SFTP, for example:

` /home/user/htdocs/site/releases/Iqfxpro.apk `

The Node server serves this APK from **`GET /api/system/android-apk`** (and other aliases) if this file is present (see **`APK_FILE_PATH`** in **`.env.example`** for a custom path).

`*.apk` is **gitignored** — upload to the server via SCP/FTP; do not commit binaries to GitHub.
