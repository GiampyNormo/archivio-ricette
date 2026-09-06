#!/bin/bash
# Doppio click per mandare online le ricette nuove.
cd "$(dirname "$0")"

echo ""
echo "  📤  PUBBLICO L'ARCHIVIO"
echo "  ────────────────────────────────────────────"

CAMBI=$(git status --porcelain)
# Anche i commit già fatti ma mai inviati vanno pubblicati: se un push
# fallisce (rete assente) restano qui, e senza questo controllo il comando
# direbbe per sempre "niente di nuovo" lasciando il sito indietro.
DA_INVIARE=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)

if [ -z "$CAMBI" ] && [ "$DA_INVIARE" = "0" ]; then
  echo "  Non c'è niente di nuovo da pubblicare."
  echo "  ────────────────────────────────────────────"
  echo ""
  read -n 1 -s -r -p "  Premi un tasto per chiudere." || true
  exit 0
fi

RICETTE=$(/usr/bin/python3 -c "import json;print(len(json.load(open('docs/data/recipes.json'))['recipes']))" 2>/dev/null || echo "?")

if [ -n "$CAMBI" ]; then
  git add -A
  git commit -q -m "Archivio aggiornato: $RICETTE ricette ($(date '+%d/%m/%Y %H:%M'))"
fi

if git push -q; then
  URL=$(git remote get-url origin | sed -E 's#.*github.com[:/]([^/]+)/(.+)\.git#https://\1.github.io/\2/#' | tr 'A-Z' 'a-z')
  echo "  Fatto: $RICETTE ricette online."
  echo ""
  echo "  Dal telefono →  $URL"
  echo "  (un minuto o due prima che si aggiorni)"
else
  echo "  ⚠️  Push non riuscito: controlla la connessione."
  echo "  Le ricette sono al sicuro, riprova più tardi con questo stesso comando."
fi

echo "  ────────────────────────────────────────────"
echo ""
read -n 1 -s -r -p "  Premi un tasto per chiudere." || true
