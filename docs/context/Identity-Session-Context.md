# Identity & Session Context

Agent guide for login/logout and session management — the graded core.

## Current state

- No auth code exists yet. Only primitives are in `src/infra/crypto.ts`:
  - `hashPassword` / `verifyPassword` — bcryptjs, cost 12
  - `randomBytes`, `sha256Hex`, `safeEqual` (timing-safe string compare)
  - `sealSecret` / `openSecret` — AES-256-GCM keyed by `APP_SECRET`
- Env (`src/config.ts`, Zod-validated): `APP_SECRET` (>= 32 chars), `ALLOW_OPEN_SIGNUP`,
  `COOKIE_SECURE`.
- Error response shape via `AppError` + `AppExceptionFilter` (`src/app/errors.ts`).

## Planned surface

- `src/modules/users/` — user repo + service + signup route (open signup gated by
  `ALLOW_OPEN_SIGNUP`).
- `src/modules/auth/` — login/logout/me, session guard, decorators.
- `src/infra/session.ts` — cookie session manager + DB-backed store.
- `src/infra/csrf.ts` — double-submit CSRF.
- `src/infra/audit.ts` — audit log helper (via pino, never `console`).

## Invariants (CONTEXT.md §7.1)

1. Session = opaque 32-byte random id mapped to a DB row; cookie
   `HttpOnly + Secure + SameSite=Lax`. Never a signed/JWT cookie; revocable on logout.
2. Rotate on login (new id, delete old session) — kills fixation. Sliding idle
   timeout (30 m) + absolute cap (12 h); activity refreshes idle only.
3. Logout = delete DB row + clear cookie + audit entry. A replayed request after
   logout must redirect to login, never 500 or resurrected auth.
4. CSRF = double-submit cookie, independent of the session cookie.
5. `tenantId` comes from the authenticated principal (session or API key owner),
   never from request body/query. Repos take `tenantId` first and filter in SQL.
6. No user enumeration: one generic "Invalid credentials", same timing profile
   either way (bcryptjs compare runs regardless). Rate-limit login 5/min/IP.
7. Email globally unique in this demo.
8. Cookie `Secure` in prod; dev must set `COOKIE_SECURE=false` explicitly.
9. Session token stored as SHA-256 hash in DB, never plaintext.

## Conventions

- Routes parse input via Zod (`src/app/validation.ts`), never hand-rolled checks.
- No `console.*` — use pino (nestjs-pino, wired in `src/app.module.ts`).
- Global prefix `api` (`src/main.ts`); `healthz`/`readyz` excluded.
- Global rate limit: `ThrottlerGuard` (100 req/min) in `app.module.ts`.
