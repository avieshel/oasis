# IdentityHub — NHI Jira Integration

IdentityHub is an NHI (Non-Human Identity) management platform that reports
findings directly to a Jira workspace — from a UI and programmatically via a
REST API.

This is **slice 1** of the implementation: a runnable repo skeleton (NestJS
backend + Prisma + Vite/React SPA). See `CONTEXT.md` for the full design
(scope, tenancy model, data model, security checklist).

## Prerequisites

- Node.js 22 LTS or newer (workspace currently targets ES2022).
- npm (workspaces used at the root).

## Setup

```sh
npm install
cp .env.example .env
npm run db:generate   # generate the Prisma client
npm run db:migrate    # create dev.db + migrations (SQLite default)
```

`APP_SECRET` must be at least 32 characters. Never commit `.env`.

## Development

```sh
npm run dev   # NestJS watch (:3000) + Vite dev server (:5173) concurrently
```

The Vite dev server proxies `/api` to the NestJS backend, so the browser
talks to a single origin (`:5173`).

## Build / test / lint

```sh
npm run build       # NestJS build (dist/) + Vite build (client/dist)
npm run typecheck   # strict TS checks for backend + client
npm run lint        # ESLint + Prettier check
npm test            # Vitest
npm run format      # Prettier write
npm run start       # node dist/main (after build)
```

Health endpoints: `GET /healthz` (liveness) and `GET /readyz` (DB ping) —
these bypass the `/api` prefix. Everything else is under `/api/...`.

## SQLite vs Postgres

Local dev uses SQLite by default (zero-config, `file:./dev.db`). For a
Postgres deployment, switch the Prisma datasource first, then run migrations:

```sh
npm run db:switch-postgres   # copies schema.postgres.prisma -> schema.prisma
# set DATABASE_URL to your Postgres DSN in .env, then:
npm run db:generate
npm run db:migrate
```

To return to SQLite:

```sh
npm run db:switch-sqlite
```

Note: the provider is baked into the generated client, so switch _before_
generating/migrating.
