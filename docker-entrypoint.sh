#!/bin/sh
set -e

: "${DATABASE_URL:?DATABASE_URL is required}"

DB_PATH="${DATABASE_URL#file:}"
DB_PATH="${DB_PATH%%\?*}"

case "$DATABASE_URL" in
  file:*)
    mkdir -p "$(dirname "$DB_PATH")"
    if [ ! -f "$DB_PATH" ]; then
      echo "[entrypoint] initializing empty database at $DB_PATH"
      cp /app/prisma/app.db "$DB_PATH"
    fi
    ;;
esac

exec "$@"
