# Jira Client Context

Agent guide for the code that talks to Jira Cloud (connect, create tickets, list).

## Current state — implemented and tested

- `jira.client.ts` — fetch wrapper with **10s connect / 30s response timeouts**
  (`JIRA_CONNECT_TIMEOUT_MS` / `JIRA_RESPONSE_TIMEOUT_MS`), **2x retry on 5xx /
  timeout for GET requests only** (never 4xx, never on POST — no blind
  create-retry; `JiraRetryableUpstreamError` marks retryable failures). Error
  mapping: 401 `UnauthorizedError`, 403 `PermissionDeniedError`, 404
  `NotFoundError`, 429 `RateLimitedError` (honors `Retry-After`), 5xx
  `UpstreamError`. Safe `errorDetail()` extracts Jira `errorMessages`/`errors`/
  `message`. Methods: `getMyself`, `serverInfo` (returns `cloudId`),
  `listProjects`, `createIssue` (ADF body), `searchByJql`
  (`/rest/api/3/search/jql?jql=…` — NOT the removed `/rest/api/3/search`).
- `jira.repository.ts` — tenant-scoped, sealed persistence; `findByUser`,
  `deleteByUser`, `upsertApiTokenConnection` (stores `cloud_id`),
  `findRecentTickets`, `lastReconciledAt`, `upsertRecentTicket`,
  `syncRecentTickets` (upsert-10 + prune, in a transaction).
- `jira.service.ts` + `jira.controller.ts` (prefix: `app/jira`,
  session-guarded). Endpoints:
  - `POST /connect` (+ `DELETE /connect`) — validate via `getMyself`, read
    `cloud_id` from `serverInfo` (best-effort, non-fatal), store sealed
    AES-256-GCM token. `@Throttle` = `jiraConnect`. Connect/disconnect evict
    the user's projects cache.
  - `GET /status` — `{ connected, siteUrl, email, mode }`.
  - `GET /projects` — from `/rest/api/3/project/search`, **60s per-user
    in-memory cache** (`JIRA_PROJECTS_CACHE_TTL_MS`), keyed by tenant+user.
    `@Throttle` = `jiraProjects`.
  - `POST /tickets` (201) — creates a **Task** with ADF description and label
    `identityhub-finding`; pre-checks project membership via the live projects
    list → 404 `PROJECT_NOT_FOUND`. Returns `{ key, url }` where
    `url = {site}/browse/{key}`. **Writes the new ticket to `tickets_cache`**
    (write-through) so it shows in recent immediately.
  - `GET /tickets/recent?project_key=…&refresh=` — **cache-first** via
    `tickets_cache`. Behavior:
    - `refresh=true` → force live JQL call, upsert + prune, return fresh.
    - cache miss → live JQL call (blocking), upsert, return.
    - cache hit within `JIRA_CACHE_TTL_MS` (default **60s**) → serve cache.
    - cache stale → serve last-known-good **and** kick off an async background
      JQL refresh; async failures are logged as warnings and never surface.
    - JQL `project = "<KEY>" AND labels = "identityhub-finding" ORDER BY
created DESC`, maxResults 10 → `[{ key, title, url, createdAt }]`.
  - **All repository calls filter `tenant_id`** — cross-tenant cache/projects
    isolation is structural, not incidental (tested).
- `jira.adf.ts` — ADF document builder (doc/paragraph/text, newline-split).
- `jira.module.ts` (imports AuthModule; exports `JiraService`, `JiraRepository`).
  Registered in `app.module.ts`.
- UI: `client/src/pages/JiraPage.tsx` (connect form, project select, create
  form, recent list with **Load recent** + **Refresh** buttons, disconnect) at
  route `/jira`, linked from `HomePage.tsx`.
  `client/src/api/client.ts` `apiRequest` supports `DELETE` and the jira API
  client passes the `refresh` query flag.
- Tests: `test/jira.spec.ts` (13 tests, fetch-stubbed against Jira): connect →
  cloud_id persisted → projects (+ per-user cache) → create (writes cache) →
  cache hit (zero Jira calls) → forced refresh → sub-tenant isolation → 503
  retry → no-retry on create → disconnect.
- `jira:smoke` script + `local/jira-credentials.example.json` (see below).
- Jira **Cloud only** — no self-hosted Server support.

## Pending (explicitly deferred)

- Applying `ticketCreateUi`/`ticketCreateApi` throttles to the create/recent
  routes (config exists in `rate-limits.ts`; routes currently use the global
  default). Tracked as part of #12.
- REST `POST /api/v1/tickets` + `GET /api/v1/tickets/recent` behind `ApiKeyGuard`
  — **#12** (depends on #7 API-key infra).
- `jira.oauth.ts` — OAuth 3LO **skipped** by product decision; do not create.

## Connection model (locked — CONTEXT.md §16.5)

- **Exactly one Jira connection per user** (`jira_connections.user_id UNIQUE`).
  One connection = one Jira workspace/site; the site contains many projects, so
  the ticket flow is "user → their connection → pick project → create". No
  connection picker, no shared/tenant connections in this scope.
- Slices use the same rules as the connect UI: seal tokens with AES-256-GCM,
  store site + email, per-user uniqueness enforced in the repository.
- Automation (REST/API keys) rides the API-key owner's connection; an
  autonomous process is a dedicated bot/svc user with its own link + key.

## Pending (explicitly deferred)

- Applying `ticketCreateUi`/`ticketCreateApi` throttles to the create/recent
  routes (config exists in `rate-limits.ts`; routes currently use the global
  default). Tracked as part of #12.
- REST `POST /api/v1/tickets` + `GET /api/v1/tickets/recent` behind
  `ApiKeyGuard` — **#12** (depends on #7 API-key infra).
- `jira.oauth.ts` — OAuth 3LO **skipped** by product decision; do not create.

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
