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

# If APP_SECRET is still the placeholder, auto-generate one so every container
# gets its own encryption key. Jira tokens stored with the old key will not be
# decryptable after a restart — rotate deliberately by pinning APP_SECRET.
if echo "$APP_SECRET" | grep -q "^change-me-to-at-least"; then
  APP_SECRET=$(openssl rand -base64 32)
  echo "[entrypoint] WARNING: APP_SECRET is the default placeholder; generated an ephemeral secret for this run."
  echo "[entrypoint]   Set APP_SECRET in your environment or .env to a fixed value for production use."
  echo "[entrypoint]   Stored Jira tokens are encrypted with this key — if it changes, connections must be re-established."
  export APP_SECRET
fi

exec "$@"
