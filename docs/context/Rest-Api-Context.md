# REST API Context

Agent guide for the machine-facing REST API (scanner integration via API keys).

## Current state

- `src/main.ts`: global prefix `api` (`healthz`/`readyz` excluded), helmet CSP,
  cookie-parser, CORS (dev → `http://localhost:5173`, prod → `CORS_ORIGIN`).
- `src/app/errors/`: `AppError` classes + `AppExceptionFilter` → `{ error, fields?, detail? }`.
- `src/app/validation.ts`: Zod `signupSchema`, `loginSchema`, `ticketCreateSchema`,
  `projectKeySchema`, `apiKeyCreateSchema`.
- Live session routes (UI-facing, all under `/api/app/…`, session-auth + CSRF):
  - `GET /api/healthz`, `GET /api/readyz` — health probes
  - `POST /api/app/signup` — open signup (gated by `ALLOW_OPEN_SIGNUP`)
  - `POST /api/app/auth/login`, `POST /api/app/auth/logout`, `GET /api/app/auth/me` — session auth
  - `GET /api/app/csrf-token` — CSRF double-submit token endpoint
- Live API-key management routes (`src/modules/api-keys/api-keys.controller.ts`,
  session-auth + CSRF):
  - `POST /api/app/api-keys` — mint a key: body `{ name, allowed_project_keys? }`
    (`allowed_project_keys` is `string[]` for scoping or omitted/null for any).
    Returns `{ key, rawKey }` — raw value is returned **once**, only its SHA-256
    hash is stored; body per-key rate limit `apiKeyCreate`.
  - `GET /api/app/api-keys` — list key metadata (id, name, allowed projects,
    created/last-used/revoked timestamps; never hash or raw).
  - `DELETE /api/app/api-keys/:id` — revoke (sets `revoked_at`; tenant-scoped,
    404 for cross-tenant ids). Revoked keys can no longer authenticate, so their
    Jira connection row is inert but left in place.
  - `POST /api/app/api-keys/:id/jira/connect` — tie the key to its own Jira
    service-account connection (`site_url`, `email`, `api_token`) — see
    `Jira-Client-Context.md` for the per-principal connection model.
  - `DELETE /api/app/api-keys/:id/jira/connect` — disconnect.
  - `GET /api/app/api-keys/:id/jira/status` — connection state for the key.
- Live REST surface (machine-facing, **Bearer** auth, no cookies/CSRF):
  - `POST /api/v1/tickets` — create a Jira ticket (see contract below).
  - `GET /api/v1/tickets/recent?project_key=` — cached recent tickets for the
    key's connection (cache-first, refetch when stale; same read model as the UI).
- Auth guards:
  - `ApiKeyGuard` resolves the Bearer token → hashed → key row → `request.apiKey`
    - tenant. Unknown/revoked → 401 `API_KEY_INVALID` / `API_KEY_REVOKED`.
  - `ApiKeyThrottleGuard` (custom `ThrottlerGuard`) rate-limits **per key**
    (`api-key:{id}` tracker); endpooints also run the global per-IP `ThrottlerGuard`.
  - Global `ThrottlerGuard` (100 req/min default); login 5/min, signup 10/min per-IP.
  - `CsrfGuard` enforces on all state-changing session routes and **skips**
    requests carrying `Authorization: Bearer …` (cookie CSRF does not protect
    header auth).
- Rate-limit values live in `src/config/rate-limits.ts` (env-overridable);
  per-key: `ticketCreateApi` 60/min (create) and `apiKeyUse` 60/min (recent).

## Slice status

- Slice 7 (API keys) + Slice 7b (REST endpoints) are implemented and tested
  (commit `17e95b2`); issue #7 closed, #12 superseded/deleted. Not yet applied:
  `ticketCreateUi` throttle on the UI create/recent routes.

## Swagger / OpenAPI

- _de facto_ served from the API server (not the Vite dev port — Vite only
  proxies `/api`) at `GET /swagger` (UI), `GET /swagger-json` (OpenAPI JSON),
  `GET /swagger-yaml`. Set up by `setupSwagger()` in `src/swagger.ts`.
- Scoped to `ApiKeysModule` (tickets.v1 + api-keys management); operation
  paths already carry the global `/api` prefix (no extra server entry).
- **Ordering caveat:** call `setupSwagger(app)` BEFORE `app.init()`/`listen()`.
  Nest registers a catch-all 404 handler during `init()`, so a late setup gets
  swallowed and `/swagger` 404s — the test harness asserts this.
- `zodSchemaObject()` (`src/swagger.ts`) converts `validation.ts` Zod schemas
  to OpenAPI schemas so decorations reuse the single source of truth.
- Live API-key smoke test: `npm run api:smoke` reads git-ignored
  `local/rest-api-credentials.json` (copy the `.example.json`), hits the
  running server (`baseUrl`) with the given `rawApiKey`, and verifies
  healthz / swagger paths (no `/api/api` double prefix) / invalid-key 401 /
  create ticket → recent list contains it.

## Create-ticket contract (actual)

- Body (Zod-validated): `project_key` `^[A-Z][A-Z0-9]{1,9}$`, `title` 1..255,
  `description` 1..30 000.
- `201` → `{ "key", "url" }` (e.g. `{ "key": "OASIS-42", "url": "…/OASIS-42" }`).
- `400` → `{ "error": "validation", "fields": {...} }`
- `401` → missing/invalid/revoked key · `403` → key not scoped for the project
  (`API_KEY_PROJECT_FORBIDDEN`) or key has no Jira connection · `404` → Jira
  rejected project · `429` → rate limited · `502` → upstream Jira failure with
  safely-worded detail.

## Recent-tickets contract (actual)

- `GET /api/v1/tickets/recent?project_key=` (project required).
- `200` → bare array `[{ "key", "title", "url", "createdAt" }]` (newest first,
  up to 10). `?refresh=true` forces a live Jira round-trip.

## Conventions

- Every route validates body/query/params through Zod before touching a service.
- Errors are `AppError`/`HttpException` via the global filter; unknown errors
  surface as `internal_server_error` without internals.
- `tenantId` derived from the authenticated principal (session user or API key
  owner), never from the body. Repo methods take `tenantId` first and filter
  inside the query.
- Never log or return secret material (pino redaction on routes accepting tokens;
  raw API keys are not logged).
- Project-scope check happens in the REST controller (`api-keys/tickets.controller.ts`)
  against `key.allowedProjectKeys`, not in the Jira service (the service stays generic).
