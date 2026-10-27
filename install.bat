@echo off
setlocal enableextensions
cd /d "%~dp0"
title Pemasangan LocalPrint
echo ==============================================
echo   LocalPrint - Pemasangan
echo ==============================================
echo.
net session >nul 2>&1
if errorlevel 1 goto :needadmin

rem ---------- 1. Node.js ----------
call :findnode
if defined NODE goto :nodeok
echo [1/5] Node.js 18 atau lebih baru belum ada. Memasang lewat winget...
call :wg OpenJS.NodeJS.LTS
call :findnode
if defined NODE goto :nodeok
echo.
echo Node.js belum terpasang. Pasang manual dari https://nodejs.org (versi LTS),
echo lalu jalankan install.bat lagi.
goto :fail
:nodeok
echo [1/5] Node.js: %NODE%
> node.path echo %NODE%
for %%i in ("%NODE%") do set "NODEDIR=%%~dpi"

rem ---------- 2. Komponen aplikasi ----------
if exist node_modules\express if exist node_modules\pdf-lib goto :depsok
echo [2/5] Memasang komponen aplikasi lewat npm. Butuh internet...
call "%NODEDIR%npm.cmd" install --omit=dev --omit=optional
if errorlevel 1 goto :fail
:depsok
echo [2/5] Komponen aplikasi siap.

rem ---------- 3. Program pendukung ----------
echo [3/5] Memeriksa program pendukung...
"%NODE%" tools.js has SUMATRA
if not errorlevel 1 goto :sumok
echo   SumatraPDF belum ada ^(wajib untuk mencetak^). Memasang...
call :wg SumatraPDF.SumatraPDF
"%NODE%" tools.js has SUMATRA
if errorlevel 1 echo   SumatraPDF belum terdeteksi. Pasang manual, lalu atur lokasinya di halaman Admin.
:sumok
"%NODE%" tools.js has SOFFICE
if not errorlevel 1 goto :lookgs
echo.
echo   LibreOffice dibutuhkan untuk mencetak DOC/DOCX, gambar, dan TXT.
choice /c YN /m "  Pasang LibreOffice sekarang (besar, sekitar 350 MB)"
if errorlevel 2 goto :lookgs
call :wg TheDocumentFoundation.LibreOffice
:lookgs
"%NODE%" tools.js has GS
if not errorlevel 1 goto :toolsdone
echo.
echo   Ghostscript dibutuhkan untuk memaksa grayscale / hitam-putih.
choice /c YN /m "  Pasang Ghostscript sekarang"
if errorlevel 2 goto :toolsdone
call :wg ArtifexSoftware.GhostScript
:toolsdone

rem ---------- 4. Konfigurasi ----------
if exist .env goto :envok
set "PORT=80"
echo.
set /p PORT=Port aplikasi [Enter = 80]:
echo %PORT%| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 set "PORT=80"
> .env echo PORT=%PORT%
>> .env echo PIN=
>> .env echo ADMIN_PIN=
:envok
set "PORT=3000"
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"PORT=" .env') do set "PORT=%%b"
echo [4/5] Port aplikasi: %PORT%

rem ---------- 5. Firewall dan auto-start ----------
echo [5/5] Mengatur firewall dan auto-start...
schtasks /end /tn "LocalPrint" >nul 2>&1
netsh advfirewall firewall delete rule name="LocalPrint" >nul 2>&1
netsh advfirewall firewall add rule name="LocalPrint" dir=in action=allow protocol=TCP localport=%PORT% profile=private,domain >nul
schtasks /create /tn "LocalPrint" /tr "wscript.exe \"%~dp0run-hidden.vbs\"" /sc onlogon /delay 0000:20 /f >nul
if errorlevel 1 goto :fail
schtasks /run /tn "LocalPrint" >nul
> "%USERPROFILE%\Desktop\LocalPrint.url" echo [InternetShortcut]
>> "%USERPROFILE%\Desktop\LocalPrint.url" echo URL=http://localhost:%PORT%

echo.
echo ==============================================
"%NODE%" info.js %PORT%
echo ==============================================
echo.
echo LocalPrint jalan otomatis setiap kali Windows login. Tidak perlu npm start.
echo Atur lokasi LibreOffice / SumatraPDF / Ghostscript di: http://localhost:%PORT%/admin.html
echo Disarankan: beri komputer ini IP tetap atau DHCP reservation agar alamatnya tidak berubah.
echo.
pause
exit /b 0

:needadmin
echo Klik kanan install.bat lalu pilih "Run as administrator".
echo.
pause
exit /b 1

:fail
echo.
echo Pemasangan terhenti. Perbaiki pesan di atas lalu jalankan install.bat lagi.
pause
exit /b 1

:findnode
set "NODE="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE set "NODE=%%i"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE exit /b 0
"%NODE%" -e "process.exit(+process.versions.node.split('.')[0]>=18?0:1)"
if errorlevel 1 set "NODE="
exit /b 0

:wg
where winget >nul 2>&1
if errorlevel 1 goto :nowinget
winget install -e --id %~1 --silent --accept-package-agreements --accept-source-agreements
exit /b 0
:nowinget
echo   winget tidak tersedia di Windows ini. Pasang %~1 secara manual.
exit /b 0
