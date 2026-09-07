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

The database is a SQLite file bind-mounted to `./data/app.db` on the host,
so any local SQLite client can open it directly while the app is running
(the app enables WAL mode so reads don't block writes).

### DataGrip (or any JDBC client)

1. **File → New → Data Source → SQLite.**
2. Set **File** to `./data/app.db` (relative to the repo root) or its
   absolute path.
3. The JDBC URL is shown as:
   ```
   jdbc:sqlite:<absolute-path-to-repo>/data/app.db
   ```
4. Test connection → OK. You can browse every table and run ad-hoc
   `SELECT`s; writes from the app will appear live.

### Other tools

- **DB Browser for SQLite** / **TablePlus** / **VS Code SQLite
  extension**: open `./data/app.db`.
- **Command line** (the image has no `sqlite3` binary, but you can shell
  into the app and query via Prisma):
  ```sh
  docker compose exec app node -e \
    "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.users.findMany({select:{email:true,name:true}}).then(r=>{console.log(JSON.stringify(r,null,2));p.\$disconnect()})"
  ```

To reset:

```sh
docker compose down   # keep the ./data directory
rm -rf ./data         # wipe and start fresh on next `docker compose up`
```
