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

echo === %date% %time% === > push-ssao-fix-log.txt
if not defined GITEXE (
  echo HATA: git.exe bulunamadi. >> push-ssao-fix-log.txt
  echo HATA: git.exe bulunamadi.
  pause
  exit /b 1
)

"%GITEXE%" diff --quiet
if errorlevel 1 (
  echo UYARI: commit edilmemis degisiklikler var, islem durduruldu. >> push-ssao-fix-log.txt
  echo UYARI: Commit edilmemis degisiklikleriniz var, guvenlik icin islem durduruldu.
  pause
  exit /b 1
)

echo === Fetching ssao-fix bundle === >> push-ssao-fix-log.txt
"%GITEXE%" fetch phase1-ssao-fix.bundle main:incoming-ssao-fix >> push-ssao-fix-log.txt 2>&1
if errorlevel 1 goto :error

echo === Fetching origin (guncel durumu almak icin) === >> push-ssao-fix-log.txt
"%GITEXE%" fetch origin main >> push-ssao-fix-log.txt 2>&1

echo === Checking out main === >> push-ssao-fix-log.txt
"%GITEXE%" checkout main >> push-ssao-fix-log.txt 2>&1
if errorlevel 1 goto :error

echo === Fast-forward merge === >> push-ssao-fix-log.txt
"%GITEXE%" merge --ff-only incoming-ssao-fix >> push-ssao-fix-log.txt 2>&1
if errorlevel 1 goto :error

echo === Pushing to origin/main === >> push-ssao-fix-log.txt
"%GITEXE%" push origin main >> push-ssao-fix-log.txt 2>&1
if errorlevel 1 goto :error

echo === BASARILI === >> push-ssao-fix-log.txt
echo.
echo Islem basarili! SSAO tip duzeltmesi main'e push edildi.
pause
exit /b 0

:error
echo.
echo HATA olustu. Lutfen push-ssao-fix-log.txt dosyasina bakin.
type push-ssao-fix-log.txt
pause
exit /b 1
