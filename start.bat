@echo off
rem Menjalankan LocalPrint langsung di jendela ini (untuk uji coba / melihat pesan galat).
cd /d "%~dp0"
set "NODE=node"
if exist node.path set /p NODE=<node.path
if not exist .env copy .env.example .env >nul
if not exist node_modules\pdf-lib call npm install --omit=dev --omit=optional
"%NODE%" server.js
pause
