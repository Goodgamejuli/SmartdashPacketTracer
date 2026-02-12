@echo off
cd /d "%~dp0"

set "SIM=src\sim\Localhost"
if not exist "%SIM%\ws_tap_proxy.py" set "SIM=src\sim\Host Webserver"

if not exist "%SIM%\ws_tap_proxy.py" (
    echo ws_tap_proxy.py nicht gefunden.
    pause
    exit /b
)

set "VENV=%SIM%\.venv\Scripts\python.exe"

if not exist "%VENV%" (
    echo Python venv nicht gefunden.
    pause
    exit /b
)

echo Starte TapProxy...
echo UI muss verbinden zu: ws://localhost:8766/packets
echo.

"%VENV%" -u "%SIM%\ws_tap_proxy.py"

echo.
echo TapProxy beendet.
pause
