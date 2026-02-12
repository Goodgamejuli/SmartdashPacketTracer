#!/usr/bin/env bash
set -euo pipefail

# =========================================================
# SmartDash Packet Tracer (Localhost) - Linux Start
# - Startet WS-Simulator zuerst (Python)
# - Startet danach Frontend (Vite)
# - Erstellt .venv lokal pro Rechner
# - Installiert requirements.txt und npm deps, falls nötig
# =========================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT_UI="${PORT_UI:-5173}"
PORT_WS="${PORT_WS:-8765}"
WS_PATH="${WS_PATH:-/packets}"
export VITE_WS_URL="${VITE_WS_URL:-ws://localhost:${PORT_WS}${WS_PATH}}"

SIM_DIR="$ROOT_DIR/src/sim/Localhost"
PY_SCRIPT="$SIM_DIR/smartdash_transfer_ws.py"
REQ_FILE="$SIM_DIR/requirements.txt"
VENV_DIR="$SIM_DIR/.venv"
WS_LOG="$SIM_DIR/ws_server.log"

echo
echo "[INFO] Projektroot: $ROOT_DIR"
echo "[INFO] Simulator-Ordner: $SIM_DIR"
echo "[INFO] Python-Script: $PY_SCRIPT"
echo "[INFO] requirements.txt: $REQ_FILE"
echo "[INFO] VITE_WS_URL: $VITE_WS_URL"
echo "[INFO] UI-Port: $PORT_UI | WS-Port: $PORT_WS"
echo

# ---------------------------------------------------------
# Checks
# ---------------------------------------------------------
if [[ ! -f "$ROOT_DIR/package.json" ]]; then
  echo "[FEHLER] package.json fehlt. start_linux.sh muss im Projektroot liegen."
  exit 1
fi

if [[ ! -d "$SIM_DIR" ]]; then
  echo "[FEHLER] Simulator-Ordner fehlt: $SIM_DIR"
  exit 1
fi

if [[ ! -f "$PY_SCRIPT" ]]; then
  echo "[FEHLER] Python-Script fehlt: $PY_SCRIPT"
  exit 1
fi

if [[ ! -f "$REQ_FILE" ]]; then
  echo "[FEHLER] requirements.txt fehlt: $REQ_FILE"
  exit 1
fi

command -v node >/dev/null 2>&1 || { echo "[FEHLER] node fehlt. Bitte Node.js LTS installieren."; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "[FEHLER] npm fehlt. Bitte Node.js LTS installieren."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[FEHLER] python3 fehlt. Bitte Python 3.9+ installieren."; exit 1; }

# ---------------------------------------------------------
# Cleanup: WS-Server stoppen
# ---------------------------------------------------------
WS_PID=""
cleanup() {
  echo
  echo "[INFO] Beende Prozesse..."
  if [[ -n "${WS_PID}" ]] && kill -0 "${WS_PID}" >/dev/null 2>&1; then
    kill "${WS_PID}" >/dev/null 2>&1 || true
    sleep 0.2
    kill -9 "${WS_PID}" >/dev/null 2>&1 || true
  fi
  echo "[INFO] Fertig."
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------
# Python venv + deps
# ---------------------------------------------------------
echo "[INFO] Setup WebSocket-Simulator..."
if [[ ! -d "$VENV_DIR" ]]; then
  echo "[INFO] Erzeuge venv: $VENV_DIR"
  python3 -m venv "$VENV_DIR" || {
    echo "[FEHLER] venv-Erstellung fehlgeschlagen."
    echo "[HINWEIS] Debian/Ubuntu: sudo apt-get install python3-venv"
    exit 1
  }
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip >/dev/null 2>&1 || true
python -m pip install -r "$REQ_FILE"

# ---------------------------------------------------------
# Python WS-Server starten
# ---------------------------------------------------------
echo "[INFO] Starte WebSocket-Server (Log -> $WS_LOG)"
: > "$WS_LOG"
python "$PY_SCRIPT" >"$WS_LOG" 2>&1 &
WS_PID="$!"

sleep 0.5
if ! kill -0 "$WS_PID" >/dev/null 2>&1; then
  echo "[FEHLER] WebSocket-Server startete nicht. Letzte Logzeilen:"
  tail -n 80 "$WS_LOG" || true
  exit 1
fi

echo "[INFO] WebSocket-Server läuft. Erwartet: ws://localhost:${PORT_WS}${WS_PATH}"
echo

# ---------------------------------------------------------
# Frontend deps
# ---------------------------------------------------------
echo "[INFO] Setup Frontend..."
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  if [[ -f "$ROOT_DIR/package-lock.json" ]]; then
    echo "[INFO] npm ci"
    npm ci
  else
    echo "[INFO] npm install"
    npm install
  fi
else
  echo "[INFO] node_modules vorhanden."
fi

# ---------------------------------------------------------
# Frontend starten (im aktuellen Terminal, zuverlässig)
# ---------------------------------------------------------
echo
echo "[INFO] Starte Frontend: http://localhost:${PORT_UI}/"
echo "[INFO] WS-URL (Frontend): $VITE_WS_URL"
echo "[INFO] WS-Log: $WS_LOG"
echo

# Browser öffnen, falls verfügbar (optional, still)
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:${PORT_UI}/" >/dev/null 2>&1 || true
fi

npm run dev -- --port "$PORT_UI"
