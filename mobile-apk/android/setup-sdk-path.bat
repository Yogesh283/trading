@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo Looking for Android SDK...
set "FOUND="

for %%P in (
  "%LOCALAPPDATA%\Android\Sdk"
  "%USERPROFILE%\AppData\Local\Android\Sdk"
  "D:\Android\Sdk"
  "C:\Android\Sdk"
) do (
  if exist "%%~fP\platform-tools\adb.exe" (
    set "FOUND=%%~fP"
    goto :write
  )
)

echo.
echo [ERROR] Android SDK not found on this PC.
echo.
echo Install it once:
echo   1. Open Android Studio
echo   2. More Actions - SDK Manager  (or Settings - Android SDK)
echo   3. Install "Android SDK Platform" and "Android SDK Build-Tools"
echo   4. Copy "Android SDK Location" from the top of that screen
echo   5. Run this script again, OR edit local.properties manually:
echo      sdk.dir=C\:\\Users\\yogib\\AppData\\Local\\Android\\Sdk
echo.
echo Easier: Android Studio - File - Open - mobile-apk\android
echo        then Build - Build APK (no gradlew needed)
pause
exit /b 1

:write
set "SDK=!FOUND:\=\\!"
echo sdk.dir=!SDK!> local.properties
echo.
echo Wrote local.properties:
type local.properties
echo.
echo Now run: build-apk-release.bat
endlocal
