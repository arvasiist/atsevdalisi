@echo off
REM ==========================================================================
REM  AT SEVDALISI - YEREL BASLATMA (Windows cmd)
REM
REM  Kullanim: proje klasorunde cmd acip   tools\dev\yerel-baslat.cmd
REM  (ya da dosyaya cift tikla).
REM
REM  Ne yapar:
REM   1. Projeye ozel bir PostgreSQL kumesi kurar/baslatir
REM      (%LOCALAPPDATA%\at-sevdalisi\pgdata, port 5433 - kurulu servisle
REM      cakismaz; yalnizca 127.0.0.1, sifresiz yerel erisim).
REM   2. Redis'in 6379'da calistigini kontrol eder.
REM   3. npm install + paket derleme + migration.
REM   4. API (4000) ve web (3000) ayri pencerelerde acilir, tarayici gelir.
REM
REM  Durdurmak: API/Web pencerelerini kapat, sonra tools\dev\yerel-durdur.cmd
REM  Buradaki JWT anahtari YALNIZCA yerel gelistirme icindir.
REM ==========================================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0..\.."

set "PGPORT_LOCAL=5433"
set "APPDIR=%LOCALAPPDATA%\at-sevdalisi"
set "PGDATA_DIR=%APPDIR%\pgdata"

REM --- PostgreSQL ikili dosyalari --------------------------------------------
set "PGBIN="
if exist "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" set "PGBIN=C:\Program Files\PostgreSQL\18\bin"
if not defined PGBIN for /d %%V in ("C:\Program Files\PostgreSQL\*") do if exist "%%V\bin\pg_ctl.exe" set "PGBIN=%%V\bin"
if not defined PGBIN (
  echo [HATA] PostgreSQL bulunamadi. https://www.postgresql.org/download/windows/ adresinden kur.
  goto :fail
)
echo [1/6] PostgreSQL: %PGBIN%

if not exist "%APPDIR%" mkdir "%APPDIR%"
if not exist "%PGDATA_DIR%\PG_VERSION" (
  echo       Ilk calistirma: veritabani kumesi olusturuluyor...
  "%PGBIN%\initdb.exe" -D "%PGDATA_DIR%" -U at_sevdalisi -A trust -E UTF8 --locale=C >"%APPDIR%\initdb.log" 2>&1
  if errorlevel 1 (
    echo [HATA] initdb basarisiz. Ayrinti: %APPDIR%\initdb.log
    goto :fail
  )
)

"%PGBIN%\pg_ctl.exe" -D "%PGDATA_DIR%" status >nul 2>&1
if errorlevel 1 (
  "%PGBIN%\pg_ctl.exe" -D "%PGDATA_DIR%" -o "-p %PGPORT_LOCAL% -c listen_addresses=127.0.0.1" -l "%APPDIR%\postgres.log" -w start >nul
  if errorlevel 1 (
    echo [HATA] PostgreSQL baslamadi. Ayrinti: %APPDIR%\postgres.log
    goto :fail
  )
)
"%PGBIN%\createdb.exe" -h 127.0.0.1 -p %PGPORT_LOCAL% -U at_sevdalisi at_sevdalisi >nul 2>&1
echo       Veritabani hazir (port %PGPORT_LOCAL%).

REM --- Redis ---------------------------------------------------------------
echo [2/6] Redis kontrol ediliyor (127.0.0.1:6379)...
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 6379); $c.Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  where redis-server >nul 2>&1
  if not errorlevel 1 (
    echo       Redis kapali; baslatiliyor...
    start "Redis" /min redis-server
    timeout /t 2 >nul
  ) else (
    echo [HATA] Redis 6379'da calismiyor. Redis/Memurai kurup baslat, sonra tekrar dene.
    goto :fail
  )
)

REM --- Ortam degiskenleri (alt pencereler devralir) ------------------------
set "NODE_ENV=development"
set "DATABASE_URL=postgres://at_sevdalisi@127.0.0.1:%PGPORT_LOCAL%/at_sevdalisi"
set "REDIS_URL=redis://127.0.0.1:6379"
set "JWT_SECRET=yerel-gelistirme-anahtari-uretimde-kullanma"
set "WEB_BASE_URL=http://localhost:3000"
set "CORS_ORIGIN=http://localhost:3000"

REM --- Bagimliliklar + derleme + migration -------------------------------
echo [3/6] npm install...
call npm install
if errorlevel 1 goto :fail
echo [4/6] Paylasilan paketler derleniyor...
call npm run build:packages
if errorlevel 1 goto :fail
echo [5/6] Migration...
call npm run migrate
if errorlevel 1 goto :fail

REM --- Sunucular -------------------------------------------------------------
echo [6/6] API ve web baslatiliyor (ayri pencerelerde)...
start "At Sevdalisi API (4000)" cmd /k "npm run dev:api"
start "At Sevdalisi Web (3000)" cmd /k "npm run dev:web"

echo       Web hazir olunca tarayici acilacak (ilk derleme 1-2 dakika surebilir)...
powershell -NoProfile -Command "for ($i = 0; $i -lt 120; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://localhost:3000 | Out-Null; exit 0 } catch { Start-Sleep -Seconds 2 } }; exit 1"
start "" http://localhost:3000
echo.
echo Hazir: http://localhost:3000  -  "Misafir olarak basla" ile hesap acabilirsin.
echo Durdurmak icin API/Web pencerelerini kapat, sonra tools\dev\yerel-durdur.cmd
endlocal
exit /b 0

:fail
echo.
echo Baslatma tamamlanamadi. Yukaridaki mesaja bak.
endlocal
pause
exit /b 1
