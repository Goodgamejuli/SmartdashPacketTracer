#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="smartdash_transfer_ws.py"

lxterminal --working-directory="$SCRIPT_DIR" -e bash -c "
echo '🟢 Smartdash Transfer – Live Console'
echo '📁 Ordner: $SCRIPT_DIR'
echo '-----------------------------------'

# venv aktivieren, falls vorhanden
if [[ -f .venv/bin/activate ]]; then
  source .venv/bin/activate
  echo '✅ venv aktiviert'
else
  echo 'ℹ️ keine venv – nutze systemweites python3'
fi

echo '🚀 starte $APP'
echo

python3 $APP

echo
echo '❌ Script beendet'
read -p 'ENTER zum Schließen…'
"

