@echo off
setlocal
cd /d "%~dp0"

if not exist package.json (
  echo [FEHLER] package.json fehlt. Script muss im Projektroot liegen.
  pause & exit /b 1
)

set "SIM=src\sim\Localhost"
set "PY=%SIM%\smartdash_transfer_ws.py"
set "REQ=%SIM%\requirements.txt"
set "VENV_PY=%SIM%\.venv\Scripts\python.exe"

echo.
echo [INFO] ROOT: %cd%
echo [INFO] PY  : %PY%
echo.

if not exist "%PY%" (
  echo [FEHLER] Nicht gefunden: %PY%
  pause & exit /b 1
)

if not exist "%REQ%" (
  echo [FEHLER] Nicht gefunden: %REQ%
  pause & exit /b 1
)

REM venv fehlt -> automatisch erstellen + deps installieren
if not exist "%VENV_PY%" (
  echo [INFO] .venv fehlt. Erzeuge venv und installiere Abhaengigkeiten...
  py -3 -m venv "%SIM%\.venv" || (echo [FEHLER] venv Erstellung fehlgeschlagen. && pause && exit /b 1)
  "%VENV_PY%" -m pip install -r "%REQ%" || (echo [FEHLER] pip install fehlgeschlagen. && pause && exit /b 1)
)

start "ws-simulator" cmd /k ""%VENV_PY%" "%PY%" ^& echo. ^& echo [INFO] Wenn Fehler: hier kopieren. ^& pause"
start "vite-dev" cmd /k "npm run dev -- --port 5173 --open ^& echo. ^& pause"
