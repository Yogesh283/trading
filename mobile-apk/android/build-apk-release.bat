@echo off
setlocal

set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo ERROR: JAVA_HOME not found: %JAVA_HOME%
  exit /b 1
)
set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%~dp0"

echo Stopping Gradle daemons (fixes locked mergeReleaseResources on Windows)...
call gradlew.bat --stop
timeout /t 3 /nobreak >nul

echo Cleaning...
call gradlew.bat clean

echo Building release APK...
call gradlew.bat assembleRelease --no-daemon
if errorlevel 1 (
  echo.
  echo BUILD FAILED. If "Unable to delete directory", close Android Studio and retry.
  exit /b 1
)

echo.
echo SUCCESS: app\build\outputs\apk\release\app-release.apk
endlocal
