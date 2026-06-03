@echo off
setlocal

REM Android Studio bundled JDK (fixes "JAVA_HOME is not set")
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo ERROR: Java not found at %JAVA_HOME%
  echo Install Android Studio or set JAVA_HOME to your JDK 17+ folder.
  exit /b 1
)

REM Android SDK — edit this path if yours is different (Studio: Settings - Android SDK)
set "SDK_DIR=%LOCALAPPDATA%\Android\Sdk"
if exist "%SDK_DIR%" (
  echo sdk.dir=%SDK_DIR:\=\\%>"local.properties"
) else (
  echo.
  echo WARNING: Android SDK not found at %SDK_DIR%
  echo Open Android Studio - SDK Manager - install SDK, then check path in Settings.
  echo Edit local.properties: sdk.dir=C\:\\Users\\YOUR_USER\\AppData\\Local\\Android\\Sdk
  echo.
  if not exist "local.properties" (
    echo ERROR: local.properties missing. Create it with sdk.dir=... first.
    exit /b 1
  )
)

cd /d "%~dp0"
echo JAVA_HOME=%JAVA_HOME%
echo Building release bundle (AAB)...
call gradlew.bat bundleRelease
if errorlevel 1 (
  echo BUILD FAILED
  exit /b 1
)
echo.
echo OK: app\build\outputs\bundle\release\app-release.aab
echo For APK: gradlew.bat assembleRelease
endlocal
