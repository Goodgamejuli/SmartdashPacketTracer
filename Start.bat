@echo off
setlocal ENABLEEXTENSIONS

:: In Projektordner wechseln (wo package.json liegt)
pushd "%~dp0"

:: ----- Checks -----
if not exist "package.json" (
  echo [FEHLER] Keine package.json gefunden. Bitte die Batch im Projektordner ablegen/ausfuehren.
  pause & exit /b 1
)

where node >nul 2>&1 || (echo [FEHLER] Node.js nicht gefunden. Bitte Node LTS installieren. & pause & exit /b 1)
where npm  >nul 2>&1 || (echo [FEHLER] npm nicht gefunden. Ist Node korrekt installiert? & pause & exit /b 1)

:: --- Optional: Abhaengigkeiten installieren ---
if not exist "node_modules" (
  echo [INFO] Installiere Abhaengigkeiten ...
  call npm install || (echo [FEHLER] npm install fehlgeschlagen. & pause & exit /b 1)
)

:: ----- Port setzen -----
set PORT=5173
set LOCAL_URL=http://localhost:%PORT%/

echo [INFO] Starte Dev-Server...
start "vite-dev" cmd /k "npm run dev -- --host --port %PORT% --open"

echo.
echo [INFO] Frontend gestartet: %LOCAL_URL%
echo [INFO] WICHTIG: WebSocket-Adresse steht in AppShell.tsx (WS_URL).
echo [INFO] - Lokaltest: ws://localhost:8765/packets
echo [INFO] - Heimnetz:  ws://<IP-des-WS-Servers>:8765/packets
echo.
pause
