@echo off
setlocal
title Duello di carte
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Installalo da https://nodejs.org e riprova.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Prima esecuzione: installazione delle dipendenze...
  call npm install
  if errorlevel 1 ( echo Installazione fallita. & pause & exit /b 1 )
)

rem Ricostruisce solo se manca la build o se i sorgenti sono piu' recenti.
set NEEDBUILD=0
if not exist dist\index.html set NEEDBUILD=1
if %NEEDBUILD%==0 (
  for /f %%i in ('powershell -NoProfile -Command "$d=(Get-Item dist\index.html).LastWriteTime; $s=(Get-ChildItem src,public,index.html,vite.config.ts -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime; if($s -gt $d){1}else{0}"') do set NEEDBUILD=%%i
)
if %NEEDBUILD%==1 (
  echo Compilazione dell'app...
  call npm run build
  if errorlevel 1 ( echo Compilazione fallita. & pause & exit /b 1 )
)

echo.
echo  Su questo PC:            http://localhost:4173
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo  Da telefono o tablet:    http://%%b:4173   ^(stessa rete Wi-Fi^)
)
echo.
echo  Chiudi questa finestra per fermare il gioco.
echo.
start "" http://localhost:4173
call npx vite preview --host --port 4173 --strictPort
