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

echo === %date% %time% === > finish-merge-log.txt
if not defined GITEXE (
  echo HATA: git.exe bulunamadi. >> finish-merge-log.txt
  goto :done
)

"%GITEXE%" diff --quiet
if errorlevel 1 (
  echo UYARI: commit edilmemis degisiklikler var, islem durduruldu. >> finish-merge-log.txt
  echo UYARI: Commit edilmemis degisiklikleriniz var, guvenlik icin islem durduruldu.
  pause
  exit /b 1
)

echo === Fetching final bundle === >> finish-merge-log.txt
"%GITEXE%" fetch at-sevdalisi-final-merge.bundle main-final:incoming-final >> finish-merge-log.txt 2>&1
if errorlevel 1 goto :error

echo === Fetching origin (guncel durumu almak icin) === >> finish-merge-log.txt
"%GITEXE%" fetch origin main >> finish-merge-log.txt 2>&1

echo === Checking out main === >> finish-merge-log.txt
"%GITEXE%" checkout main >> finish-merge-log.txt 2>&1
if errorlevel 1 goto :error

echo === Fast-forward merge === >> finish-merge-log.txt
"%GITEXE%" merge --ff-only incoming-final >> finish-merge-log.txt 2>&1
if errorlevel 1 goto :error

echo === Pushing to origin/main === >> finish-merge-log.txt
"%GITEXE%" push origin main >> finish-merge-log.txt 2>&1
if errorlevel 1 goto :error

echo === BASARILI === >> finish-merge-log.txt
echo.
echo Islem basarili! recovered-e2-e3-h2-fix duzeltmesi main'e birlestirilip push edildi.
pause
exit /b 0

:error
echo.
echo HATA olustu. Lutfen finish-merge-log.txt dosyasina bakin.
pause
exit /b 1
