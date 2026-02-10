@echo off
setlocal
cd /d "%~dp0"

echo [DEBUG] Projektpfad: %cd%
if not exist package.json (
  echo [FEHLER] package.json fehlt. Script muss im Projektroot liegen.
  pause & exit /b 1
)

set "SIM=src\sim\Localhost"
set "PY=%SIM%\smartdash_transfer_ws.py"
set "VENV=%SIM%\.venv\Scripts\python.exe"

if not exist "%PY%" (
  echo [FEHLER] Nicht gefunden: %PY%
  pause & exit /b 1
)

if not exist "%VENV%" (
  echo [FEHLER] Venv fehlt: %VENV%
  echo        Einmal manuell ausfuehren:
  echo        py -3 -m venv "%SIM%\.venv"
  echo        "%SIM%\.venv\Scripts\python.exe" -m pip install -r "%SIM%\requirements.txt"
  pause & exit /b 1
)

start "ws-simulator" cmd /k ""%VENV%" "%PY%" ^& echo. ^& echo [INFO] Wenn Fehler: hier kopieren. ^& pause"
start "vite-dev" cmd /k "npm run dev -- --port 5173 --open ^& echo. ^& pause"

echo [INFO] gestartet. Wenn ein Fenster sofort schliesst, ist dort ein Fehlertext.
pause
