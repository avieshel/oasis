# IdentityHub — NHI Jira Integration

NHI (Non-Human Identity) management that reports findings to a Jira workspace
from a UI and a REST API. NestJS + Prisma (SQLite) + Vite/React SPA.

## Quick start (Docker)

```sh
docker compose up -d --build         # build + start on http://localhost:3000
docker compose run --rm seed          # optional: seed demo tenants + users + fake Jira tickets
                                     #   (--rm only removes the one-off container, NOT the data)
docker compose down && rm -rf ./data # stop, then wipe the database entirely
```

### Data persistence

The app stores its SQLite database on your host at `./data/app.db` (bind-mounted
into the container). How the commands above affect it:

| Command                                | What happens                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up`                    | Data from previous runs persists.                                                                                                   |
| `docker compose down`                  | Stops and removes the container, but **keeps** `./data/app.db`.                                                                     |
| `docker compose down && rm -rf ./data` | Stops, then deletes the database — the next `up` starts from a fresh empty DB.                                                      |
| `docker compose run --rm seed`         | Seeds demo data into the existing DB. The `--rm` only cleans up the one-off container afterwards — it does **not** remove any data. |

`docker compose down` alone keeps your data; only `rm -rf ./data` actually wipes it.

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

## Reading the service logs

The app logs to **stdout** via `nestjs-pino` (`pino` under the hood).

In production (`NODE_ENV=production`, which the `app` service uses), logs
are emitted as single-line JSON — one object per request/event, ready for
any log shipper. In dev mode logs are pretty-printed for readability.

### Stream logs from the running container

```sh
# Tail the app service logs
docker compose logs -f app

# All services, last 200 lines, no follow
docker compose logs --tail=200 --no-color

# Logs from a specific time window
docker compose logs --since=10m app
```

### Filter for specific events

Each log line is a JSON object on production. Useful fields:

| Field                    | Meaning                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `req.method` / `req.url` | Incoming HTTP request                                               |
| `res.statusCode`         | Response status                                                     |
| `req.id`                 | Per-request correlation id (present in every line for that request) |
| `level`                  | 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal            |
| `time`                   | Epoch milliseconds when the line was emitted                        |

Pipe through `jq` to narrow down:

```sh
# Only 4xx and 5xx responses
docker compose logs --no-color app | jq -c 'select(.res.statusCode >= 400)'

# Only errors
docker compose logs --no-color app | jq -c 'select(.level >= 50)'

# All log lines for a single request
docker compose logs --no-color app | jq -c 'select(.req.id == "<id>")'

# Counts of status codes
docker compose logs --no-color app | jq -r '.res.statusCode' | sort | uniq -c
```

### Background service logs (the one-shot `seed`)

The `seed` service exits after it finishes, so its logs are best read
with `--no-log-prefix` and a follow-off tail:

```sh
docker compose run --rm seed               # prints to terminal
docker compose logs seed                   # if it ran in the background
```

### Local dev (npm run dev)

When you run `npm run dev` (without Docker), the same `pino` logger is in
**pretty mode** — colored, single-line, timestamped, printed to the
terminal where you started the process.
