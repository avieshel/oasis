# Jira Client Context

Agent guide for the code that talks to Jira Cloud (connect, create tickets, list).

## Current state

- Nothing coded yet. Building blocks: Prisma models `jira_connections` and
  `tickets_cache`; `sealSecret`/`openSecret` (AES-256-GCM keyed by `APP_SECRET`)
  for at-rest tokens.
- Jira **Cloud only** — no self-hosted Server support.

## Planned surface (`src/modules/jira/`)

- `jira.module.ts`
- `jira.routes.ts` — `/app/jira/connect`, OAuth callback, disconnect
- `jira.service.ts` — connect/disconnect, list projects, create ticket, list
  recent app-created tickets
- `jira.oauth.ts` — OAuth 3LO (three-legged) + single-flight token refresh
- `jira.adf.ts` — Atlassian Document Format (ADF) body builder
- `jira.client.ts` — `fetch` wrapper: timeouts, retries, error mapping

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
