@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist package.json (
  echo [FEHLER] package.json fehlt. Script muss im Projektroot liegen.
  pause & exit /b 1
)

set "SIM=src\sim\Localhost"
set "PY=%SIM%\smartdash_transfer_ws.py"

echo.
echo [INFO] ROOT: %cd%
echo [INFO] PY  : %PY%
echo.

REM Python Launcher finden
set "PYLAUNCH="
py -3 -V >nul 2>nul && set "PYLAUNCH=py -3"
if "%PYLAUNCH%"=="" (
  python -V >nul 2>nul && set "PYLAUNCH=python"
)

if "%PYLAUNCH%"=="" (
  echo [FEHLER] Python nicht gefunden.
  pause & exit /b 1
)

echo Installiere Minimal-Abhaengigkeit websockets ...
  %PYLAUNCH% -m pip install websockets || (echo [FEHLER] pip install websockets fehlgeschlagen. && pause && exit /b 1)
)

start "ws-simulator" cmd /k ^
"cd /d ""%SIM%"" ^& ^
%PYLAUNCH% -u ""smartdash_transfer_ws.py"" ^& echo. ^& pause"

start "vite-dev" cmd /k ^
"npm install ^& npm run dev -- --port 5173 --open ^& echo. ^& pause"

endlocal
