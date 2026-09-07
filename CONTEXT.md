# IdentityHub — NHI Jira Integration: Design Context

> **Status**: working design document. Stack confirmed: **NestJS (Express
> platform) + TypeScript** (see §4.2). **UI: React + Vite SPA served
> statically by the NestJS process** (§6, still one deploy unit). **Data model
> §8 + at-rest encryption §8.1.** **Deployment: modular monolith** (§15).
> Confirmed scope matches §2 exactly — a single Jira integration gateway. Jira
> auth is **API-token** (OAuth 3LO deferred; per-user connection model).
> **Identity core**: local auth (email+password) default, server-side sessions,
> invariants in §7.1. **Caching**: credentials never cached; derived
> read-models cached (§11.1). Adversarial review checklist: §11.2. Bonus Blog
> Digest skipped. Postgres + SQLite via Prisma datasource switch (§16.4).
> Signup model design in §10.

---

## 1. Problem Statement

IdentityHub is an NHI (Non-Human Identity) management platform. Customers want to
report NHI findings (stale service accounts, overprivileged keys, expiring credentials)
directly to their Jira workspace — manually from a UI and programmatically from
scanners / CI pipelines via a REST API.

This service is consumed by **clients of the Oasis cluster**, so it must be:

- deployable as a microservice behind the Oasis ingress
- multi-tenant safe (each customer = one or more users with isolated data)
- credential-hygienic (Jira tokens stored safely; API keys revocable)
- observable (logs, health, metrics)

---

## 2. Functional Requirements (mapped to channels)

| #   | Requirement                                                                   | Channel  |
| --- | ----------------------------------------------------------------------------- | -------- |
| 1   | App login / logout + secure session                                           | UI       |
| 2   | Per-user Jira integration after login (API-token **or** OAuth)                | UI       |
| 3   | Multi-tenant isolation — no cross-tenant data leak                            | UI + API |
| 4   | Create NHI finding ticket: pick project, title + description                  | UI       |
| 5   | Show 10 most recent app-created tickets for selected project, click → new tab | UI       |
| 6   | REST endpoint to create tickets with API-key auth, validation, proper codes   | API      |

---

## 3. Non-Functional / Assessment Criteria

- **Architecture** — clean UI/backend separation; module boundaries that survive
  scaling to a real cluster deployment.
- **Security** — multi-tenancy, credential management, secure coding.
- **Product UX** — clear errors, intuitive flows.
- **Scope definition** — Jira-field choices and reasoning documented.
- **Architectural knowledge** — choices justified.

---

## 4. Stack — Decision Log

### 4.1 Runtime & language

**Node.js + TypeScript** (chosen). Reasoning: the user clarified this is a service
deployed on the Oasis cluster and consumed by Oasis clients — Node is the right
bead size for a small, well-isolated microservice, and the ecosystem gives us
mature OAuth, validation, and ORM libraries out of the box.

TS (strict mode) for compile-time safety on the auth/tenancy boundary.

### 4.2 Web framework — this was decided together: NestJS (chosen)

We weighed Fastify vs NestJS and landed on **NestJS (Express platform)**. The
summary table, kept for reviewers:

| Dimension                             | Fastify                     | **NestJS**                                                             |
| ------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Shape                                 | Minimal, fast, schema-first | Opinionated, Angular-style DI + modules                                |
| Architecture enforcement              | None — you choose layout    | **Strong — modules/controllers/providers/DI**                          |
| Validation                            | `fastify-type-provider-zod` | Zod via a `ValidationPipe` (or class-validator)                        |
| DI                                    | None (manual or `awilix`)   | First-class                                                            |
| Boilerplate                           | Low                         | Medium (earned — the assignment grades architecture)                   |
| Modular-monolith → microservice story | Plugins are HTTP-scoped     | **Modules are business-scoped and portable** (§15)                     |
| Security-feature fit                  | Static middleware           | **Guards/pipes/interceptors/filters map 1:1 onto our checklist (§11)** |

**Why NestJS wins for this assignment:**

1. The #1 graded axis is _architecture_; NestJS enforces it structurally
   (modules/controllers/providers), which reads stronger than self-discipline.
2. Our modular-monolith → microservices story (§15) is literally NestJS modules
   (`AuthModule`, `JiraModule`, `TicketsModule`, `ApiKeysModule`); extraction =
   copy a module into a new app.
3. The security checklist (§11) maps onto first-class Nest mechanisms:
   session `AuthGuard`, Zod `ValidationPipe`, audit + request-id
   `Interceptor`, HTTP-error-mapping `ExceptionFilter`, CSRF + helmet
   middleware.
4. The identity core (§7.1) is explicit in the request path: a principal
   decorator + per-tenant repository factory keep `tenantId` provably derived
   from the session/API key.

