# Jira Client Context

Agent guide for the code that talks to Jira Cloud (connect, create tickets, list).

## Current state — implemented and tested

- `jira.client.ts` — fetch wrapper: 10s timeout, 401/403/404/429 error mapping;
  `getMyself`, `listProjects`, `createIssue` (ADF body), `searchByJql`.
- `jira.repository.ts` — tenant-scoped, sealed persistence; `findByUser`,
  `deleteByUser`, `upsertApiTokenConnection`.
- `jira.service.ts` + `jira.controller.ts` (prefix: `app/jira`, session-guarded).
  6 endpoints:
  - `POST /connect` (+ `DELETE /connect`) — validate via `getMyself`, store
    sealed AES-256-GCM token. `@Throttle` = `jiraConnect`.
  - `GET /status` — `{ connected, siteUrl, email, mode }`.
  - `GET /projects` — raw list from `/rest/api/3/project/search`.
    `@Throttle` = `jiraProjects`. **No `@Throttle`-set on create/recent → they
    fall to the global default, even though `ticketCreateUi`/`ticketCreateApi`
    limits exist in `rate-limits.ts` (see pending note below).**
  - `POST /tickets` (201) — creates a **Task** with ADF description and label
    `identityhub-finding`; pre-checks project membership via
    `assertProjectExists` → 404 `PROJECT_NOT_FOUND`. Returns `{ key, url }`
    where `url = {site}/browse/{key}`.
  - `GET /tickets/recent?project_key=…` — **live JQL**
    `project = "<KEY>" AND labels = "identityhub-finding" ORDER BY created
DESC`, maxResults 10. Returns `[{ key, title, url, createdAt }]`.
    **Does NOT read/write `tickets_cache`** (minimal-pass decision — see
    pending note below).
- `jira.adf.ts` — ADF document builder (doc/paragraph/text, newline-split).
- `jira.module.ts` (imports AuthModule; exports `JiraService`, `JiraRepository`).
  Registered in `app.module.ts`.
- UI: `client/src/pages/JiraPage.tsx` (connect form, project select, create
  form, recent list, disconnect) at route `/jira`, linked from `HomePage.tsx`.
  `client/src/api/client.ts` `apiRequest` now supports `DELETE`.
- Tests: `test/jira.spec.ts` (7 tests, fetch-stubbed against Jira).
- `jira:smoke` script + `local/jira-credentials.example.json` (see below).
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

## Pending (explicitly deferred to keep the minimal slice green)

- `tickets_cache` read model + async JQL reconcile (recent list currently hits
  live Jira; cache schema exists in Prisma, unused).
- Applying `ticketCreateUi`/`ticketCreateApi` throttles to the create/recent
  routes (config exists in `rate-limits.ts`, routes currently use the global
  default).
- `jira.oauth.ts` — OAuth 3LO, **deferred** (not in demo scope).

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
  DB round-trip flag. Never the email or token.

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
