#!/bin/sh
# Cada minuto: espejo Alexa ⇄ Bring! (si hay lista de Alexa configurada) y exportación de compra.json para la app.
mkdir -p /familia/estado
while true; do
  if python3 -I -c "import json,os;c=json.load(open(os.environ['FAMILIA_CONFIG']));raise SystemExit(0 if c.get('home_assistant',{}).get('compra_alexa') else 1)"; then
    python3 -I scripts/compra_sync.py || echo "compra_sync: error (se reintenta en un minuto)"
  fi
  python3 -I scripts/compra_export.py || echo "compra_export: error (se reintenta en un minuto)"
  sleep 60
done
