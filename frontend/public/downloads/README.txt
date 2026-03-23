Place your release APK here as:

  UpDownFX.apk

Ways to get the file here:
1) After Android Studio build: from repo root run  npm run copy-apk --prefix frontend
   (copies from mobile-apk/android/app/build/outputs/apk/...)

2) Or copy UpDownFX.apk manually into frontend/public/downloads/

3) On the server: put UpDownFX.apk in releases/ (repo root) OR set APK_FILE_PATH in .env
   — Node serves GET /api/android-app.apk and GET /downloads/UpDownFX.apk even without rebuilding the frontend.

Or set VITE_APK_DOWNLOAD_URL in frontend/.env to any full URL (Drive, CDN) instead.
