@echo off
setlocal
set "GIT=C:\Users\adema\AppData\Local\GitHubDesktop\app-3.6.5\resources\app\git\cmd\git.exe"
set "REPO=C:\Users\adema\Desktop\at-sevdalisi"
set "BUNDLE=%~dp0pool-leak-fix.bundle"

cd /d "%REPO%"
if errorlevel 1 goto :fail

echo [1/5] Bundle dogrulaniyor...
"%GIT%" bundle verify "%BUNDLE%"
if errorlevel 1 goto :fail

echo [2/5] Bundle fetch ediliyor...
"%GIT%" fetch "%BUNDLE%" main:refs/bundle-main-9
if errorlevel 1 goto :fail

echo [3/5] main'e merge ediliyor (fast-forward)...
"%GIT%" checkout main
if errorlevel 1 goto :fail
"%GIT%" merge --ff-only refs/bundle-main-9
if errorlevel 1 goto :fail

echo [4/5] origin/main'e push ediliyor...
"%GIT%" push origin main
if errorlevel 1 goto :fail

echo [5/5] Basarili! PG_POOL/REDIS_CLIENT connection-leak fix push edildi.
goto :end

:fail
echo HATA olustu, yukaridaki adima bakin.
exit /b 1

:end
endlocal
