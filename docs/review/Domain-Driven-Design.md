# Domain-Driven Design

The core business domain of IdentityHub — entities, value objects, aggregates, invariants, and the ubiquitous language.

---

## Bounded Contexts

The system is organized into five bounded contexts, each owning its own persistence and business rules:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         IdentityHub                                 │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  Identity     │  │  Session     │  │  Jira Integration        │ │
│  │              │  │  Management  │  │                           │ │
│  │  Tenant      │  │              │  │  JiraConnection          │ │
│  │  User        │  │  Session     │  │  TicketCache             │ │
│  │  ApiKey      │  │              │  │  JiraClient (infra)      │ │
│  └──────────────┘  └──────────────┘  └───────────────────────────┘ │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐                                │
│  │  Scanner     │  │  Audit       │                                │
│  │  Domain      │  │              │                                │
│  │              │  │  AuditLog    │                                │
│  │  Item        │  │  (cross-     │                                │
│  │              │  │   context)   │                                │
│  └──────────────┘  └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

Each context enforces tenant isolation through the same mechanism: `tenantId` derived from the authenticated principal, filtered at the SQL layer.

---

## Ubiquitous Language

| Term               | Definition                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Tenant**         | An organizational boundary. All data is scoped to a tenant. A tenant owns users, API keys, items, and Jira connections.    |
| **Slug**           | URL-safe unique identifier for a tenant (e.g., `acme-corp`). Immutable after creation.                                     |
| **User**           | A human principal. Belongs to exactly one tenant. Authenticates via email + password → session cookie.                     |
| **Session**        | A server-side credential for browser users. One active session per login. Bounded by idle and absolute TTLs.               |
| **API Key**        | A machine-facing credential. Bounded to one tenant. Optionally scoped to specific Jira project keys.                       |
| **Item**           | A security/identity finding discovered by a scanner. The core unit of work — something that needs triage or a Jira ticket. |
| **Scanner**        | An external system that produces Items. Identified by a string name (e.g., `oasis-iam-scanner`).                           |
| **Severity**       | Urgency of an Item: `info` < `low` < `medium` < `high` < `critical`.                                                       |
| **Status**         | Lifecycle state of an Item: `new` → `jira-ticket` or `new` → `closed`.                                                     |
| **JiraConnection** | Encrypted credentials linking a principal (User or API Key) to a Jira Cloud instance.                                      |
| **TicketCache**    | Local cache of Jira issues recently created or viewed by a principal. Stale-while-revalidate.                              |
| **Principal**      | Either a User (browser session) or an API Key (machine caller). Both resolve to a single `tenantId`.                       |

---

## Aggregates

### Tenant (Aggregate Root)

The top-level boundary. Every other entity is scoped to a tenant.

```
┌─────────────────────────────────────┐
│  Tenant                             │
│  ───────                             │
│  id: string (cuid, PK)             │
│  slug: string (unique, immutable)  │
│  name: string                      │
│  created_at: DateTime              │
└─────────────────────────────────────┘
```

