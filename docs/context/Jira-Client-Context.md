# Jira Client Context

Agent guide for the code that talks to Jira Cloud (connect, create tickets, list).

## Current state

- Coded: `jira.client.ts` (fetch wrapper: timeout, 401/403/404/429 mapping),
  `jira.repository.ts` (tenant-scoped, sealed persistence), and the
  `jira:smoke` test-connection script (`src/scripts/jira-connect-smoke.ts`).
  Prisma models `jira_connections` and `tickets_cache` exist;
  `sealSecret`/`openSecret` (AES-256-GCM keyed by `APP_SECRET`) handles
  at-rest tokens.
- Jira **Cloud only** — no self-hosted Server support.

## Connection model (locked — CONTEXT.md §16.5)

- **Exactly one Jira connection per user** (`jira_connections.user_id UNIQUE`).
  One connection = one Jira workspace/site; the site contains many projects, so
  the ticket flow is "user → their connection → pick project → create". No
  connection picker, no shared/tenant connections in this scope.
- Slices use the same rules as the connect UI: seal tokens with AES-256-GCM,
  store site + email, per-user uniqueness enforced in the repository.
- Automation (REST/API keys) rides the API-key owner's connection; an
  autonomous process is a dedicated bot/svc user with its own link + key.

## Planned surface (`src/modules/jira/`)

- `jira.module.ts`
- `jira.routes.ts` — `/app/jira/connect`, disconnect, status, list-projects
- `jira.service.ts` — connect/disconnect, list projects, create ticket, list
  recent app-created tickets
- `jira.adf.ts` — Atlassian Document Format (ADF) body builder
- `jira.client.ts` — `fetch` wrapper: timeouts, retries, error mapping (done)
- `jira.oauth.ts` — **deferred** (OAuth 3LO, not in demo scope)

## Test connection (secrets never reach the LLM)

> **Scope note (important):** The `local/jira-credentials.json` file powers the
> **`jira:smoke` script ONLY**. The running application (`npm start`) never reads
> it — live credentials come from HTTP requests (`POST /api/app/jira/connect`),
> not from this file. It has **zero effect** on the served app, development
> server, or any deployed system. It is a developer-only fixture for the standalone
> smoke script; deleting it changes nothing about the application.

- Fill `local/jira-credentials.json` (copy from `jira-credentials.example.json`).
  It is gitignored; never commit or paste it. The file holds the Jira **site
  URL, email, API token**, and which demo user to attach the connection to.
- `npm run jira:smoke` reads that file, validates the token against
  `GET /rest/api/3/myself`, lists projects, then **stores the connection
  sealed (AES-256-GCM) in `jira_connections`** via `JiraRepository` — the same
  path the connect UI will use.
- Output is safe-only: site host, account id/name, project keys, and a
  DB round-trip flag. Never the email or token. The scaffolded `JiraModule`
  routes are next.

## Rules

- Jira tokens (API token or OAuth access/refresh) are sealed with AES-256-GCM;
  decrypt only in memory for the in-flight call. Never log plaintext tokens.
- Jira is the source of truth. `tickets_cache` is a derived read model of
  app-created tickets only — never reconciled from webhooks (out of scope).
- Create-ticket error mapping: `403 jira_not_connected` (no link), `404
project_not_found`, `429 rate_limited`, `502 upstream_jira` (safely-worded detail).
- Out of scope: ticket editing/transitions/comments, Jira webhooks, project
  creation, custom fields beyond the four supported.
- Error mapping lives in the client wrapper; route handlers stay thin.
