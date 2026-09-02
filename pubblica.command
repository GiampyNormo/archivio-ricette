#!/bin/bash
# Doppio click per mandare online le ricette nuove.
cd "$(dirname "$0")"

echo ""
echo "  📤  PUBBLICO L'ARCHIVIO"
echo "  ────────────────────────────────────────────"

if [ -z "$(git status --porcelain)" ]; then
  echo "  Non c'è niente di nuovo da pubblicare."
  echo ""
  read -n 1 -s -r -p "  Premi un tasto per chiudere." || true
  exit 0
fi

RICETTE=$(/usr/bin/python3 -c "import json;print(len(json.load(open('docs/data/recipes.json'))['recipes']))" 2>/dev/null || echo "?")

git add -A
git commit -q -m "Archivio aggiornato: $RICETTE ricette ($(date '+%d/%m/%Y %H:%M'))"

if git push -q; then
  URL=$(git remote get-url origin | sed -E 's#.*github.com[:/]([^/]+)/(.+)\.git#https://\1.github.io/\2/#' | tr 'A-Z' 'a-z')
  echo "  Fatto: $RICETTE ricette online."
  echo ""
  echo "  Dal telefono →  $URL"
  echo "  (un minuto o due prima che si aggiorni)"
else
  echo "  ⚠️  Push non riuscito. Controlla la connessione."
fi

echo "  ────────────────────────────────────────────"
echo ""
read -n 1 -s -r -p "  Premi un tasto per chiudere." || true
