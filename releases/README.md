# Release APK (optional)

Place your signed **`UpDownFX.apk`** here as:

```
releases/UpDownFX.apk
```

Same folder level as **`frontend/`** and **`src/`** (repo root).

The Node server serves **`GET /downloads/UpDownFX.apk`** from this file if present (see **`APK_FILE_PATH`** in `.env.example` for a custom path).

Do not commit large `.apk` files to Git if you use GitHub — upload to the server via SCP/FTP or CI instead.
