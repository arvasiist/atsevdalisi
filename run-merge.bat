@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "GITEXE="
where git >nul 2>nul
if %errorlevel%==0 (
  set "GITEXE=git"
)
if not defined GITEXE (
  if exist "C:\Program Files\Git\cmd\git.exe" set "GITEXE=C:\Program Files\Git\cmd\git.exe"
)
if not defined GITEXE (
  for /d %%i in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%i\resources\app\git\cmd\git.exe" set "GITEXE=%%i\resources\app\git\cmd\git.exe"
  )
)

echo === %date% %time% === > merge-log.txt
echo Working directory: %cd% >> merge-log.txt
echo Git executable: "%GITEXE%" >> merge-log.txt

if not defined GITEXE (
  echo HATA: git.exe bulunamadi. >> merge-log.txt
  echo HATA: Bilgisayarinizda git.exe bulunamadi.
  pause
  exit /b 1
)

"%GITEXE%" status >> merge-log.txt 2>&1

"%GITEXE%" diff --quiet
if errorlevel 1 (
  echo UYARI: commit edilmemis degisiklikler var, islem durduruldu. >> merge-log.txt
  echo UYARI: Commit edilmemis degisiklikleriniz var, guvenlik icin islem durduruldu.
  pause
  exit /b 1
)

echo === Fetching bundle === >> merge-log.txt
"%GITEXE%" fetch at-sevdalisi-merge.bundle main-merged:incoming-merge >> merge-log.txt 2>&1
if errorlevel 1 goto :error

echo === Checking out main === >> merge-log.txt
"%GITEXE%" checkout main >> merge-log.txt 2>&1
if errorlevel 1 goto :error

echo === Fast-forward merge === >> merge-log.txt
"%GITEXE%" merge --ff-only incoming-merge >> merge-log.txt 2>&1
if errorlevel 1 (
  echo ff-only basarisiz oldu, reset --hard ile deneniyor >> merge-log.txt
  "%GITEXE%" reset --hard incoming-merge >> merge-log.txt 2>&1
  if errorlevel 1 goto :error
)

echo === Pushing to origin/main === >> merge-log.txt
"%GITEXE%" push origin main >> merge-log.txt 2>&1
if errorlevel 1 goto :error

echo === BASARILI === >> merge-log.txt
echo.
echo Islem basarili! Degisiklikler origin/main'e push edildi.
echo Detaylar icin merge-log.txt dosyasina bakabilirsiniz.
pause
exit /b 0

:error
echo.
echo HATA olustu. Lutfen merge-log.txt dosyasina bakin.
pause
exit /b 1
