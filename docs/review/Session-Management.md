# Session Management

How IdentityHub authenticates browser users — cookies, CSRF, rotation, and expiry.

---

## Overview

IdentityHub uses **server-side sessions** stored in Postgres. A random 32-byte token is sent to the browser in an `HttpOnly` cookie; only its SHA-256 hash lives in the database. There are no JWTs, no signed cookies, and no token introspection — every authenticated request resolves the session row directly.

```
Browser                          Server
  │                                │
  │  POST /auth/login              │
  │  { email, password }           │
  │  + x-csrf-token header         │
  │  + csrf_token cookie           │
  │ ──────────────────────────────► │
  │                                │  1. CsrfGuard: timing-safe compare
  │                                │  2. AuthService.login():
  │                                │     - bcrypt verify (dummy hash on miss)
  │                                │     - SessionManager.create():
  │                                │         delete ALL old sessions
  │                                │         INSERT new row (token_hash)
  │                                │         return raw token
  │  ◄──────────────────────────────│
  │  Set-Cookie: sid=<token>        │
  │  { user }                       │
  │                                │
  │  GET /auth/me                   │
  │  Cookie: sid=<token>            │
  │ ──────────────────────────────► │
  │                                │  SessionGuard:
  │                                │    hash(token) → lookup row
  │                                │    check idle + absolute expiry
  │                                │    refresh sliding window
  │                                │    attach user, tenantId to request
  │  ◄──────────────────────────────│
  │  { user }                       │
```

---

## Key Files

| File                                                                               | Role                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`src/config/session.ts`](../../src/config/session.ts)                             | Cookie names, header names, TTL defaults, token byte sizes               |
| [`src/infra/session.ts`](../../src/infra/session.ts)                               | `SessionManager` — create, resolve, peek, destroy                        |
| [`src/infra/csrf.ts`](../../src/infra/csrf.ts)                                     | Double-submit CSRF helpers                                               |
| [`src/infra/crypto.ts`](../../src/infra/crypto.ts)                                 | `randomBytes`, `sha256Hex`, `hashPassword`/`verifyPassword`, `safeEqual` |
| [`src/infra/audit.ts`](../../src/infra/audit.ts)                                   | `AuditService.write()` — every login/logout is logged                    |
| [`src/modules/auth/auth.service.ts`](../../src/modules/auth/auth.service.ts)       | `login()` and `logout()` business logic                                  |
| [`src/modules/auth/auth.controller.ts`](../../src/modules/auth/auth.controller.ts) | HTTP endpoints: csrf-token, login, logout, me                            |
| [`src/modules/auth/session.guard.ts`](../../src/modules/auth/session.guard.ts)     | `SessionGuard` — reads `sid` cookie, resolves, attaches to request       |
| [`src/modules/auth/csrf.guard.ts`](../../src/modules/auth/csrf.guard.ts)           | `CsrfGuard` — global double-submit cookie check                          |
| [`src/modules/auth/auth.decorator.ts`](../../src/modules/auth/auth.decorator.ts)   | `@CurrentUser()`, `@CurrentTenantId()` param decorators                  |
| [`src/modules/auth/request.types.ts`](../../src/modules/auth/request.types.ts)     | `RequestWithSession` interface, `readCookie()` helper                    |
| [`prisma/schema.prisma`](../../prisma/schema.prisma)                               | `sessions` table definition (line 26)                                    |

---

## Lifecycle

### 1. CSRF Bootstrap

Before any mutation, the client fetches a CSRF token. This sets a **non-HttpOnly** cookie that JavaScript can read and echo back as a header.

```
Client                              Server
  │  GET /csrf-token                  │
  │ ─────────────────────────────────►│
  │                                   │  Generate 32-byte random token
  │                                   │  Set-Cookie: csrf_token=<token> (JS-readable)
  │  ◄────────────────────────────────│
  │  { token: "<same value>" }        │
```

- Cookie: `csrf_token` — `httpOnly: false`, `sameSite: lax`
- The guard (`CsrfGuard`) runs **before** `ThrottlerGuard` — CSRF-blocked requests don't consume rate-limit buckets.

