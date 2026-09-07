# IdentityHub — NHI Jira Integration

NHI (Non-Human Identity) management that reports findings to a Jira workspace
from a UI and a REST API. NestJS + Prisma (SQLite) + Vite/React SPA.

## Quick start (Docker)

```sh
docker compose up -d --build         # build + start on http://localhost:3000
docker compose run --rm seed          # optional: 2 demo tenants + users + fake Jira tickets
docker compose down -v                # wipe the database and start fresh
```

Open:

| Surface        | URL                           |
| -------------- | ----------------------------- |
| UI             | http://localhost:3000/        |
| Swagger (REST) | http://localhost:3000/swagger |
| Health         | http://localhost:3000/healthz |

The image ships with no data. Demo users (created by `seed`, password
`demo1234` for all): `acme[EMAIL]`, `globex[EMAIL]`. `ALLOW_OPEN_SIGNUP`
and `ALLOW_ADMIN` are enabled, so you can also create users from the UI
or `/admin`.
