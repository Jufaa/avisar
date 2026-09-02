#!/bin/sh
set -e

# Migrations run before the process that depends on them, every boot.
#
# `migrate deploy` only applies what is pending and never generates, resets or
# prompts — it is the one migration command that is safe to run unattended
# against a database with real appointments in it. If it fails, the container
# refuses to start rather than serving against a schema it does not match.
echo "Applying database migrations…"
cd /app/apps/api
node_modules/.bin/prisma migrate deploy
cd /app

echo "Starting Avisar…"
exec node apps/api/dist/main.js
