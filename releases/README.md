# Release APK (optional)

Place your signed **`UpDownFX.apk`** here as:

```
releases/UpDownFX.apk
```

Same folder level as **`frontend/`** and **`src/`** (repo root).

The Node server serves this APK from **`GET /api/system/android-apk`** (default UI link), **`GET /api/android-app.apk`**, **`GET /downloads/UpDownFX.apk`**, and **`GET /api/mobile-app`** if this file is present (see **`APK_FILE_PATH`** in `.env.example` for a custom path).

Do not commit large `.apk` files to Git if you use GitHub — upload to the server via SCP/FTP or CI instead.
