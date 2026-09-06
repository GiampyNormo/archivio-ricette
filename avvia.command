#!/bin/bash
# Doppio click su questo file per aprire l'Archivio Ricette.
cd "$(dirname "$0")"

PY=/usr/bin/python3
PORTA=8790

# Le ricette aggiunte dal link stanno su GitHub: prima di partire ci si
# riallinea, altrimenti la copia locale mostrerebbe un archivio vecchio.
git pull --rebase --autostash -q 2>/dev/null || true

if ! $PY -c "import flask" 2>/dev/null; then
  echo "Manca Flask. Lo installo…"
  $PY -m pip install --user flask || { echo "Installazione non riuscita."; read -r; exit 1; }
fi

# Aspetta che il server risponda davvero prima di aprire il browser.
# Con un'attesa a tempo fisso capitava di arrivare troppo presto: la pagina
# non trovava il server, si metteva in sola lettura e il tasto "Nuova ricetta"
# spariva anche qui sul Mac.
(
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null -m 1 "http://127.0.0.1:$PORTA/"; then
      open "http://localhost:$PORTA"
      exit 0
    fi
    sleep 0.3
  done
  echo "  ⚠️  Il server non è partito: apri a mano http://localhost:$PORTA"
) &

$PY server.py
