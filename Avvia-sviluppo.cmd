@echo off
setlocal
title Duello di carte (sviluppo)
cd /d "%~dp0"
if not exist node_modules call npm install
echo Server di sviluppo con ricarica automatica su http://localhost:5173
start "" http://localhost:5173
call npm run dev
