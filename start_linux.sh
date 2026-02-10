#!/usr/bin/env bash
set -euo pipefail

# --- in Projektroot wechseln (Verzeichnis der Datei) ---
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "[DEBUG] Projektpfad: $PWD"

# --- Checks ---
if [[ ! -f "package.json" ]]; then
  echo "[FEHLER] package.json fehlt. start.sh muss im Projektroot liegen."
  read -r -p "Enter zum Beenden..."
  exit 1
fi

command -v node >/dev/null 2>&1 || { echo "[FEHLER] node fehlt."; read -r -p "Enter..."; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "[FEHLER] npm fehlt.";  read -r -p "Enter..."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[FEHLER] python3 fehlt."; read -r -p "Enter..."; exit 1; }

# --- Pfade wie in Windows-Minimalskript ---
SIM_DIR="src/sim/Localhost"
PY_SCRIPT="${SIM_DIR}/smartdash_transfer_ws.py"
VENV_PY="${SIM_DIR}/.venv/bin/python3"

if [[ ! -f "$PY_SCRIPT" ]]; then
  echo "[FEHLER] Nicht gefunden: $PY_SCRIPT"
  read -r -p "Enter zum Beenden..."
  exit 1
fi

if [[ ! -x "$VENV_PY" ]]; then
  echo "[FEHLER] venv fehlt oder python nicht ausführbar: $VENV_PY"
  echo "        Einmal manuell ausführen:"
  echo "        python3 -m venv \"${SIM_DIR}/.venv\""
  echo "        \"${SIM_DIR}/.venv/bin/python3\" -m pip install -r \"${SIM_DIR}/requirements.txt\""
  read -r -p "Enter zum Beenden..."
  exit 1
fi

# --- Cleanup: Python WS Server stoppen wenn das Script endet ---
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

# --- WS-Server starten (im Hintergrund) ---
echo "[INFO] Starte WebSocket-Simulator: ws://localhost:8765/packets"
"${VENV_PY}" "${PY_SCRIPT}" &
WS_PID="$!"

sleep 0.3
if ! kill -0 "${WS_PID}" >/dev/null 2>&1; then
  echo "[FEHLER] WebSocket-Simulator startete nicht."
  read -r -p "Enter zum Beenden..."
  exit 1
fi

# --- Frontend starten (Vordergrund, damit Terminal offen bleibt) ---
echo "[INFO] Starte Frontend: http://localhost:5173"
echo "[INFO] Wenn npm beendet wird, stoppt auch der WS-Simulator."
npm run dev -- --port 5173 --open

# Wenn npm endet, greift trap/cleanup automatisch.
