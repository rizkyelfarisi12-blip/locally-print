@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env
if not exist node_modules call npm install --omit=dev
node server.js
