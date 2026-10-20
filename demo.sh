#!/usr/bin/env bash
# Levanta Avisar como corre en producción: un solo proceso en el 3333
# sirviendo la API y la web compilada, detrás de la URL del túnel.
#
# Uso:  ./demo.sh https://xxxxx.lhr.life
set -e

URL="${1:?Pasá la URL del túnel: ./demo.sh https://xxxxx.lhr.life}"
cd /home/juan/repos/notifacionesAvisar

echo "→ Compilando la web…"
pnpm build >/dev/null

echo "→ Arrancando con WEB_APP_URL=$URL"
cd apps/api
exec env SERVE_WEB=true WEB_APP_URL="$URL" PORT=3333 pnpm exec tsx src/main.ts