**Source:** [`prisma/schema.prisma:10-15`](../../prisma/schema.prisma#L10), [`src/modules/tenants/tenant.repository.ts`](../../src/modules/tenants/tenant.repository.ts)

**Invariants:**

- Slug is globally unique.
- Slug matches `^[a-z0-9]+(-[a-z0-9]+)*$` — lowercase alphanumeric with single-hyphen separators.
- Slug and name have max lengths (50 and 80 chars respectively).

**Relationships:** Has many Users, API Keys, Items, JiraConnections, TicketCache, AuditLogs.

---

### User (Entity within Tenant Aggregate)

A human principal. Email is globally unique (cross-tenant constraint — a design decision for this demo).

```
┌─────────────────────────────────────┐
│  User                               │
│  ────                               │
│  id: string (cuid, PK)             │
│  tenant_id: string → Tenant        │
│  email: string (global unique)     │
│  name: string?                     │
│  password_hash: string (bcrypt)    │
│  created_at: DateTime              │
└─────────────────────────────────────┘
```

**Source:** [`prisma/schema.prisma:17-24`](../../prisma/schema.prisma#L17), [`src/modules/users/user.repository.ts`](../../src/modules/users/user.repository.ts)

**Invariants:**

- Email is globally unique — not just per-tenant.
- Password is bcrypt-hashed (cost 12) before storage. Raw password never persisted.
- A User belongs to exactly one Tenant for its lifetime (no transfer).

**Relationships:**

- Belongs to Tenant (via `tenant_id`).
- Has many Sessions (active: at most one at a time; historical: deleted on login).
- Has zero or one JiraConnection (via `user_id` unique).
- Has many AuditLog entries (via `user_id`).

---

### ApiKey (Entity within Tenant Aggregate)

A machine-facing credential. The raw key is shown once at creation and never retrievable.

```
┌─────────────────────────────────────┐
│  ApiKey                             │
│  ──────                             │
│  id: string (cuid, PK)             │
│  tenant_id: string → Tenant        │
│  name: string                      │
│  key_hash: string (SHA-256, UQ)    │
│  allowed_project_keys: string?     │  ← JSON array, nullable
│  created_at: DateTime              │
│  last_used_at: DateTime?           │
│  revoked_at: DateTime?             │  ← soft revoke
└─────────────────────────────────────┘
```

**Source:** [`prisma/schema.prisma:39-48`](../../prisma/schema.prisma#L39), [`src/modules/api-keys/api-keys.repository.ts`](../../src/modules/api-keys/api-keys.repository.ts)

**Invariants:**

- Raw key is 32 random bytes, base64url-encoded. Only the SHA-256 hash is stored.
- Revocation is soft (`revoked_at` timestamp) — the row stays in the DB.
- `allowed_project_keys` is an optional JSON array of Jira project key strings (max 50). When set, the key can only create tickets in those projects.
- Each API key gets its own rate-limit bucket (`api-key:{id}`).

**Relationships:**

- Belongs to Tenant.
- Has zero or one JiraConnection (via `api_key_id` unique).
- Has many TicketCache entries (via `api_key_id`).

---

### Session (Value Object / Transient Entity)

A server-side browser credential. Not an aggregate root — it exists only as a child of User.

```
┌─────────────────────────────────────┐
│  Session                            │
│  ───────                            │
│  id: string (cuid, PK)             │
│  user_id: string → User            │
│  token_hash: string (SHA-256, UQ)  │
│  ip: string?                       │
│  user_agent: string?               │
│  created_at: DateTime              │
│  last_seen_at: DateTime            │  ← refreshed on resolve
│  expires_idle_at: DateTime         │  ← sliding window
│  expires_absolute_at: DateTime     │  ← hard cap
│  rotated_from_id: string?          │  ← audit chain
└─────────────────────────────────────┘
```

**Source:** [`prisma/schema.prisma:26-37`](../../prisma/schema.prisma#L26), [`src/infra/session.ts`](../../src/infra/session.ts)

**Invariants:**

- One active session per user at a time — login deletes all prior sessions (fixation prevention).
- Token is a random 32-byte value. Only its SHA-256 hash is in the DB.
- Idle timeout (30 min default) resets on each `resolve()` call. Absolute timeout (12 h) never extends.
- If either timeout is exceeded, the session row is deleted.
- `rotated_from_id` chains to the previous session for audit purposes.

**Not tenant-scoped:** Sessions reference `user_id`, which already belongs to exactly one tenant. Adding `tenant_id` would be redundant.

---

### Item (Aggregate Root within Tenant)

The core unit of work — a security finding produced by a scanner that needs triage.

```
┌─────────────────────────────────────┐
│  Item                               │
│  ────                               │
│  id: string (cuid, PK)             │
│  tenant_id: string → Tenant        │
│  scanner: string                   │  ← e.g. "oasis-iam-scanner"
│  item_type: string                 │  ← e.g. "expired_credentials"
│  title: string                     │
│  description: string?              │
│  severity: ItemSeverity            │  ← info|low|medium|high|critical
│  status: ItemStatus                │  ← new|closed|jira-ticket
│  jira_key: string?                 │  ← set when linked to Jira
│  jira_url: string?                 │  ← set when linked to Jira
│  created_at: DateTime              │
│  updated_at: DateTime              │
└─────────────────────────────────────┘

  @@index([tenant_id, status])
  @@index([tenant_id, severity])
```

**Source:** [`prisma/schema.prisma:99-115`](../../prisma/schema.prisma#L99), [`src/modules/items/item.repository.ts`](../../src/modules/items/item.repository.ts), [`src/modules/items/item.service.ts`](../../src/modules/items/item.service.ts)

#### Status State Machine

```
         ┌──────────┐
         │   new    │  ← initial state
         └────┬─────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌─────────┐      ┌────────────┐
│ closed  │      │ jira-ticket│
└─────────┘      └────────────┘
   manual           programmatic
   update           (linkTicket)
```

**Invariants:**

- Manual updates can only set `status` to `'new'` or `'closed'`. The `'jira-ticket'` status is set exclusively by `linkTicket()` when a Jira ticket is created.
- `jira_key` and `jira_url` are populated atomically with the status change to `'jira-ticket'`.
- Items are seed-on-first-access: if a tenant has zero items, `ensureSeed()` inserts 5 sample items.

#### Item Types (from scanner templates)

| Type                          | Meaning                                       |
| ----------------------------- | --------------------------------------------- |
| `service_identity_unused`     | Unused service account detected               |
| `expired_credentials`         | Credentials past their expiry date            |
| `overprivileged_api_key`      | API key with excessive permissions            |
| `rotated_token`               | Token was rotated but old one still active    |
| `weak_credentials`            | Password doesn't meet complexity requirements |
| `sensitive_scope`             | OAuth scope includes sensitive permissions    |
| `idle_cli_token`              | CLI token hasn't been used recently           |
| `public_repo_secret`          | Secret found in a public repository           |
| `unattended_service_identity` | Service identity with no owner                |

**Source:** [`item.service.ts:55-112`](../../src/modules/items/item.service.ts#L55)

#### Severity Distribution (random generation)

```
info    ░░░░░░░░░░░░░░░░░░░░  0%  (never randomly selected)
low     ████████████████░░░░░  25%
medium  ████████████████████░  37.5%
high    ████████████████░░░░░  25%
critical████████░░░░░░░░░░░░░  12.5%
```

**Source:** [`item.service.ts:175-187`](../../src/modules/items/item.service.ts#L175)

---

### JiraConnection (Value Object / Entity within Tenant)

Encrypted credentials linking a principal to a Jira Cloud instance. One connection per principal.

```
┌─────────────────────────────────────┐
│  JiraConnection                     │
│  ─────────────                      │
│  id: string (cuid, PK)             │
│  tenant_id: string → Tenant        │
│  user_id: string? (unique)         │  ← mutually exclusive
│  api_key_id: string? (unique)      │  ← with user_id
│  mode: 'api_token' | 'oauth'       │
│  cloud_id: string?                 │
│  site_url: string?                 │
│  email: string?                    │
│  api_token_cipher: string?         │  ← AES-256-GCM ciphertext
│  api_token_nonce: string?          │  ← AES-256-GCM nonce
│  access_token_cipher: string?      │  ← (OAuth, reserved)
│  access_token_nonce: string?       │
│  refresh_token_cipher: string?     │
│  refresh_token_nonce: string?      │
│  oauth_expires_at: DateTime?       │
│  oauth_scopes: string?             │
│  created_at: DateTime              │
│  updated_at: DateTime              │
└─────────────────────────────────────┘
```

**Source:** [`prisma/schema.prisma:50-69`](../../prisma/schema.prisma#L50), [`src/modules/jira/jira.repository.ts`](../../src/modules/jira/jira.repository.ts)

**Invariants:**

- Exactly one of `user_id` or `api_key_id` is set (mutual exclusion via unique constraints).
- API tokens are AES-256-GCM encrypted with a key derived from `APP_SECRET`. The raw token is never stored in plaintext.
- Connection is validated live against Jira (calls `getMyself()` + `serverInfo()`) before persisting.
- HTTPS is enforced — non-HTTPS site URLs are rejected.
- Upsert semantics: connecting again replaces the existing connection for that principal.

**Relationships:**

- Belongs to Tenant.
- Belongs to either a User or an API Key (one-to-one).

---

### TicketCache (Entity within Tenant)

Local cache of Jira issues. Scoped per principal (user or API key), not just per tenant.

```
┌─────────────────────────────────────┐
│  TicketCache                        │
│  ────────────                       │
│  id: string (cuid, PK)             │
│  tenant_id: string → Tenant        │
│  user_id: string?                  │  ← one or the other
│  api_key_id: string?               │  ← is set
│  jira_site: string                 │  ← Jira instance origin
│  project_key: string               │
│  issue_key: string                 │  ← e.g. "OASIS-42"
│  title: string                     │
│  url: string                       │
│  jira_created_at: DateTime         │
│  reconciled_at: DateTime?          │  ← last sync timestamp
└─────────────────────────────────────┘

  @@unique([user_id, jira_site, project_key, issue_key])
  @@unique([api_key_id, jira_site, project_key, issue_key])
```

**Source:** [`prisma/schema.prisma:71-86`](../../prisma/schema.prisma#L71), [`src/modules/jira/jira.repository.ts`](../../src/modules/jira/jira.repository.ts)

**Invariants:**

- Compound unique constraints prevent duplicate tickets per principal per Jira instance per project.
- Sync is transactional: `syncRecentTickets()` upserts current issues and deletes stale ones in a single Prisma transaction.
- Stale-while-revalidate: returns cached data immediately if available; background refresh if stale.

---

### AuditLog (Event Log)

Append-only log of every state change. Not an aggregate root — a cross-cutting event stream.

```
┌─────────────────────────────────────┐
│  AuditLog                           │
│  ─────────                          │
│  id: string (cuid, PK)             │
│  tenant_id: string → Tenant        │
│  user_id: string                   │  ← the actor
│  action: AuditAction               │
│  target: string                    │  ← entity ID, email, or composite
│  ip: string?                       │
│  user_agent: string?               │
│  at: DateTime                      │
└─────────────────────────────────────┘
```

**Source:** [`prisma/schema.prisma:88-97`](../../prisma/schema.prisma#L88), [`src/infra/audit.ts`](../../src/infra/audit.ts)

#### Tracked Actions

| Action                 | Target Format       | Context              |
| ---------------------- | ------------------- | -------------------- |
| `signup`               | email               | User registration    |
| `login`                | email               | Successful login     |
| `logout`               | email               | Session destruction  |
| `jira_connect`         | site origin URL     | Credentials stored   |
| `jira_connection_test` | site origin URL     | Live connection test |
| `jira_disconnect`      | `"jira_connection"` | Credentials removed  |
| `jira_ticket_create`   | Jira issue key      | Ticket created       |
| `api_key_create`       | API key ID          | Key minted           |
| `api_key_revoke`       | API key ID          | Key revoked          |
| `item_generate`        | Item ID             | Random item created  |
| `item_status_update`   | `"itemId:status"`   | Status changed       |
| `item_ticket_create`   | `"itemId::jiraKey"` | Jira linked to item  |

**Source:** [`audit.ts:5-28`](../../src/infra/audit.ts#L5)

---

## Entity Relationship Map

```
                          ┌──────────┐
                          │  Tenant  │
                          │──────────│
                          │ id (PK)  │
                          │ slug (UQ)│
                          │ name     │
                          └────┬─────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
     │    User     │   │   ApiKey    │   │    Item     │
     │─────────────│   │─────────────│   │─────────────│
     │ tenant_id   │   │ tenant_id   │   │ tenant_id   │
     │ email (UQ)  │   │ key_hash(UQ)│   │ scanner     │
     │ password_   │   │ allowed_    │   │ item_type   │
     │   hash      │   │ project_keys│   │ severity    │
     └──────┬──────┘   └──────┬──────┘   │ status      │
            │                  │          │ jira_key?   │
     ┌──────┼──────┐    ┌─────┼─────┐    └─────────────┘
     │      │      │    │           │
     ▼      ▼      ▼    ▼           ▼
┌────────┐ ┌────┐ ┌────────────┐ ┌────────────┐
│Session │ │Audit│ │JiraConnect│ │TicketCache │
│        │ │Log  │ │           │ │            │
│user_id │ │     │ │ user_id?  │ │ user_id?   │
│token_  │ │     │ │ api_key_  │ │ api_key_id?│
│ hash   │ │     │ │   id?     │ │ issue_key  │
└────────┘ └─────┘ │ api_token_│ └────────────┘
                    │  cipher   │
                    └───────────┘

  ──── FK / ownership
  ···· Soft link (not a FK)
```

**Cross-aggregate reference:** Items link to Jira via `jira_key` / `jira_url` strings — not a foreign key. This is intentional: the Jira ticket lives in an external system; IdentityHub only stores the reference.

---

## Value Objects

These are immutable, structurally equal values with no identity:

| Value Object         | Type                                                        | Defined In                                                                        |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ItemSeverity`       | `'info' \| 'low' \| 'medium' \| 'high' \| 'critical'`       | [`validation.ts:190`](../../src/app/validation.ts#L190)                           |
| `ItemStatus`         | `'new' \| 'closed' \| 'jira-ticket'`                        | [`validation.ts:189`](../../src/app/validation.ts#L189)                           |
| `JiraConnectionMode` | `'api_token' \| 'oauth'`                                    | [`jira.repository.ts:4`](../../src/modules/jira/jira.repository.ts#L4)            |
| `JiraPrincipal`      | `{ kind: 'user', userId } \| { kind: 'api_key', apiKeyId }` | [`jira.repository.ts:6-7`](../../src/modules/jira/jira.repository.ts#L6)          |
| `SessionUser`        | `{ id, email, tenantId, tenantName }`                       | [`infra/session.ts:7-12`](../../src/infra/session.ts#L7)                          |
| `ApiKeyIdentity`     | `{ id, tenantId, allowedProjectKeys }`                      | [`api-keys/request.types.ts:3-7`](../../src/modules/api-keys/request.types.ts#L3) |
| `AuditAction`        | String enum (21 values)                                     | [`audit.ts:5-28`](../../src/infra/audit.ts#L5)                                    |
| `AuditEvent`         | `{ tenantId, userId, action, target, ip?, userAgent? }`     | [`audit.ts:32-39`](../../src/infra/audit.ts#L32)                                  |

---

## Domain Events (Audit Trail)

Every state change emits an `AuditEvent` written to `audit_log`. These are the domain events of the system:

```
Identity Context          Session Context         Jira Context
─────────────────         ───────────────         ────────────
SIGNUP                    LOGIN                   JIRA_CONNECT
                          LOGOUT                  JIRA_DISCONNECT
                                                  JIRA_CONNECTION_TEST
                                                  JIRA_TICKET_CREATE

Scanner Context           ApiKey Context
───────────────           ─────────────
ITEM_GENERATE             API_KEY_CREATE
ITEM_STATUS_UPDATE        API_KEY_REVOKE
ITEM_TICKET_CREATE
```

Events are **not** published to a message bus — they are written synchronously to the `audit_log` table. The `target` field encodes the affected entity's identity, with a format that varies by action type (see [AuditLog section](#auditlog-event-log)).

---

## Cryptographic Primitives

All cryptography is centralized in [`src/infra/crypto.ts`](../../src/infra/crypto.ts):

| Primitive                             | Algorithm                           | Purpose                                                  |
| ------------------------------------- | ----------------------------------- | -------------------------------------------------------- |
| `hashPassword()` / `verifyPassword()` | bcrypt, cost 12                     | User password storage                                    |
| `sha256Hex()`                         | SHA-256                             | Session tokens, API key hashes                           |
| `sealSecret()` / `openSecret()`       | AES-256-GCM (key from `APP_SECRET`) | Jira API token encryption at rest                        |
| `randomBytes()`                       | `crypto.randomBytes`                | Session tokens, API key generation                       |
| `safeEqual()`                         | `timingSafeEqual`                   | Constant-time string comparison (CSRF, anti-enumeration) |

---

## Validation as Domain Rules

All input constraints are defined in [`src/app/validation.ts`](../../src/app/validation.ts) as Zod schemas. These are the single source of truth for field bounds and format rules:

| Constraint         | Value                                  | Enforced By                                       |
| ------------------ | -------------------------------------- | ------------------------------------------------- |
| Password length    | 8–128 chars                            | `signupSchema`, `loginSchema`, `userCreateSchema` |
| Tenant slug        | 1–50 chars, `^[a-z0-9]+(-[a-z0-9]+)*$` | `tenantSlugSchema` (custom validator)             |
| Tenant name        | 1–80 chars                             | `tenantNameSchema`                                |
| Email              | valid email, max 255 chars             | `signupSchema`, `userCreateSchema`                |
| Project key        | 1–10 chars, `^[A-Z][A-Z0-9]{1,9}$`     | `projectKeySchema`                                |
| Ticket title       | 1–255 chars                            | `ticketCreateSchema`                              |
| Ticket description | 1–30,000 chars                         | `ticketCreateSchema`                              |
| API key name       | 1–64 chars                             | `apiKeyCreateSchema`                              |
| Allowed projects   | max 50 keys                            | `apiKeyCreateSchema`                              |
| Item type          | 1–64 chars                             | `item schemas`                                    |
| Items query limit  | 1–50, default 10                       | `itemsQuerySchema`                                |

---

## Two Authentication Paths

Both paths resolve to a `tenantId` that flows identically through the service/repository layers:

```
┌──────────────────────────────────────────┐
│  Browser (Session)                       │
│                                          │
│  Cookie: sid=<token>                     │
│       │                                  │
│       ▼                                  │
│  SessionGuard                            │
│    hash(token) → lookup session row      │
│    → fetch user → fetch tenant           │
│    → request.tenantId = user.tenant_id   │
│                                          │
│  Used by: /app/items, /app/jira,         │
│           /app/api-keys, /app/auth       │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  Machine (API Key)                       │
│                                          │
│  Header: Authorization: Bearer <key>     │
│       │                                  │
│       ▼                                  │
│  ApiKeyGuard                             │
│    SHA-256(key) → lookup api_keys row    │
│    → request.apiKey.tenantId             │
│       = row.tenant_id                    │
│                                          │
│  Used by: /v1/tickets                    │
└──────────────────────────────────────────┘
```

**Key difference:** API key requests skip CSRF protection (they are not browser-submitted) and have per-key rate limiting instead of per-IP.

---

## Design Decisions

| Decision                               | Rationale                                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared DB, row-level isolation**     | Simpler than separate schemas or database-per-tenant for a demo/SaaS system. Scales horizontally with `tenant_id` indexes.                                                    |
| **Email globally unique**              | Simplifies the domain for this demo. In a production multi-tenant system, email uniqueness would likely be per-tenant.                                                        |
| **No tenant switching**                | A credential is bound to one tenant. Prevents accidental cross-tenant access. Switching requires re-authentication.                                                           |
| **Soft link to Jira (string FK)**      | Items reference Jira tickets via `jira_key`/`jira_url` strings, not foreign keys. Jira is an external system; IdentityHub doesn't own those rows.                             |
| **Stale-while-revalidate for tickets** | Jira API calls are slow. Returning cached data immediately with a background refresh improves perceived latency.                                                              |
| **One session per user**               | Login deletes all prior sessions. Prevents session fixation and limits blast radius of compromised credentials.                                                               |
| **Admin as a separate context**        | Admin operations (tenant/user CRUD) cross tenant boundaries intentionally. They live behind `AdminGuard` + `ALLOW_ADMIN` and are the only exception to the tenant-first rule. |