**Code:** [`csrf.guard.ts:12`](../../src/modules/auth/csrf.guard.ts#L12), [`csrf.ts`](../../src/infra/csrf.ts)

### 2. Signup

Signup creates a tenant + user but does **not** create a session — the user must log in separately.

```
POST /app/signup  { email, password, tenant_id | new_tenant }
       │
       ▼
  UserService.signup()
       │
       ├── tenant_id provided?  → join existing tenant
       ├── new_tenant provided? → create tenant with slug + name
       └── neither?             → auto-create tenant from email prefix
       │
       ▼
  Hash password (bcrypt cost 12)
  INSERT user with tenant_id
  Return { user, tenant }    ← no session created
```

**Code:** [`user.service.ts:23`](../../src/modules/users/user.service.ts#L23), [`user.controller.ts:33`](../../src/modules/users/user.controller.ts#L33)

### 3. Login

```
POST /auth/login  { email, password }
       │
       ▼
  CsrfGuard: validate double-submit cookie
       │
       ▼
  AuthService.login()
       │
       ├── Find user by email
       │   If NOT found → use DUMMY_PASSWORD_HASH (constant-time anti-enumeration)
       │
       ├── bcrypt verify(password, hash)
       │   If invalid → throw InvalidCredentialsError (same error either way)
       │
       ├── SessionManager.create()
       │   ├── deleteMany WHERE user_id = userId  (kills fixation + all old sessions)
       │   ├── Generate 32-byte random token (base64url)
       │   ├── INSERT session row with:
       │   │     token_hash = SHA-256(token)
       │   │     expires_idle_at  = now + 30m  (sliding)
       │   │     expires_absolute_at = now + 12h  (hard cap)
       │   │     rotated_from_id = old session ID (audit chain)
       │   └── Return raw token string
       │
       ├── AuditService.write({ action: LOGIN })
       │
       ▼
  Controller sets cookie:
    Set-Cookie: sid=<token>; httpOnly; sameSite=lax; path=/
  Return { user }
```

**Key security properties:**

- **Session fixation prevention:** All existing sessions for the user are deleted before creating the new one.
- **No user enumeration:** Unknown email → dummy bcrypt hash runs → same timing as valid-email-wrong-password → same error message.
- **Token never stored:** Only `SHA-256(token)` is in the DB. If the DB is compromised, tokens can't be replayed.

**Code:** [`auth.service.ts:29`](../../src/modules/auth/auth.service.ts#L29), [`session.ts:44`](../../src/infra/session.ts#L44)

### 4. Authenticated Request

```
GET /auth/me  (or any @UseGuards(SessionGuard) route)
       │
       ▼
  SessionGuard.canActivate()
       │
       ├── readCookie(request, 'sid')
       │   If missing → throw UnauthorizedError (401)
       │
       ├── SessionManager.resolve(token)
       │   ├── SHA-256(token) → lookup by token_hash
       │   ├── If not found → return null
       │   ├── Check expires_absolute_at < now → delete row, return null
       │   ├── Check expires_idle_at < now    → delete row, return null
       │   ├── Fetch user + tenant from DB
       │   ├── Refresh: last_seen_at = now
       │   ├── Refresh: expires_idle_at = now + 30m  (sliding window)
       │   └── Return { id, user: { id, email, tenantId, tenantName } }
       │
       ├── If null → throw SessionExpiredError (401)
       │
       ▼
  request.user     = session.user
  request.tenantId = session.user.tenantId
  request.sessionId = session.id
       │
       ▼
  Route handler uses @CurrentUser() / @CurrentTenantId()
```

**Code:** [`session.guard.ts:11`](../../src/modules/auth/session.guard.ts#L11), [`session.ts:83`](../../src/infra/session.ts#L83)

### 5. Logout

```
POST /auth/logout
       │
       ▼
  AuthService.logout()
       │
       ├── SessionManager.peek(token)   ← lightweight lookup for audit context
       ├── SessionManager.destroy(token) ← DELETE WHERE token_hash = SHA-256(token)
       ├── AuditService.write({ action: LOGOUT })
       │
       ▼
  Controller clears cookie:
    Set-Cookie: sid=; httpOnly; maxAge=0; path=/
  Return { status: "logged_out" }
```

**Code:** [`auth.service.ts:65`](../../src/modules/auth/auth.service.ts#L65)

---

## CSRF Protection

IdentityHub uses the **double-submit cookie** pattern — independent of the session:

```
┌──────────────────────────────────────────────────────┐
│  CsrfGuard (global, runs on every request)          │
│                                                      │
│  1. Safe methods (GET/HEAD/OPTIONS)? → skip          │
│  2. Bearer token (API key)?          → skip          │
│  3. Origin check:                    → CsrfInvalid   │
│     same-origin | localhost:5173 | CORS_ORIGIN       │
│  4. Timing-safe compare:             → CsrfInvalid   │
│     cookie("csrf_token") == header("x-csrf-token")  │
│                                                      │
│  Pass → next guard / handler                         │
└──────────────────────────────────────────────────────┘
```

**Why this works:**

- The `csrf_token` cookie is **not** HttpOnly — JavaScript can read it.
- An attacker on a different origin **cannot** read the cookie (same-origin policy).
- The attacker's forged request won't have the correct `x-csrf-token` header.
- Timing-safe comparison prevents side-channel attacks on the token match.

**Client-side implementation:** [`client/src/api/client.ts`](../../client/src/api/client.ts) — fetches the CSRF token once, caches it, and attaches `x-csrf-token` + `credentials: 'same-origin'` on every `apiRequest()`.

**Code:** [`csrf.guard.ts`](../../src/modules/auth/csrf.guard.ts), [`csrf.ts`](../../src/infra/csrf.ts)

---

## Session Expiry

| Timeout                 | Default  | Config Env Var            | Behavior                                                  |
| ----------------------- | -------- | ------------------------- | --------------------------------------------------------- |
| **Idle (sliding)**      | 30 min   | `SESSION_IDLE_TTL_MS`     | Resets on every `resolve()` call (authenticated activity) |
| **Absolute (hard cap)** | 12 hours | `SESSION_ABSOLUTE_TTL_MS` | Never extends, regardless of activity                     |

Both are checked in `SessionManager.resolve()`. If either is exceeded, the session row is **deleted** and `null` is returned → `SessionExpiredError` (401).

```
Timeline (30-min idle, 12h absolute):

t=0          t=25m         t=50m         t=75m        ...       t=12h
  │            │              │             │                      │
  login        activity       activity      activity              hard
  │            │              │             │                      │
  │   ┌─idle──►│   ┌─idle────►│   ┌─idle───►│                      │
  │   │        │   │          │   │         │                      │
  ▼   ▼        ▼   ▼          ▼   ▼         ▼                      ▼
  [──────────────────────────────────────────────────────────── EXPIRED ]
     ◄──────── sliding window refreshes each time ────────────►
```

**Code:** [`config/session.ts`](../../src/config/session.ts), [`session.ts:83`](../../src/infra/session.ts#L83)

---

## Database Schema

```sql
sessions
├── id                   VARCHAR  PK (cuid)
├── user_id              VARCHAR  → users.id
├── token_hash           VARCHAR  UNIQUE (SHA-256 of raw token)
├── ip                   VARCHAR?
├── user_agent           VARCHAR?
├── created_at           TIMESTAMP
├── last_seen_at         TIMESTAMP  (refreshed on each resolve)
├── expires_idle_at      TIMESTAMP  (sliding window)
├── expires_absolute_at  TIMESTAMP  (hard cap)
└── rotated_from_id      VARCHAR?   (audit chain: which session was rotated)
```

**Code:** [`prisma/schema.prisma:26`](../../prisma/schema.prisma#L26)

---

## Configuration Summary

| Setting             | Default        | Env Override                | Source                                                                   |
| ------------------- | -------------- | --------------------------- | ------------------------------------------------------------------------ |
| Session cookie name | `sid`          | —                           | [`config/session.ts:6`](../../src/config/session.ts#L6)                  |
| CSRF cookie name    | `csrf_token`   | —                           | [`config/session.ts:7`](../../src/config/session.ts#L7)                  |
| CSRF header name    | `x-csrf-token` | —                           | [`config/session.ts:8`](../../src/config/session.ts#L8)                  |
| Idle TTL            | 30 min         | `SESSION_IDLE_TTL_MS`       | [`config/session.ts:11`](../../src/config/session.ts#L11)                |
| Absolute TTL        | 12 hours       | `SESSION_ABSOLUTE_TTL_MS`   | [`config/session.ts:12`](../../src/config/session.ts#L12)                |
| Token bytes         | 32             | —                           | [`config/session.ts:15`](../../src/config/session.ts#L15)                |
| Secure cookies      | `false`        | `COOKIE_SECURE`             | [`auth.controller.ts:35`](../../src/modules/auth/auth.controller.ts#L35) |
| Login rate limit    | 5/min          | `RATE_LIMIT_LOGIN_LIMIT`    | [`config/rate-limits.ts:21`](../../src/config/rate-limits.ts#L21)        |
| Global rate limit   | 100/min        | `RATE_LIMIT_GLOBAL_LIMIT`   | [`config/rate-limits.ts:20`](../../src/config/rate-limits.ts#L20)        |
| Purge on startup    | off            | `PURGE_SESSIONS_ON_STARTUP` | [`main.ts:85`](../../src/main.ts#L85)                                    |
| Bcrypt cost         | 12             | —                           | [`crypto.ts:60`](../../src/infra/crypto.ts#L60)                          |

---

## Guard Execution Order

Registered in [`app.module.ts`](../../src/app.module.ts) as global guards:

```
Request arrives
     │
     ▼
① ThrottlerGuard    (global, 100 req/min)
     │
     ▼
② CsrfGuard         (global, skips safe methods + Bearer tokens)
     │
     ▼
③ SessionGuard      (per-route, only on protected endpoints)
     │
     ▼
Route handler
```

CSRF runs **before** throttle — a CSRF-blocked request never counts toward the rate-limit bucket.

---

## Security Checklist

- [x] **No JWT** — opaque server-side tokens, revocable on logout
- [x] **Token hashed** — only SHA-256 in DB, raw token never persisted
- [x] **HttpOnly cookie** — JavaScript cannot access `sid`
- [x] **SameSite=Lax** — CSRF-safe for top-level navigations
- [x] **Session rotation** — new token on every login, old sessions deleted
- [x] **Fixation prevention** — `deleteMany` kills all previous sessions
- [x] **Anti-enumeration** — dummy bcrypt hash on unknown emails
- [x] **Double-submit CSRF** — timing-safe comparison, origin check
- [x] **Sliding idle + absolute cap** — configurable via env
- [x] **Rate limiting** — 5 login attempts/min/IP
- [x] **Audit trail** — every login/logout recorded with IP + user-agent
- [x] **Startup purge** — optional `PURGE_SESSIONS_ON_STARTUP` wipes all sessions
