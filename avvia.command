#!/bin/bash
# Doppio click su questo file per aprire l'Archivio Ricette.
cd "$(dirname "$0")"

PY=/usr/bin/python3
if ! $PY -c "import flask" 2>/dev/null; then
  echo "Manca Flask. Lo installo…"
  $PY -m pip install --user flask || { echo "Installazione non riuscita."; read -r; exit 1; }
fi

# apre il browser appena il server è su
( sleep 1.5; open "http://localhost:8790" ) &

$PY server.py
