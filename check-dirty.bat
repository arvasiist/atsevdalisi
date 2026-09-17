@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "GITEXE="
where git >nul 2>nul
if %errorlevel%==0 set "GITEXE=git"
if not defined GITEXE (
  if exist "C:\Program Files\Git\cmd\git.exe" set "GITEXE=C:\Program Files\Git\cmd\git.exe"
)
if not defined GITEXE (
  for /d %%i in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%i\resources\app\git\cmd\git.exe" set "GITEXE=%%i\resources\app\git\cmd\git.exe"
  )
)

echo === %date% %time% === > check-dirty-log.txt
if not defined GITEXE (
  echo HATA: git.exe bulunamadi. >> check-dirty-log.txt
  goto :done
)

echo --- git status --- >> check-dirty-log.txt
"%GITEXE%" status >> check-dirty-log.txt 2>&1
echo. >> check-dirty-log.txt
echo --- git diff --stat --- >> check-dirty-log.txt
"%GITEXE%" diff --stat >> check-dirty-log.txt 2>&1
echo. >> check-dirty-log.txt
echo --- git diff (icerik, ilk 200 satir) --- >> check-dirty-log.txt
"%GITEXE%" diff >> check-dirty-log.txt 2>&1
echo. >> check-dirty-log.txt
echo --- git log -3 --oneline --- >> check-dirty-log.txt
"%GITEXE%" log -3 --oneline >> check-dirty-log.txt 2>&1

:done
echo Tamamlandi. check-dirty-log.txt dosyasina bakabilirsiniz.
pause
