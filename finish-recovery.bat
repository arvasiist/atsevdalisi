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

echo === %date% %time% === > finish-recovery-log.txt
if not defined GITEXE (
  echo HATA: git.exe bulunamadi. >> finish-recovery-log.txt
  goto :done
)

echo --- Branch listesi --- >> finish-recovery-log.txt
"%GITEXE%" branch -v >> finish-recovery-log.txt 2>&1

echo. >> finish-recovery-log.txt
echo --- recovered-e2-e3-h2-fix branch'inin durumu --- >> finish-recovery-log.txt
"%GITEXE%" log -1 --oneline recovered-e2-e3-h2-fix >> finish-recovery-log.txt 2>&1
if errorlevel 1 (
  echo HATA: recovered-e2-e3-h2-fix branch'i bulunamadi. >> finish-recovery-log.txt
  goto :done
)

echo. >> finish-recovery-log.txt
echo --- Push ediliyor --- >> finish-recovery-log.txt
"%GITEXE%" push origin recovered-e2-e3-h2-fix:recovered-e2-e3-h2-fix >> finish-recovery-log.txt 2>&1

:done
echo Tamamlandi. finish-recovery-log.txt dosyasina bakabilirsiniz.
pause
