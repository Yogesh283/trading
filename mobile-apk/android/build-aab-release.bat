@echo off
setlocal

set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo ERROR: JAVA_HOME not found: %JAVA_HOME%
  exit /b 1
)
set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%~dp0"

echo Stopping Gradle daemons...
call gradlew.bat --stop

echo Cleaning...
call gradlew.bat clean

echo Building Play Store AAB (package must be com.iqfxpro.trade)...
call gradlew.bat bundleRelease --no-daemon
if errorlevel 1 (
  echo BUILD FAILED.
  exit /b 1
)

echo.
echo SUCCESS: app\build\outputs\bundle\release\app-release.aab
endlocal
