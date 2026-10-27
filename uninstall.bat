@echo off
cd /d "%~dp0"
echo Menghapus auto-start LocalPrint...
schtasks /end /tn "LocalPrint" >nul 2>&1
schtasks /delete /tn "LocalPrint" /f
netsh advfirewall firewall delete rule name="LocalPrint" >nul 2>&1
del "%USERPROFILE%\Desktop\LocalPrint.url" >nul 2>&1
echo.
echo Selesai. File aplikasi dan riwayat tidak dihapus; folder ini boleh dihapus manual.
pause
