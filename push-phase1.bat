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

echo === %date% %time% === > push-phase1-log.txt
if not defined GITEXE (
  echo HATA: git.exe bulunamadi. >> push-phase1-log.txt
  echo HATA: git.exe bulunamadi.
  pause
  exit /b 1
)

"%GITEXE%" diff --quiet
if errorlevel 1 (
  echo UYARI: commit edilmemis degisiklikler var, islem durduruldu. >> push-phase1-log.txt
  echo UYARI: Commit edilmemis degisiklikleriniz var, guvenlik icin islem durduruldu.
  pause
  exit /b 1
)

echo === Fetching phase1 bundle === >> push-phase1-log.txt
"%GITEXE%" fetch phase1-visual-upgrade.bundle main:incoming-phase1 >> push-phase1-log.txt 2>&1
if errorlevel 1 goto :error

echo === Fetching origin (guncel durumu almak icin) === >> push-phase1-log.txt
"%GITEXE%" fetch origin main >> push-phase1-log.txt 2>&1

echo === Checking out main === >> push-phase1-log.txt
"%GITEXE%" checkout main >> push-phase1-log.txt 2>&1
if errorlevel 1 goto :error

echo === Fast-forward merge === >> push-phase1-log.txt
"%GITEXE%" merge --ff-only incoming-phase1 >> push-phase1-log.txt 2>&1
if errorlevel 1 goto :error

echo === Pushing to origin/main === >> push-phase1-log.txt
"%GITEXE%" push origin main >> push-phase1-log.txt 2>&1
if errorlevel 1 goto :error

echo === BASARILI === >> push-phase1-log.txt
echo.
echo Islem basarili! Faz 1 gorsel kalite yukseltmesi main'e push edildi.
pause
exit /b 0

:error
echo.
echo HATA olustu. Lutfen push-phase1-log.txt dosyasina bakin.
type push-phase1-log.txt
pause
exit /b 1
