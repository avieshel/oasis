# IdentityHub — NHI Jira Integration

NHI (Non-Human Identity) management that reports findings to a Jira workspace
from a UI and a REST API. NestJS + Prisma (SQLite) + Vite/React SPA.

## Quick start (Docker)

```sh
docker compose up -d --build         # build + start on http://localhost:3000
docker compose run --rm seed          # optional: 2 demo tenants + users + fake Jira tickets
docker compose down && rm -rf ./data # wipe the database and start fresh
```

Open:

| Surface        | URL                           |
| -------------- | ----------------------------- |
| UI             | http://localhost:3000/        |
| Swagger (REST) | http://localhost:3000/swagger |
| Health         | http://localhost:3000/healthz |

## Security: APP_SECRET

`APP_SECRET` is the master encryption key for Jira tokens at rest (AES-256-GCM).
If you run `docker compose up` without setting it, the image generates an
**ephemeral secret** automatically — every container gets a different key. This
is safe for trying the app, but **stored Jira tokens will become undecryptable
after a restart** because the next container will generate a new key.

To keep your Jira connections working across restarts, pin a fixed value:

```sh
echo 'APP_SECRET=your-own-64-char-random-string-here!!!!!!!!!' >> .env
docker compose up -d
```

Set one at least 32 characters long from a cryptographically random source
(e.g. `openssl rand -base64 48`). Rotating it invalidates all stored Jira
tokens — connections must be re-established afterwards.

The image ships with no data. Demo users (created by `seed`, password
`demo1234` for all): `acme[EMAIL]`, `globex[EMAIL]`. `ALLOW_OPEN_SIGNUP`
and `ALLOW_ADMIN` are enabled, so you can also create users from the UI
or `/admin`.

## Inspecting the database

The database is a SQLite file. The image ships with the `sqlite3` CLI, so you
can query it from inside the running container without installing anything on
your host:

```sh
docker compose exec app sqlite3 /data/app.db
```

That drops you into an interactive SQL prompt. A few useful queries:

```sql
.tables
.schema oasis_items
SELECT slug, name FROM tenants;
SELECT email, tenant_id FROM users;
SELECT tenant_id, item_type, severity, status, title FROM oasis_items;
SELECT tenant_id, project_key, issue_key, title FROM tickets_cache;
SELECT tenant_id, user_id, action, target, at FROM audit_log ORDER BY at DESC LIMIT 20;
```

To run a single query non-interactively:

```sh
docker compose exec app sqlite3 /data/app.db "SELECT slug, name FROM tenants;"
```

The file is also bind-mounted on your host at `./data/app.db`, so you can open
it with any local SQLite viewer (DB Browser for SQLite, TablePlus, VS Code
SQLite extension) if you prefer a GUI.

To reset:

```sh
docker compose down && rm -rf ./data
```
