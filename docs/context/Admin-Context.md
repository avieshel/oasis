# Admin Context

Agent guide for the `/admin` management surface (tenant & user CRUD).

## Purpose

A reviewer-friendly manager for the system: an authenticated page + REST API to
create, read, update and delete **tenants** and **users**. It is a usability /
demo affordance, not RBAC — see the corner-case note below.

## Gate

- Controlled by env `ALLOW_ADMIN` (default `true`, documented in `.env.example`,
  validated in `src/config.ts`).
- Guarded by `AdminGuard` (`src/modules/admin/admin.guard.ts`):
  - If `ALLOW_ADMIN=false` → **403** `FORBIDDEN` on all admin routes.
  - Reads the flag from `process.env` directly (not `ConfigService`) because
    Nest's `ConfigModule` caches the validated value at bootstrap, which made
    tests that toggle the flag across app boots flaky.
  - Also requires a resolved session (**401** `UNAUTHORIZED` without one), so
    admin is logged-in + flag-on.
- Both class-level guards run: `SessionGuard` then `AdminGuard`. The global
  `ThrottlerGuard` and `CsrfGuard` still apply (mutations need the CSRF header).
- Every mutation is written to `audit_log` with the **actor's** `tenant_id` /
  `user_id` (the admin operator's own session context) and a new `admin_*`
  action. Note `audit_log.user_id` is the actor id, so target tenant/user is
  recorded in the `target` field only.

## Corner-case note (tenant-first convention)

The repo methods here do **not** take `tenantId` and filter by it — admin ops are
deliberately global (delete any tenant). This is an intentional, documented
exception to the tenant-first rule required by every other repository: it is
only reachable behind a logged-in session **and** the `ALLOW_ADMIN` flag.

## REST API (all `/api/app/admin/…`, JSON, session + CSRF)

- `GET /status` → `{ enabled, tenantCount, userCount }` (drives the Home nav link
  via `ALLOW_ADMIN` on the server and `enabled` in the client).
- `GET /tenants` → `{ tenants: [{ id, slug, name, createdAt, userCount }] }`
- `POST /tenants` — body `{ slug, name }` (slug `^[a-z0-9]+(-[a-z0-9]+)*$` ≤50,
  name ≤80) → **201** `{ tenant }`; duplicate slug → **409** `SLUG_TAKEN`.
- `PATCH /tenants/:id` — body `{ slug?, name? }` → `{ tenant }`; 404 unknown.
- `DELETE /tenants/:id` — cascades: the tenant's sessions, api_keys,
  jira_connections, tickets_cache, audit_log, then users, then the tenant.
- `GET /users?tenant_id=` — all users (no filter) or scoped to one tenant; each
  row `{ id, tenantId, tenantSlug, email, name, createdAt }`.
- `POST /users` — body `{ tenant_id, email, name?, password }` → **201**
  `{ user }`; missing tenant → 404, duplicate email → 400 `EMAIL_TAKEN`.
- `PATCH /users/:id` — body `{ email?, name?, password? }`. Changing `password`
  **kills the user's sessions** (`kickUserSessions`) before hashing + updating.
- `DELETE /users/:id` — cascades: sessions, jira_connections, tickets_cache,
  then the user (audit history kept).

## Data model

Schema + migration `20260907070249_admin_management` add one column:
`users.name TEXT?` (optional). No new models, no new relations — cascade deletes
are done explicitly in `AdminRepository` transactions (`src/modules/admin/admin.repository.ts`),
since the schema has no `@relation` entries to cascade on.

## Validation / errors

- Schemas in `src/app/validation.ts` (`tenantSlugSchema`, `tenantCreateSchema`,
  `tenantUpdateSchema`, `userCreateSchema`, `userUpdateSchema`,
  `adminUsersQuerySchema`, `adminParamSchema`).
- `tenantSlugSchema` uses a hand-written linear validator (no regex) to satisfy
  the `security/detect-unsafe-regex` lint rule.
- New error: `SLUG_TAKEN` → **409**; new class `SlugTakenError`. Reuses
  `EmailTakenError` (400).

## UI

- Route `/admin` → `AdminPage` (`client/src/pages/AdminPage.tsx`), linked from
  `HomePage` only when `GET /admin/status` reports `enabled`.
- Two tables (tenants / users) with inline create/edit/delete:
  - Tenants: slug + name columns, per-row edit (inline inputs) and delete
    (confirm dialog), create form on top.
  - Users: email, name, tenant, created; filtered by tenant via a `<select>`;
    create form (tenant, email, name, password); inline edit incl. optional
    password reset; delete w/ confirm.
- `client/src/api/admin.ts` typed wrappers; `apiRequest` extended with `PATCH`.
- If admin is disabled the page shows an explanatory message instead of the tables.

## Tests

`test/admin.spec.ts` (16 specs): session-required, status counts, tenant
create/list/filter, duplicate slug 409, invalid slug 400, tenant update + 404,
user create/list/filter by tenant, duplicate email 400, user create for missing
tenant 404, managed user can log in, password reset kills sessions + new password
works, user update, user delete cascade, tenant delete cascade, disabled-mode 403. Full suite: **62 tests**.
