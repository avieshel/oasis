# Identity & Session Context

Agent guide for login/logout and session management — the graded core.

## Current state

Implemented in slice 3 (commit `1e6b61d`).

- `src/infra/crypto.ts`:
  - `hashPassword` / `verifyPassword` — bcryptjs, cost 12
  - `randomBytes`, `sha256Hex`, `safeEqual` (timing-safe string compare)
  - `sealSecret` / `openSecret` — AES-256-GCM keyed by `APP_SECRET`
- `src/infra/session.ts` — `SessionManager`:
  - `create(userId, { currentToken, ip, userAgent })` → returns new token (base64url 32B)
  - `resolve(token)` → `{ id, user }` or null (deletes expired rows)
  - `peek(token)` → lightweight lookup (for audit on logout)
  - `destroy(token)` → deletes the row
- `src/infra/csrf.ts` — `generateCsrfToken()`, `csrfTokensMatch()` (timing-safe), `csrfOriginAllowed()`
- `src/infra/audit.ts` — `AuditService.write(event)` writes `audit_log` rows via pino
- `src/config/session.ts` — cookie names (`sid`, `csrf_token`), header (`x-csrf-token`), TTL defaults (idle 30m, absolute 12h)
- `src/modules/auth/`:
  - `auth.decorator.ts` — `@CurrentUser()`, `@CurrentTenantId()`
  - `request.types.ts` — `RequestWithSession` (user + tenantId + sessionId)
  - `session.guard.ts` — `SessionGuard` reads `sid` cookie, resolves session, attaches user/tenantId/sessionId
  - `csrf.guard.ts` — `CsrfGuard` (global, skips GET/HEAD/OPTIONS, timing-safe match)
  - `auth.service.ts` — `login()` (rotation, dummy bcrypt), `logout()` (peek + destroy + audit)
  - `auth.controller.ts` — `GET /api/app/csrf-token`, `POST /api/app/auth/login`, `POST /api/app/auth/logout`, `GET /api/app/auth/me`
  - `auth.module.ts` — providers: AuthService, SessionManager, AuditService, SessionGuard, PrismaService

## Routes

- `GET /api/app/csrf-token` — returns `{ token }`, sets `csrf_token` cookie (non-HttpOnly)
- `POST /api/app/auth/login` — body `{ email, password }`, sets `sid` cookie (HttpOnly), returns `{ user }`
- `POST /api/app/auth/logout` — clears `sid` cookie, returns `{ status: "logged_out" }`
- `GET /api/app/auth/me` — session-guard-protected, returns `{ user }`
- `POST /api/app/signup` — body `{ email, password }`, returns `{ user }`, creates tenant+user

## Invariants (CONTEXT.md §7.1)

1. Session = opaque 32-byte random id mapped to a DB row; cookie
   `HttpOnly + SameSite=Lax`. `Secure` in prod (set `COOKIE_SECURE=true`);
   never a signed/JWT cookie; revocable on logout.
2. Rotate on login (new id, delete all previous sessions for the user) — kills
   fixation. Sliding idle timeout (30 m) + absolute cap (12 h); activity
   refreshes idle only.
3. Logout = delete DB row + clear cookie + audit entry. A replayed request after
   logout must redirect to login, never 500 or resurrected auth.
4. CSRF = double-submit cookie (`csrf_token` non-HttpOnly + `x-csrf-token`
   header), session-independent (survives rotation).
5. `tenantId` comes from the authenticated principal (session or API key owner),
   never from request body/query. Repos take `tenantId` first and filter in SQL.
6. No user enumeration: one generic "Invalid credentials", same timing profile
   either way (bcryptjs compare runs regardless). Rate-limit login 5/min/IP.
7. Email globally unique in this demo.
8. Session token stored as SHA-256 hash in DB, never plaintext.

## Conventions

- Routes parse input via Zod (`src/app/validation.ts`), never hand-rolled checks.
- No `console.*` — use pino (nestjs-pino, wired in `src/app.module.ts`).
- Global prefix `api` (`src/main.ts`); `healthz`/`readyz` excluded.
- Global rate limit: `ThrottlerGuard` (100 req/min) in `app.module.ts`.
- Global `CsrfGuard` runs before `ThrottlerGuard` (registration order in `app.module.ts`); CSRF-blocked requests don't count toward throttle buckets.
