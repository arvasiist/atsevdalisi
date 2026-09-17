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

echo === %date% %time% === > orig-head-check.txt
if not defined GITEXE (
  echo HATA: git.exe bulunamadi. >> orig-head-check.txt
  goto :done
)

echo --- ORIG_HEAD --- >> orig-head-check.txt
"%GITEXE%" log -1 --stat ORIG_HEAD >> orig-head-check.txt 2>&1

echo. >> orig-head-check.txt
echo --- REFLOG (son 10) --- >> orig-head-check.txt
"%GITEXE%" reflog -10 >> orig-head-check.txt 2>&1

:done
echo Tamamlandi. orig-head-check.txt dosyasina bakabilirsiniz.
pause
