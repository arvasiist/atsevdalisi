@echo off
REM AT SEVDALISI - yerel PostgreSQL kumesini durdurur (veriler silinmez).
REM API/Web pencerelerini once kapat.
setlocal
set "PGDATA_DIR=%LOCALAPPDATA%\at-sevdalisi\pgdata"
set "PGBIN="
if exist "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" set "PGBIN=C:\Program Files\PostgreSQL\18\bin"
if not defined PGBIN for /d %%V in ("C:\Program Files\PostgreSQL\*") do if exist "%%V\bin\pg_ctl.exe" set "PGBIN=%%V\bin"
if not defined PGBIN (
  echo PostgreSQL bulunamadi.
  exit /b 1
)
"%PGBIN%\pg_ctl.exe" -D "%PGDATA_DIR%" -w stop
endlocal
