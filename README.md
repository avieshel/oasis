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

## Inspecting the database

The database is a SQLite file at `/data/app.db` inside the container,
backed by a named volume (`oasis_app-data` by default). The app keeps a
write lock while running, so for read-only inspection grab a copy first
or use a tool that supports WAL/online backup.

```sh
# One-off shell into the running app container
docker compose exec app sh
# sqlite3 isn't installed in the image, so query through node + Prisma:
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.users.findMany({select:{email:true,name:true,tenant_id:true}}).then(r=>{console.log(JSON.stringify(r,null,2));p.\$disconnect()})"
```

For a graphical viewer, copy the DB out and open it locally:

```sh
docker compose cp app:/data/app.db ./app.db
```

Then open `app.db` in [DB Browser for SQLite](https://sqlitebrowser.org/),
TablePlus, or the VS Code SQLite extension. To go back to a fresh state:

```sh
docker compose down -v
```
