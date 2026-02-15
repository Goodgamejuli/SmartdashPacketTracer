@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SmartDash Packet Tracer (Localhost + Tap)

set "SIM=src\sim\Localhost"

set "PY_SIM=%SIM%\smartdash_transfer_ws.py"
set "PY_TAP=%SIM%\ws_tap_proxy.py"
set "REQ=%SIM%\requirements.txt"

set "VENV_DIR=%SIM%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"

echo.
echo [DEBUG] ROOT    = %cd%
echo [DEBUG] SIM     = %SIM%
echo [DEBUG] PY_SIM  = %PY_SIM%
echo [DEBUG] PY_TAP  = %PY_TAP%
echo [DEBUG] REQ     = %REQ%
echo [DEBUG] VENV_PY = %VENV_PY%
echo.

if not exist package.json (
  echo [FEHLER] package.json fehlt. Script muss im Projektroot liegen.
  pause & exit /b 1
)

if not exist "%PY_SIM%" (
  echo [FEHLER] Nicht gefunden: %PY_SIM%
  pause & exit /b 1
)

if not exist "%PY_TAP%" (
  echo [FEHLER] Nicht gefunden: %PY_TAP%
  pause & exit /b 1
)

if not exist "%REQ%" (
  echo [FEHLER] Nicht gefunden: %REQ%
  pause & exit /b 1
)

REM venv automatisch erstellen + deps installieren
if not exist "%VENV_PY%" (
  echo [INFO] .venv fehlt. Erzeuge venv...
  py -3 -m venv "%VENV_DIR%" || (echo [FEHLER] venv Erstellung fehlgeschlagen. & pause & exit /b 1)
  echo [INFO] Installiere Python-Abhaengigkeiten...
  "%VENV_PY%" -m pip install -r "%REQ%" || (echo [FEHLER] pip install fehlgeschlagen. & pause & exit /b 1)
)

echo.
echo [INFO] Starte Simulator (8765), TapProxy (8766, RAW), Frontend (5173).
echo [INFO] UI verbindet zu TapProxy: ws://localhost:8766/packets
echo.

REM 1) Simulator (im SIM-Ordner; deshalb nur relative Pfade benutzen)
start "WS Simulator :8765" "%SystemRoot%\System32\cmd.exe" /k ^
"cd /d ""%SIM%"" ^
& echo [DEBUG] CWD (SIM) = ^& cd ^
& echo [DEBUG] VENV_PY   = .venv\Scripts\python.exe ^
& .venv\Scripts\python.exe smartdash_transfer_ws.py"

timeout /t 2 >nul

REM 2) TapProxy (RAW anzeigen, unveraendert)
start "TapProxy RAW :8766" "%SystemRoot%\System32\cmd.exe" /k ^
"cd /d ""%SIM%"" ^
& echo [DEBUG] CWD (TAP) = ^& cd ^
& set LISTEN_HOST=127.0.0.1 ^
& set LISTEN_PORT=8766 ^
& set UPSTREAM_URL=ws://127.0.0.1:8765/packets ^
& set WS_PATH=/packets ^
& echo [DEBUG] LISTEN   = ws://127.0.0.1:8766/packets ^
& echo [DEBUG] UPSTREAM = ws://127.0.0.1:8765/packets ^
& .venv\Scripts\python.exe ws_tap_proxy.py"

timeout /t 1 >nul

REM 3) Frontend (UI auf TapProxy zeigen)
start "Frontend :5173" "%SystemRoot%\System32\cmd.exe" /k ^
"cd /d ""%~dp0"" ^
& set VITE_WS_URL=ws://127.0.0.1:8766/packets ^
& echo [DEBUG] VITE_WS_URL = %VITE_WS_URL% ^
& npm run dev -- --port 5173 --open"

endlocal
