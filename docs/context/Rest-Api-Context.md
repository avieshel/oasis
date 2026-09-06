# REST API Context

Agent guide for the machine-facing REST API (scanner integration via API keys).

## Current state

- `src/main.ts`: global prefix `api` (`healthz`/`readyz` excluded), helmet CSP,
  cookie-parser, CORS (dev → `http://localhost:5173`, prod → `CORS_ORIGIN`).
- `src/app/errors.ts`: `AppError` + `AppExceptionFilter` → `{ error, fields?, detail? }`.
- `src/app/validation.ts`: Zod `signupSchema`, `loginSchema`, `ticketCreateSchema`, `projectKeySchema`.
- Live routes:
  - `GET /api/healthz`, `GET /api/readyz` — health probes
  - `POST /api/app/signup` — open signup (gated by `ALLOW_OPEN_SIGNUP`)
  - `POST /api/app/auth/login`, `POST /api/app/auth/logout`, `GET /api/app/auth/me` — session auth
  - `GET /api/app/csrf-token` — CSRF double-submit token endpoint
- Global `ThrottlerGuard` (100 req/min default); login 5/min, signup 10/min per-IP.
- Global `CsrfGuard` enforces on all state-changing routes (POST/PUT/PATCH/DELETE).

## Planned surface

- `POST /api/v1/tickets` — create a Jira ticket, auth `Authorization: Bearer <api_key>`.
- `POST /app/api-keys` — mint an API key; raw value returned once, only its
  SHA-256 hash is stored (`src/infra/crypto.ts`).
- `DELETE /app/api-keys/:id` — revoke.

## Create-ticket contract (CONTEXT.md §9)

- Body (Zod-validated): `project_key` `^[A-Z][A-Z0-9]{1,9}$`, `title` 1..255,
  `description` 1..30 000.
- `201` → `{ "id", "key", "url", "label": "identityhub-finding" }`
- `400` → `{ "error": "validation", "fields": {...} }`
- `401` → missing/invalid key · `403` → key valid but no Jira connection ·
  `404` → Jira rejected project · `429` → rate limited · `502` → upstream Jira
  failure with safely-worded detail.

## Conventions

- Every route validates body/query/params through Zod before touching a service.
- Errors are `AppError`/`HttpException` via the global filter; unknown errors
  surface as `internal_server_error` without internals.
- `tenantId` derived from the authenticated principal (API key owner), never from
  the body. Repo methods take `tenantId` first and filter inside the query.
- Never log or return secret material (pino redaction on routes accepting tokens).
