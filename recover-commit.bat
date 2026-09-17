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

echo === %date% %time% === > recover-log.txt
if not defined GITEXE (
  echo HATA: git.exe bulunamadi. >> recover-log.txt
  goto :done
)

"%GITEXE%" branch recovered-e2-e3-h2-fix bf6d400 >> recover-log.txt 2>&1
"%GITEXE%" log -1 --oneline recovered-e2-e3-h2-fix >> recover-log.txt 2>&1

:done
echo Tamamlandi. recover-log.txt dosyasina bakabilirsiniz.
echo Simdi GitHub Desktop'ta branch seciciden "recovered-e2-e3-h2-fix" branch'ini secip Publish branch yapabilirsiniz.
pause