Mitigations acknowledged: NestJS's DI/decorators obscure control flow and
vanilla Nest scaffolding can read as boilerplate; we keep the _design_
(§7.1 invariants, §11.1 caching, §9 error mapping) in hand-written services so
the reasoning (not the scaffolding) carries the signal.

Honesty note: Fastify would have been ~20% less code, but for a review that
reads "architecture" first, NestJS's enforced boundaries earn their weight. Both
were defensible; we chose signal over minimalism.

### 4.3 Other choices

| Concern           | Choice                                                                                                                                                                     | Reasoning                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORM / DB          | **Prisma + PostgreSQL**                                                                                                                                                    | Postgres for cluster deployment; Prisma gives typed queries and migrations. SQLite only for local dev (Prisma datasource switch).                                    |
| Sessions          | Server-side, opaque 32B ID in **HttpOnly + Secure + SameSite=Lax** cookie, DB-backed, **rotated on login**, idle 30 m / absolute 12 h sliding                              | Trivial revocation, fixation-proof, multi-process safe (shared DB).                                                                                                  |
| Password hashing  | **bcryptjs** (cost 12)                                                                                                                                                     | Standard.                                                                                                                                                            |
| Jira auth         | **API-token only** (email + API token via Basic auth); OAuth 2.0 (3LO) **deferred** to post-assignment                                                                     | API-token covers assignment §2 #2 ("API-token or OAuth"); OAuth adds ~400 LOC and 4 extra routes with no extra points. `mode` column stays in schema for future use. |
| Token storage     | **AES-256-GCM** keyed by `APP_SECRET` env var; per-row nonce                                                                                                               | At-rest encryption for both API tokens and OAuth refresh tokens.                                                                                                     |
| API key auth      | Random 32B key, base64url; **SHA-256 hashed** at rest; `Authorization: Bearer <key>`                                                                                       | Stateless verification, simple revocation.                                                                                                                           |
| API validation    | **Zod** schemas shared between UI form parsing and REST body parsing                                                                                                       | One source of truth for the ticket shape.                                                                                                                            |
| UI                | **React + Vite SPA**, built once and **served statically by the NestJS process** (`useStaticAssets`); dev uses the Vite dev server with a proxy to the API (single origin) | Browser sees one origin in dev, no CORS/CSRF complexity; prod is still one deployment unit (§6).                                                                     |
| Logging           | **pino** + `nestjs-pino`                                                                                                                                                   | Fast, JSON-structured for cluster log shipping.                                                                                                                      |
| Rate limiting     | `@nestjs/throttler` on our endpoints; **honor Jira 429 / `Retry-After`**; single-flight on OAuth refresh                                                                   | Login + ticket creation + REST, per-IP/key; upstream self-throttling, no blind create-retry.                                                                         |
| Jira read caching | Recent tickets: local read model + async JQL reconcile (TTL 30 s); projects: per-user 60 s TTL + refresh link                                                              | Dashboard loads with zero Jira calls; respects Jira rate limits (§11.1).                                                                                             |
| CSRF              | Double-submit cookie (session-independent) via custom Nest middleware                                                                                                      | Defense in depth on top of SameSite=Lax.                                                                                                                             |
| Security headers  | `helmet` via middleware (`contentSecurityPolicy` set for our own SPA origin)                                                                                               | CSP, X-Content-Type-Options, Referrer-Policy.                                                                                                                        |
| Health endpoints  | `/healthz` (liveness), `/readyz` (DB ping)                                                                                                                                 | Cluster-friendly.                                                                                                                                                    |
| Tests             | **Vitest** + **supertest**                                                                                                                                                 | Fast, ESM-native, plays well with TS.                                                                                                                                |

---

## 5. Scope Decisions (documented per Oasis's request)

- **Jira fields supported**: only `summary`, `description` (ADF), `project`, `issuetype`
  ("Task"). ADF chosen over plain text because Jira Cloud renders plaintext
  inconsistently across issue views. Minimal surface = smaller error surface.
- **Jira projects**: any project the connected user has "Create Issues" permission
  in. We list via `/rest/api/3/project/search`; Jira enforces server-side.
