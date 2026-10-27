@echo off
rem Mulai ulang LocalPrint (dipakai setelah mengubah file .env).
schtasks /end /tn "LocalPrint" >nul 2>&1
timeout /t 2 /nobreak >nul
schtasks /run /tn "LocalPrint"
if errorlevel 1 echo Auto-start belum dipasang. Jalankan install.bat dulu, atau pakai start.bat.
timeout /t 3 /nobreak >nul
