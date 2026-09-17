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

echo === %date% %time% === > check-dirty2-log.txt
if not defined GITEXE (
  echo HATA: git.exe bulunamadi. >> check-dirty2-log.txt
  goto :done
)

echo --- son 6 commit (stat ile) --- >> check-dirty2-log.txt
"%GITEXE%" log -6 --stat >> check-dirty2-log.txt 2>&1
echo. >> check-dirty2-log.txt
echo --- 100a7cf bu dalda mi (main'in atasi mi) --- >> check-dirty2-log.txt
"%GITEXE%" merge-base --is-ancestor 100a7cf HEAD >> check-dirty2-log.txt 2>&1
echo exit_kodu: %errorlevel% >> check-dirty2-log.txt
echo. >> check-dirty2-log.txt
echo --- reflog (son 15) --- >> check-dirty2-log.txt
"%GITEXE%" reflog -15 >> check-dirty2-log.txt 2>&1

:done
echo Tamamlandi. check-dirty2-log.txt dosyasina bakabilirsiniz.
pause