- **Jira connection model (locked §16.5)**: **one Jira connection per user**
  (`jira_connections.user_id UNIQUE`). One connection = one Jira workspace/site,
  which contains **many projects**; "select a Jira project from their connected
  workspace" therefore means picking a project inside the single connection — no
  connection picker in the UI. Human attribution in Jira comes from per-user
  auth (Jira Cloud cannot create a ticket on another user's behalf). Automation
  rides the API-key owner's connection; an autonomous process is a dedicated
  **bot/svc user** (own Jira service-account link + own API key), the standard
  pattern. Multiple-connections-per-user and shared/tenant connections are
  explicit **non-goals** for this scope.
- **"10 most recent tickets from this app"**: served from a local read
  model (`tickets_cache`) for instant load, then reconciled asynchronously
  against JQL `project = "<KEY>" AND labels = "identityhub-finding" ORDER BY
created DESC` (TTL 30 s). The label `identityhub-finding` is added on every
  created ticket; it lets any connected user find app-created tickets directly
  in Jira (vs `creator = currentUser()` which hides teammates' tickets) and is
  what the reconcile filter searches on.
- **Session lifetime**: idle 30 min / absolute 12 h, sliding refresh; session
  ID **rotated on login** (fixation-proof).
- **Email identity**: globally unique for the demo (see §8) — the real
  per-tenant-unique refinement is a production toggle, not demo scope.
- **CSRF**: required on all state-changing UI routes.
- **Rate limiting**: 5/min on login, 30/min on ticket creation, 60/min per API key.

---

## 6. UI vs API Split

**Decision: serve the UI from the same monolith process (Option A)** — see
§15. For reference, the two shapes:

### Option A — Monolith service (UI served by the same Node process) — CHOSEN

```
identityhub-jira  ─► serves /app/* (React SPA) + /api/* JSON
```

- **Pros**: single deployment unit, single auth boundary, simplest ops, smallest
  surface for multi-tenant bugs.
- **Cons**: coupled release cadence; UI assets shipped with API.

**UI concrete shape: React + Vite SPA, served by the NestJS process.**

- Prod: `client/` builds to static assets → Nest `useStaticAssets` + a catch-all
  route that returns `index.html` for client-side routes. One artifact.
- Dev: run the Vite dev server (e.g. `:5173`) with `server.proxy` forwarding
  `/api` and `/auth` to Nest (`:3000`). The browser only ever talks to one
  origin (`:5173`), so cookies, CSRF, SameSite and CORS are all unchanged —
  no `Access-Control-Allow-*` config, no `SameSite=None`.
- The SPA is a thin client: it renders forms + lists and calls the JSON API; all
  business logic/tenancy/session logic stays server-side. If we ever split to a
  hosted static SPA (Option B), only `server.proxy` becomes real CORS + static
  hosting — the API surface is unchanged.

### Option B — Split UI (separate static SPA, e.g. Vite/React)

```
identityhub-jira-api   ─► pure JSON
identityhub-jira-ui    ─► static SPA calling the API (deployed behind Oasis ingress)
```

- **Pros**: independent deploys; UI can use any framework; aligns with a typical
  microservice layout where the cluster has a dedicated UI tier.
- **Cons**: two deployments, CORS + `SameSite=None` cookies, two auth cookies.

**Recommendation for the assignment: Option A (monolith)**, with the React SPA
served from the same NestJS process (above). "Most frictionless run" wins — one
process, one health check, one deployment artefact — and the React/Vite UI that
was a stated preference is preserved. The module layout still enforces UI vs
backend separation; Option B remains a mechanical refactor if the cluster ever
wants a hosted static tier.

---

## 7. High-Level Architecture

```
                ┌─────────────────────── Oasis cluster ───────────────────────┐
                │                                                              │
  Browser ───►  │  identityhub-jira service (Node/TS, Fastify)                  │
                │    │                                                         │   │
                │    ├─ /auth/*        login, logout, oauth callback        │   │
                │    ├─ /app/*         UI HTML (session cookie + CSRF)      │   │
                │    ├─ /api/v1/*      REST API (Bearer API key)            │   │
                │    ├─ /healthz /readyz                                   │   │
                │    │                                                         │
                │    └─ infra: db (Prisma → Postgres), crypto, session, csrf, │
                │         rate-limit, helmet, pino                            │   │
                │                                                              │
                │  Postgres  ◄── schema: users, sessions, api_keys,            │
                │                      jira_connections, audit_log             │
                └──────────────────────────────────────────────────────────────┘
                          │                               │
                          │  Bearer (user OAuth or PAT)   │  Bearer (API key)
                          ▼                               ▼
                   Atlassian Jira Cloud           scanners / CI/CD
```

### Tenancy model

- Every domain row carries `tenant_id` AND `user_id`.
- Tenancy is derived from the authenticated principal (session user or API key
  owner); clients never pass `tenant_id` or `user_id` in requests.
- All repositories require `tenantId` as the first argument and filter by it
  inside the query, not in JS — defence in depth against missing-where bugs.
- The API key → user lookup is itself scoped by `tenant_id`, so a leaked key
  from tenant A cannot read tenant B's data.
- Audit log records `{tenant_id, user_id, action, target, ip, ts}` for every
  state-changing action.

### 7.1 Identity & session invariants (the rock-solid core)

The first three requirements (login/logout, secure sessions, concurrent users
without interference) are the graded core; every Jira feature is trivial once
this is airtight. Invariants:

1. **Session = opaque 32B random ID → DB row, cookie `HttpOnly + Secure +
SameSite=Lax`.** Never a signed/JWT cookie. Revocable on logout, works
   multi-process, no token-in-cookie replay surface.
2. **Rotate on login** (new ID, delete old session if any) — kills session
   fixation. Sliding idle timeout (30 m) + absolute cap (12 h); activity
   refreshes idle only.
3. **Logout = delete DB row + clear cookie + audit entry.** A replayed
   request/cached page after logout must fail with a redirect to login —
   never a 500, never resurrected auth.
4. **CSRF = double-submit cookie, independent of the session.** A form left
   open in a tab must survive a session rotation/refresh without breaking.
5. **`tenantId` is derived from the authenticated principal (session or API
   key owner), never from the request body/query.** All repos take `tenantId`
   first and filter in SQL — the isolation invariant is provable by code
   inspection.
6. **Login must not enable user enumeration**: one generic error
   ("Invalid credentials") for both unknown email and wrong password; same
   timing profile (bcryptjs compare runs either way). Rate-limit login (5/min/IP).
7. **Global-unique email in this demo** (see §8): keeps login-by-email
   unambiguous across tenants without an extra tenant selector.
8. **Session/cookie setting only over HTTPS in prod**; `Secure` flag on.
   Local dev may set `COOKIE_SECURE=false` explicitly, never silently.

---

## 8. Data Model

```
tenants(id PK, slug UNIQUE, name, created_at)
users(id PK, tenant_id FK, email UNIQUE, password_hash, created_at)
  -- email globally unique in this demo (invariant §7.1.7); per-tenant-unique
  -- is a production toggle, not demo scope.
sessions(id PK, user_id FK, created_at, last_seen_at, expires_idle_at,
         expires_absolute_at, rotated_from_id)
api_keys(id PK, tenant_id, user_id FK, name, key_hash UNIQUE, created_at,
         last_used_at, revoked_at)
jira_connections(
  id PK, tenant_id, user_id FK UNIQUE,
  mode ENUM('api_token','oauth'),
  cloud_id, site_url,
  email,                              -- api_token mode
  api_token_cipher, api_token_nonce,  -- api_token mode
  access_token_cipher, access_token_nonce,        -- oauth mode
  refresh_token_cipher, refresh_token_nonce,      -- oauth mode
  oauth_expires_at, oauth_scopes,                 -- oauth mode
  created_at, updated_at
)
tickets_cache(                       -- read model for recent-tickets view
  id PK, tenant_id, user_id,
  jira_site, project_key, issue_key,
  title, url, jira_created_at, reconciled_at,
  UNIQUE (user_id, jira_site, project_key, issue_key)
)
audit_log(id PK, tenant_id, user_id, action, target, ip, user_agent, at)
```

Notes:

- Token ciphertext + nonce stored side-by-side; nonce is the GCM nonce.
- `key_hash` is SHA-256 of the raw key — bcryptjs is overkill here (low-entropy
  API keys don't need slow hashing; SHA-256 + constant-time compare is the
  standard pattern).
- `tickets_cache` holds only tickets **created via this app**; it is a derived
  read model, never the source of truth. Source of truth stays in Jira (§11.1).
- **Exactly one connection per user** in this model — `user_id` is `UNIQUE` on
  `jira_connections`, and the cache is keyed by `(user_id, jira_site,
project_key, issue_key)`. Because a user has one connection, "user" is a
  sufficient key; a future multi-connection model would re-key on
  `connection_id` (documented in §16.5 as deferred).
- `tenants` exists even though the assignment is single-customer per install
  in the demo; it's how a real Oasis deployment would isolate customers from
  each other.

### 8.1 At-rest encryption & key handling

What gets encrypted, how, and with what key:

| Secret                           | At rest                                | Why this shape                                                                     |
| -------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| User password                    | **bcryptjs cost 12** hash              | Standard password hashing; never reversible                                        |
| Jira API token (api_token mode)  | **AES-256-GCM**, keyed by `APP_SECRET` | Must be retrievable to make API calls, so encrypt-not-hash                         |
| Jira OAuth access/refresh tokens | **AES-256-GCM**, keyed by `APP_SECRET` | Same rationale; access token only decrypted for the in-flight Jira call            |
| API keys (our own)               | **SHA-256 hash**                       | High-entropy random (32 B) — hash suffices, cheap to verify, constant-time compare |
| Session IDs                      | **SHA-256 hash** in DB                 | Opaque random token; never store plaintext for replayable sessions                 |

Rules:

- **One key, `APP_SECRET` (32 B)**, from env/secret-manager; never in code or
  git. `crypto.createSecretKey`, AES-256-GCM, **unique 12 B random nonce per
  value** (stored in the `*_nonce` column beside the ciphertext). Decrypt only
  in memory, release immediately.
- **Rotation**: rotating `APP_SECRET` invalidates all stored Jira tokens (they
  can't be decrypted) → documented in AGENTS.md + README. Prod evolution
  (out of scope): k8s Secret + envelope encryption (tenant DEK wrapped by a KMS
  KEK) so per-tenant rotation is possible.
- **Never log** plaintext secrets; pino redactions + explicit
  `omit-request-logging` on routes that accept tokens. (Checklist §11.)
- Local dev: `APP_SECRET` from `.env`; `COOKIE_SECURE=false` only when
  explicitly set — same rule as §7.1.8.

MVP note: a single global `APP_SECRET` is acceptable for the PoC because
every stored token is per-user and the service is single-tenant-per-demo; the
KMS/envelope path is a production-scaling concern, not this scope.

---

## 9. REST API

```
POST /api/v1/tickets
  Auth: Authorization: Bearer <api_key>
  Body (JSON, validated with Zod):
    {
      "project_key": "SEC",           // required, ^[A-Z][A-Z0-9]{1,9}$
      "title":       "Stale svc...",  // required, 1..255
      "description": "..."            // required, 1..30000
    }
  201 -> { "id":"10023", "key":"SEC-123", "url":"https://..." , "label":"identityhub-finding" }
  400 -> { "error":"validation", "fields":{ "title":"required" } }
  401 -> { "error":"unauthorized" }                       // missing/invalid key
  403 -> { "error":"jira_not_connected" }                 // key valid, no Jira link
  404 -> { "error":"project_not_found" }                  // Jira rejected project
  429 -> { "error":"rate_limited", "retry_after": 12 }
  502 -> { "error":"upstream_jira", "detail":"<safely worded>" }
```

API key management (UI-only, no public endpoint to list keys):

- `POST /app/api-keys` → returns the raw key **once**, never again.
- `DELETE /app/api-keys/:id` → revoke.

---

## 10. Signup Model — Real-World Design

The user flagged this as a design question. Here are the three viable shapes for
a service deployed on the Oasis cluster, with tradeoffs.

### A. Open self-registration

- Anyone hitting `/signup` creates a tenant + user in one step.
- **Pros**: zero onboarding friction for the demo; trivially testable by reviewers.
- **Cons**: in production, this is an instant spam / abuse vector; you'd need
  email verification, captcha, rate limiting, anti-bot.
- **Verdict**: fine for a PoC, not fine for production on a shared cluster.

### B. Invite-only (operator / IdP-driven)

- Oasis operators (or an external IdP) invite users; signup page just accepts
  an invite token.
- **Pros**: tenant scoping is decided upstream; no anonymous signups.
- **Cons**: requires an out-of-band system to mint invites — for the demo, this
  means the reviewer can't poke at it without help.
- **Verdict**: realistic for B2B, friction for the assignment.

### C. SSO / OIDC only (Oasis is the IdP)

- Users log in via the Oasis platform OIDC; the service just trusts the token
  and provisions a user on first login.
- **Pros**: matches the deployment story — clients of Oasis already have an
  Oasis identity; no separate password store.
- **Cons**: depends on Oasis's OIDC issuer being available; adds an external
  dependency for the demo.
- **Verdict**: best answer _if_ the real deployment uses Oasis SSO. Otherwise
  it's a yak-shave for a homework.

### D. Hybrid (recommended for this assignment)

- **Primary**: SSO/OIDC against a configurable issuer (`OIDC_ISSUER_URL`).
  If unset, falls back to local email + password with **invite-only** signup.
- The first user is bootstrapped via a one-time `ADMIN_INVITE_TOKEN` env var;
  that user can then invite others.
- For the demo, we ship with OIDC **disabled** by default and an env flag
  `ALLOW_OPEN_SIGNUP=true` to flip on open registration — making the demo
  frictionless while keeping the production path real.

This lets the same code path serve both "run it locally and try it" and "deploy
on Oasis with SSO" without forking.

**Open question**: OIDC wiring is **postponed** (see §16). Confirmed for the
demo: **local email+password is the shipped default** (user's vote), with the
OIDC adapter as a documented, configurable hook that's off by default. The
assignment's auth emphasis is isolation + session hygiene, not SSO — see §11.2
and §7.1.

---

## 11. Security Checklist

- [x] Passwords: bcryptjs cost 12.
- [x] Sessions: random 32B ID, HttpOnly, Secure, SameSite=Lax, server-side store.
- [x] CSRF on all state-changing UI routes.
- [x] Output encoding via template engine auto-escape.
- [x] SQL: Prisma parameterised queries (no raw SQL interpolation).
- [x] Secrets: env vars; tokens AES-GCM at rest; never logged.
- [x] API keys: SHA-256 hashed at rest; shown once on creation.
- [x] Rate limiting on login + ticket creation + REST.
- [x] Constant-time compare for API key hash (`crypto.timingSafeEqual`).
- [x] Security headers via Helmet (CSP, X-Content-Type-Options, Referrer-Policy).
- [x] Errors: no stack traces leaked; structured logs server-side.
- [x] Tenant scoping enforced inside repository methods, not in handlers.
- [x] Session rotation on login; idle + absolute expiry (invariants §7.1).
- [x] Login immune to user enumeration (generic error, uniform timing).
- [x] Log hygiene: Jira tokens/API keys/passwords never in pino output.
- [x] Honor Jira `429` / `Retry-After`; never blind-retry a create.
- [ ] OAuth refresh single-flight — **deferred** (OAuth not in demo scope; no concurrent token state).

---

### 11.1 Caching Policy

Principle: **cache derived read-models, never credentials.** "Never cache Jira
data" is wrong as a blanket statement; the rate-limit reality (Jira ≈ 100
req/min principal, 429 + `Retry-After`) makes read caching legitimate quota
hygiene. What we cache, and why it's safe:

| Data                                   | Source of truth        | Cache plan                                                                                                                                | Why safe                                                             |
| -------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Jira tokens / API keys                 | DB                     | **Never cache**; load fresh per request                                                                                                   | Credentials must revoke instantly                                    |
| Recent tickets (`identityhub-finding`) | Jira (created via app) | **Local `tickets_cache` read model**, written on each successful create; dashboard reads local first, then async JQL reconcile (TTL 30 s) | We own those creates; instant render = zero Jira calls on load       |
| Projects list                          | Live Jira              | **Per-user 60 s TTL** in-memory + refresh link; serve stale on 429 (`stale-if-error`)                                                     | Projects/permissions change slowly; 60 s staleness invisible         |
| Create ticket                          | Live Jira, always      | **No caching, no blind auto-retry**                                                                                                       | Side effects must be exactly-once; lost response + retry = duplicate |

Rules implied:

- `tickets_cache` is keyed by `(user_id, jira_site, project_key, issue_key)`
  so two users with different Jira sites never conflate tickets.
- Reconcile failures are **silent** (serve cache; log); a Jira outage degrades
  the view to last-known-good, never to an error page.
- Noted tradeoff (documented for reviewers): a ticket deleted directly in Jira
  lingers in the read model as a dead link until reconcile. Acceptable; the
  click-through still points at live Jira. A visible "no longer in Jira" tag is
  future work.
- TTLs are intentionally visible in config (`JIRA_CACHE_TTL_MS`).

---

### 11.2 Adversarial Review Checklist

What a reviewer will likely probe, and the design decision that answers each:

| Probe                                                  | Expected behavior                                   | Answering design                                    |
| ------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------- |
| Two users, two incognito windows                       | User A never sees B's connection/tickets/keys       | §7 tenancy model, repos filter by `tenantId` in SQL |
| Replay request after logout                            | Redirect to login, no 500, no resurrected auth      | §7.1.3 server-side session delete                   |
| Two concurrent tickets (double-click/double-API)       | One intended ticket; idempotent                     | Disabled submit + `Idempotency-Key` on REST (§9)    |
| Session fixation                                       | Old session ID invalidated on login                 | §7.1.2 rotation                                     |
| Login timing/enumeration                               | Generic error, uniform timing                       | §7.1.6                                              |
| Jira down / slow / 429                                 | Friendly message or last-known-good, never hang/500 | §11.1 + honoring `Retry-After`                      |
| Token expired/revoked mid-use                          | "Reconnect Jira" path, not raw 401                  | Jira client error mapping (§7 client)               |
| Malformed/oversized/invalid JSON                       | 400 field-level (Zod), no crash                     | §9 schemas                                          |
| API key matrix: missing / wrong / revoked / restricted | 401 vs 403 with clear body                          | §9                                                  |
| XSS via ticket title in recent list                    | Escaped by template                                 | §11 output encoding                                 |
| JQL injection via project_key                          | Parameterized/escaped JQL                           | §11 SQL/query hygiene                               |
| Secrets in logs                                        | None ever                                           | §11 log hygiene                                     |
| CSRF on form POST                                      | Double-submit token enforced                        | §7.1.4                                              |
| Stale Jira state across reconnect                      | No cached bleed, live JQL reconcile                 | §11.1 keying by jira_site                           |

The first three requirements (auth triad) are §7.1 invariants verbatim — those
are the lines a reviewer will re-read hardest.

---

## 12. Out of Scope (Explicit)

- Ticket editing / transitions / comments.
- Jira webhook ingestion back into IdentityHub.
- Project creation inside Jira.
- Custom field mappings beyond the supported four fields.
- Bonus NHI Blog Digest (skipped per user decision).
- Self-hosted Jira Server (Cloud only).

---

## 13. Target File Layout

```
oasis/
  AGENTS.md                      # working agreement (Node/TS/NestJS)
  README.md                      # setup + design decisions
  package.json                   # root scripts: dev, build, lint, test
  tsconfig.json
  .env.example
  prisma/
    schema.prisma
    migrations/
  src/                           # NestJS backend (single API process)
    main.ts                      # bootstrap, helmet, static SPA, prefixes
    app.module.ts                # root module
    config.ts                    # zod-validated env loader
    infra/
      db.ts                      # prisma client
      crypto.ts                  # seal/open (AES-GCM), random, bcryptjs, sha256
      session.ts                 # cookie session manager + store
      csrf.ts                    # double-submit CSRF middleware
      rate-limit.ts              # rate limiting setup
      audit.ts                   # audit log helper
    modules/
      tenants/                   # tenant repo
      users/                     # user repo + service + signup route
      auth/                      # login/logout/me, session guard, decorators
      api-keys/                  # mint/revoke + API-key guard
      jira/
        jira.module.ts
        jira.routes.ts           # /app/jira/connect, callback, disconnect
        jira.service.ts          # connect/disconnect/list-projects/create/list
        jira.oauth.ts            # 3LO flow + single-flight refresh
        jira.adf.ts              # ADF doc builder
        jira.client.ts           # fetch wrapper (timeouts, error mapping, retries)
      tickets/                   # create-ticket + recent-tickets read model
    app/
      errors.ts                  # typed errors mapped to HTTP (ExceptionFilter)
      validation.ts              # zod schemas shared (ValidationPipe)
  client/                        # React + Vite SPA
    vite.config.ts               # server.proxy → Nest in dev
    src/
      pages/
      components/
      api/                       # typed fetch client (cookies, CSRF header)
    dist/                        # build output, served by Nest via useStaticAssets
  test/                          # vitest + supertest, Jira stubbed
```

---

## 14. Verification Plan

- `npm run lint` (ESLint + prettier).
- `npm run typecheck` (`tsc --noEmit`).
- `npm test` (Vitest unit + integration via supertest, hitting Jira via a stub).
- Manual smoke: start the service with `ALLOW_OPEN_SIGNUP=true`, sign up two
  users in two tenants, verify user A cannot read user B's data or tickets.
- Live-Jira check (developer-only, optional): `npm run jira:smoke`, driven by
  `local/jira-credentials.json`. **That file is read solely by the smoke script;
  the running service never reads it** — live credentials come from HTTP
  requests at `/app/jira/connect`.

---

## 15. The main service — what it actually is

The confirmed scope is narrow: **one Jira integration service** with a thin UI
and a thin REST API. There is no second domain, no admin tier, no ingestion
pipeline. The service is a **Jira integration gateway**:

1. Takes user credentials (API token or OAuth) and stores them securely.
2. Makes Jira API calls on the user's behalf: create tickets, list projects,
   list the 10 most recent app-created tickets.
3. Exposes a UI for humans (session + CSRF) and a REST endpoint for machines
   (API key).

Everything else in the assignment ("identity management platform") is context,
not deliverable scope.

### Why that means modular monolith, decisively

Read the requirements against the "when microservices pay off" triggers:

| Requirement                         | Maps to                | Separate service?   |
| ----------------------------------- | ---------------------- | ------------------- |
| Login/logout/sessions               | ~50 lines + middleware | No                  |
| Jira connection (OAuth + API token) | one module             | No — it is the core |
| Create NHI finding ticket           | one module method      | No                  |
| Recent tickets view                 | one module read        | No                  |
| REST endpoint for scanners          | one route              | No                  |
| Security / tenancy                  | cross-cutting          | N/A                 |

There is no second service hiding here. The UI is a presentation layer that
shares the exact same business logic as the API. Splitting for its own sake
adds network hops, CORS/CSRF complications, two auth cookies, two health
checks, and deploy coordination — all for zero new capability.

**Decision: one Node service, modular monolith, with strong `src/modules/*`
boundaries.** The `src/api/` and `src/web/` transport layers are kept strictly
separate (the "clear separation between UI and backend layers" the assignment
grades on), but they delegate to the same modules. Extracting a module into a
real microservice later is mechanical: move folder → new repo → swap an
in-process call for an HTTP call. We pay module-boundary cost now (small),
defer service-split cost until a second client or scaling profile exists (never
in this scope).

---

## 16. Open Questions Still Outstanding

1. **Fastify vs NestJS** — **postponed** by user. Will decide when we hit the
   first real routing/validation task. (CONTEXT.md §4.2 already has the
   comparison so the choice is informed when we make it.)
2. **OIDC SSO wiring** — **postponed** by user (user: "I'll ask this
   tomorrow"). Demo default is local email+password (confirmed); §10 documents
   the OIDC hook. The assignment's emphasis is isolation + session hygiene,
   not SSO.
3. ~~Deployment shape~~ — **resolved: modular monolith** (§15).
4. ~~Database~~ — **resolved: Postgres + SQLite via Prisma** datasource
   switch.
5. ~~Connection semantics~~ — **resolved (locked): exactly one Jira connection
   per user**; each user's calls ride their own Jira quota. Decision log:
   - One connection = one Jira workspace/site; a site contains many projects, so
     requirement #2 ("select a Jira project from their connected workspace") is a
     project-pick inside the user's single connection — no connection picker.
   - Attribution in Jira is by per-user auth: Jira Cloud sets `reporter` to the
     authenticated account and offers no "on-behalf-of", so the truthy "who
     created this" is the user's own connection. Our `tickets_cache` and
     `audit_log` record `creator_user_id`/`user_id` for local attribution too.
   - Automation (REST, §9 API keys) rides the API-key owner's connection; an
     autonomous process is a **bot/svc user** with its own Jira service-account
     link + API key — the standard pattern, so no shared/tenant connection is
     needed. Entry-point is the same `jira_connections` table.
   - **Deferred / non-goals**: multiple connections per user (needs a second
     Jira site per person — later: relax the `user_id UNIQUE` constraint and
     re-key `tickets_cache` on `connection_id`); shared/tenant-level connections
     (later: `owner_user_id NULL` + tenant default). Model was deliberately kept
     at the simple form; the multi-connection exploration (§16.5 discussion)
     was reverted for scope.
6. **In-app Jira quota token bucket** (mirror Jira's ~100/min per user so we
   self-throttle before Jira rejects) — optional. **Default decision: DEFER.**
   Honoring 429/`Retry-After` + the §11.1 read caches are enough for this
   scope; revisit only if a reviewer scenario asks for sub-429 throttling.

### 16.1 Decomposition notes (superseded by §15)

Decision made: **modular monolith** (see §15). Left here as the reasoning
record for reviewers.

Premature decomposition is a real cost. For this scope the value of separate
services is low and the cost (network hops, shared auth/CORS, two health
checks, two deploys, trace stitching) is real.

- Independent deploy cadence: n/a — one team, one deploy.
- Different scaling profiles: n/a — uniform load (humans + scanners).
- Different ownership / polyglot: n/a — single language, single author.
- Failure isolation: n/a at this size.

The `auth` module should never be split out before there is a _second client_.
Cost: per-request network hop + secret plumbing + clock-skew on token expiry.
Defer until it hurts.

The clean `src/modules/*` boundaries (auth, jira, api-keys, tickets) are the
design contract that makes a future extraction mechanical.

---

## 17. Next Step

We serve the UI from the same monolith process — React/Vite SPA built to
static assets and served by Nest (`useStaticAssets`), dev via Vite proxy
(Option A in §6). Implement in vertical slices. **Slices 1–3 are the graded
core (§7.1 invariants); Jira features (4–7) are modeled for a single user and
"just work" once identity is airtight.**

Slices 1–6 are **implemented, tested, and committed**. State as of the
recent-tickets cache + client-hardening commits (`3ee218a`, `ecdc32d`):

1. ✅ Repo skeleton: NestJS app + Prisma + config (zod env) + crypto + logging +
   `client/` Vite scaffold (proxy wired, placeholder page).
2. ✅ Tenants + users + signup (mode = open for demo).
3. ✅ **Identity core**: session manager (rotation, idle+absolute), login/logout,
   CSRF, rate-limit, helmet — proving every §7.1 invariant. React pages for
   login/signup wired against it.
4. ✅ Jira client + connect (API-token only — OAuth **skipped** by product
   decision), projects with 60s per-user cache; client hardened (10s
   connect/30s response timeouts, retry 2x on GET 5xx/timeout, never on POST;
   `cloud_id` stored from `serverInfo`). Issue #4 closed.
5. ✅ Create-ticket UI API + React form + ADF; **writes `tickets_cache`** on
   success (write-through). REST endpoint moved to #12.
6. ✅ **Recent-tickets read model**: cache-first via `tickets_cache` (TTL
   60s default, `JIRA_CACHE_TTL_MS`), async stale-good background refresh with
   warning-only failures, `?refresh=true` forces a live JQL call, prune on
   sync. All cache queries tenant-scoped (cross-tenant isolation tested).
   REST endpoint moved to #12.
7. ⏳ **Next slice**: apply the `ticketCreateUi`/`ticketCreateApi` throttles to
   the create/recent routes (currently global default), then API keys (issue
   **#7**) + the REST surface (issue **#12**: `POST /api/v1/tickets` and
   `GET /api/v1/tickets/recent` behind `ApiKeyGuard`).
8. ⏳ README + design-decisions doc; reviewer distribution via Docker image
   (tracked as GitHub issue #11).
