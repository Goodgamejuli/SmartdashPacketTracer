@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%cd%"

if not exist "%ROOT%\package.json" (
  echo [FEHLER] package.json fehlt. Script muss im Projektroot liegen.
  pause
  exit /b 1
)

set "SIM=%ROOT%\src\sim\Localhost"
set "PYSCRIPT=%SIM%\smartdash_transfer_ws.py"
set "PY_URL=https://www.python.org/ftp/python/3.14.3/python-3.14.3-amd64.exe"
set "PY_INSTALLER=%TEMP%\python-3.14.3-amd64.exe"
set "PYRUN="

if not exist "%SIM%" (
  echo [FEHLER] Simulator-Ordner nicht gefunden:
  echo         %SIM%
  pause
  exit /b 1
)

if not exist "%PYSCRIPT%" (
  echo [FEHLER] Python-Skript nicht gefunden:
  echo         %PYSCRIPT%
  pause
  exit /b 1
)

echo.
echo [INFO] ROOT      : %ROOT%
echo [INFO] SIM       : %SIM%
echo [INFO] PYSCRIPT  : %PYSCRIPT%
echo.

call :DetectPython
if not defined PYRUN (
  call :InstallPython
  call :DetectPython
)

if not defined PYRUN (
  echo [FEHLER] Python wurde weiterhin nicht gefunden.
  echo [HINWEIS] Starte das Script ggf. erneut nach der Installation.
  pause
  exit /b 1
)

echo [INFO] Verwende Python: %PYRUN%

echo [INFO] Pruefe pip ...
%PYRUN% -m pip --version >nul 2>nul
if errorlevel 1 (
  echo [INFO] pip fehlt. Versuche ensurepip ...
  %PYRUN% -m ensurepip --upgrade || (
    echo [FEHLER] ensurepip fehlgeschlagen.
    pause
    exit /b 1
  )
)

echo [INFO] Installiere Minimal-Abhaengigkeit websockets ...
%PYRUN% -m pip install websockets || (
  echo [FEHLER] pip install websockets fehlgeschlagen.
  pause
  exit /b 1
)

call :EnsureNode

start "ws-simulator" cmd /k ^
"cd /d ""%SIM%"" ^& ^
%PYRUN% -u ""smartdash_transfer_ws.py"" ^& echo. ^& pause"

start "vite-dev" cmd /k ^
"cd /d ""%ROOT%"" ^& ^
npm install ^& npm run dev -- --port 5173 --open ^& echo. ^& pause"

endlocal
exit /b 0

:DetectPython
set "PYRUN="

REM 1) Lokales venv im Projekt (falls vorhanden und lauffaehig)
if exist "%ROOT%\.venv\Scripts\python.exe" (
  "%ROOT%\.venv\Scripts\python.exe" -V >nul 2>nul && (
    set "PYRUN="%ROOT%\.venv\Scripts\python.exe""
    goto :eof
  )
)

REM 2) Python Install Manager / Launcher
py -3 -V >nul 2>nul && (
  set "PYRUN=py -3"
  goto :eof
)

REM 3) Klassischer PATH-Eintrag
python -V >nul 2>nul && (
  set "PYRUN=python"
  goto :eof
)

REM 4) Typischer Installationspfad nach user-install (ohne PATH-Refresh)
if exist "%LocalAppData%\Programs\Python\Python314\python.exe" (
  "%LocalAppData%\Programs\Python\Python314\python.exe" -V >nul 2>nul && (
    set "PYRUN="%LocalAppData%\Programs\Python\Python314\python.exe""
    goto :eof
  )
)

goto :eof

:InstallPython
echo.
echo [INFO] Python nicht gefunden. Lade Installer herunter ...
echo [INFO] URL: %PY_URL%

if exist "%PY_INSTALLER%" del /f /q "%PY_INSTALLER%" >nul 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%PY_URL%' -OutFile '%PY_INSTALLER%' -UseBasicParsing; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo [WARNUNG] Download per PowerShell fehlgeschlagen. Versuche curl ...
  curl -fL "%PY_URL%" -o "%PY_INSTALLER%"
)

if not exist "%PY_INSTALLER%" (
  echo [FEHLER] Download des Python-Installers fehlgeschlagen.
  pause
  exit /b 1
)

echo [INFO] Starte Python-Installer ...
echo [INFO] Erst stiller Installationsversuch (User-Install + PATH + pip).
"%PY_INSTALLER%" /passive InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_launcher=1 Include_test=0
if errorlevel 1 (
  echo [WARNUNG] Stiller Start fehlgeschlagen oder abgebrochen. Oeffne Installer normal ...
  start /wait "" "%PY_INSTALLER%"
)

echo [INFO] Python-Installation abgeschlossen (oder Installer beendet).
goto :eof

:EnsureNode
REM --- Node.js + npm automatisch installieren (nur falls node ODER npm fehlt) ---
set "NODE_MSI=%TEMP%\node-v24.14.0-x64.msi"

where node >nul 2>&1
if errorlevel 1 goto :install_node
where npm >nul 2>&1
if errorlevel 1 goto :install_node
goto :node_ok

:install_node
echo [INFO] Node.js/npm nicht gefunden. Lade Node.js Installer...

if exist "%NODE_MSI%" del /f /q "%NODE_MSI%" >nul 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.14.0/node-v24.14.0-x64.msi' -OutFile '%NODE_MSI%' -UseBasicParsing; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo [WARNUNG] Download per PowerShell fehlgeschlagen. Versuche curl ...
  curl -fL "https://nodejs.org/dist/v24.14.0/node-v24.14.0-x64.msi" -o "%NODE_MSI%"
)

if not exist "%NODE_MSI%" (
  echo [FEHLER] Node.js Installer konnte nicht heruntergeladen werden.
  pause
  exit /b 1
)

echo [INFO] Starte Node.js Installation...
msiexec /i "%NODE_MSI%" /passive /norestart

REM PATH fuer dieses Fenster ergaenzen (beide gaengigen Installationspfade)
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LocalAppData%\Programs\nodejs"

:node_ok
where node >nul 2>&1
if errorlevel 1 (
  echo [FEHLER] node wurde nach der Node.js Installation nicht gefunden.
  echo Bitte start_windows.bat einmal erneut starten.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [FEHLER] npm wurde nach der Node.js Installation nicht gefunden.
  echo Bitte start_windows.bat einmal erneut starten.
  pause
  exit /b 1
)

goto :eof