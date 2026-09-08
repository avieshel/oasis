# Tenancy Model

How IdentityHub isolates data between tenants — shared database, row-level isolation.

---

## Overview

IdentityHub uses **shared-database, row-level tenancy** (discriminator-based multi-tenancy). Every domain table carries a `tenant_id` column. The value is **never** provided by the client — it is derived from the authenticated principal (session cookie or API key) and injected server-side at the guard layer.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Postgres Database                        │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ tenants  │    │  users   │    │  items   │    │  ...     │  │
│  │──────────│    │──────────│    │──────────│    │──────────│  │
│  │ id    PK │◄───│ tenant_id│◄───│ tenant_id│◄───│ tenant_id│  │
│  │ slug     │    │ email    │    │ title    │    │          │  │
│  │ name     │    │ ...      │    │ ...      │    │          │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                                 │
│  Every query includes: WHERE tenant_id = <derived-from-credential> │
└─────────────────────────────────────────────────────────────────┘
```

**What's NOT tenant-scoped:**

- `sessions` — keyed by `user_id`, which already belongs to exactly one tenant
- `tenants` itself — the list of all tenants (admin-only)

---

## Key Files

| File                                                                                               | Role                                                                         |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`prisma/schema.prisma`](../../prisma/schema.prisma)                                               | Schema: `tenants` model, `tenant_id` on all domain tables                    |
| [`src/modules/tenants/tenant.repository.ts`](../../src/modules/tenants/tenant.repository.ts)       | Tenant CRUD: create, createWithSlug, findById, findBySlug                    |
| [`src/modules/auth/session.guard.ts`](../../src/modules/auth/session.guard.ts)                     | `SessionGuard` — extracts `tenantId` from session → `request.tenantId`       |
| [`src/modules/auth/auth.decorator.ts`](../../src/modules/auth/auth.decorator.ts)                   | `@CurrentTenantId()` decorator                                               |
| [`src/modules/api-keys/api-key.guard.ts`](../../src/modules/api-keys/api-key.guard.ts)             | `ApiKeyGuard` — extracts `tenantId` from API key → `request.apiKey.tenantId` |
| [`src/modules/users/user.service.ts`](../../src/modules/users/user.service.ts)                     | Signup: tenant creation/selection logic                                      |
| [`src/modules/admin/admin.repository.ts`](../../src/modules/admin/admin.repository.ts)             | Admin: cascade delete across all tenant-scoped tables                        |
| [`src/modules/items/item.repository.ts`](../../src/modules/items/item.repository.ts)               | Canonical example of tenant-scoped queries                                   |
| [`src/modules/jira/jira.repository.ts`](../../src/modules/jira/jira.repository.ts)                 | Jira connections/tickets scoped by `tenant_id`                               |
| [`src/modules/api-keys/api-keys.repository.ts`](../../src/modules/api-keys/api-keys.repository.ts) | API keys scoped by `tenant_id`                                               |
| [`src/infra/audit.ts`](../../src/infra/audit.ts)                                                   | Audit log — every event includes `tenant_id`                                 |
| [`src/app/validation.ts`](../../src/app/validation.ts)                                             | Zod schemas: `tenantCreateSchema`, `tenantUpdateSchema`, `signupSchema`      |

---

## Tenant Creation

Tenants are created through three paths:

```
                        ┌─────────────────────┐
                        │   Signup (public)    │
                        │  POST /app/signup    │
                        └─────────┬───────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                 ▼
          tenant_id          new_tenant          (neither)
          provided?          provided?           auto-create
                 │                │                 │
                 ▼                ▼                 ▼
          Join existing     Create with         Create from
            tenant          slug + name        email prefix
                 │                │                 │
                 └────────────────┼─────────────────┘
                                  ▼
                         INSERT user with
                           tenant_id
```

```
┌──────────────────────┐         ┌───────────────────────┐
│   Admin (internal)   │         │   Seed Script (dev)   │
│  POST /admin/tenants │         │  npx tsx seed-demo.ts │
└──────────┬───────────┘         └──────────┬────────────┘
           │                                │
           ▼                                ▼
    AdminService.createTenant()      Upsert tenants
    (requires session + flag)        + users
```

**Code:** [`user.service.ts:23`](../../src/modules/users/user.service.ts#L23), [`admin.service.ts:51`](../../src/modules/admin/admin.service.ts#L51), [`seed-demo.ts`](../../src/scripts/seed-demo.ts)

---

## Isolation Architecture (4 Layers)

Tenant isolation is enforced at **four distinct layers** — defense in depth. If any layer is bypassed, the next one catches it.

```
Layer 1: GUARDS               Layer 2: DECORATORS
Extract tenantId from         Expose tenantId to
credentials (DB lookup)       controller parameters
┌─────────────────────┐      ┌────────────────────────┐
│ SessionGuard         │      │ @CurrentTenantId()     │
│   request.tenantId = │ ───► │   extracts request.    │
│   session.user.      │      │   tenantId             │
│   tenantId           │      └───────────┬────────────┘
│                      │                  │
│ ApiKeyGuard          │                  ▼
│   request.apiKey.    │      Layer 3: SERVICES
│   tenantId =         │      tenantId as first argument
│   row.tenant_id      │      ┌────────────────────────┐
└─────────────────────┘      │ itemService.list(      │
                              │   tenantId, query)     │
                              └───────────┬────────────┘
                                          │
                                          ▼
                              Layer 4: REPOSITORIES
                              tenant_id in every SQL WHERE
                              ┌────────────────────────┐
                              │ prisma.oasis_items.    │
                              │   findMany({           │
                              │     where: {           │
                              │       tenant_id: id,   │
                              │       ...filters       │
                              │     }                  │
                              │   })                   │
                              └────────────────────────┘
```

### Layer 1: Guards (credential → tenantId)

The client **never** passes `tenantId`. It is derived from the database:

**Session-based (browser):**

```typescript
// src/modules/auth/session.guard.ts:26
request.tenantId = session.user.tenantId;
// ↑ comes from SessionManager.resolve() → DB lookup → toSessionUser()
```

**API key-based (machine):**

```typescript
// src/modules/api-keys/api-key.guard.ts:43
request.apiKey = {
  id: row.id,
  tenantId: row.tenant_id,    // ← from api_keys.tenant_id column
  ...
};
```

### Layer 2: Decorators (request → controller)

```typescript
// src/modules/auth/auth.decorator.ts:11
export const CurrentTenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    return context.switchToHttp().getRequest<RequestWithSession>().tenantId;
  },
);
```

Controllers use `@CurrentTenantId()` — they never read `tenantId` from body, query, or path params.

### Layer 3: Services (tenantId flows through)

Every service method takes `tenantId` as its **first argument**:

```typescript
// src/modules/items/item.service.ts
list(tenantId: string, query: ItemsQuery) { ... }
create(tenantId: string, input: CreateItemInput) { ... }
updateStatus(tenantId: string, id: string, status: string) { ... }
```

### Layer 4: Repositories (SQL-level filter)

Every query includes `tenant_id` in the Prisma `where` clause:

```typescript
// src/modules/items/item.repository.ts:37
async findMany(tenantId: string, filters: ItemFilters) {
  return this.prisma.oasis_items.findMany({
    where: {
      tenant_id: tenantId,           // ← hard filter
      ...(filters.status !== undefined ? { status: filters.status } : {}),
    },
  });
}

// src/modules/items/item.repository.ts:111
async findById(tenantId: string, id: string) {
  return this.prisma.oasis_items.findFirst({
    where: { tenant_id: tenantId, id },   // ← both required
  });
}
```

Even if a bug skipped layers 1-3, the SQL query would still filter by `tenant_id`. There is no code path that reads cross-tenant data.

---

## Data Model

### Tenants Table

```sql
tenants
├── id          VARCHAR  PK (cuid)
├── slug        VARCHAR  UNIQUE (URL-safe identifier)
├── name        VARCHAR  (display name)
└── created_at  TIMESTAMP
```

**Code:** [`prisma/schema.prisma`](../../prisma/schema.prisma) — `tenants` model

### Tenant-Scoped Domain Tables

Every domain table carries `tenant_id`:

```
tenants ─────────────────────────────────────────────────────┐
                                                             │
  users              tenant_id → tenants.id                  │
  api_keys           tenant_id → tenants.id                  │
  jira_connections   tenant_id → tenants.id                  │
  tickets_cache      tenant_id → tenants.id                  │
  audit_log          tenant_id → tenants.id                  │
  oasis_items        tenant_id → tenants.id                  │
                                                             │
  sessions           (no tenant_id — user_id already scoped) │
```

**Composite indexes** on high-traffic tables:

```sql
oasis_items(tenant_id, status)
oasis_items(tenant_id, severity)
```

**Unique constraints** prevent duplicate ticket cache entries per user/key:

```sql
tickets_cache(user_id, jira_site, project_key, issue_key)
tickets_cache(api_key_id, jira_site, project_key, issue_key)
```

---

## Two Principal Types, Same Tenant Boundary

Both human and machine principals are bound to a single tenant:

```
┌──────────────────────────────────────────────────────┐
│                    Session (browser)                 │
│                                                      │
│  Cookie: sid=<token>                                 │
│       │                                              │
│       ▼                                              │
│  SessionGuard → resolve → user.tenant_id → tenantId  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                   API Key (machine)                  │
│                                                      │
│  Header: Authorization: Bearer <key>                │
│       │                                              │
│       ▼                                              │
│  ApiKeyGuard → findByKeyHash → row.tenant_id          │
└──────────────────────────────────────────────────────┘
```

**No tenant switching:** A session or API key is bound to exactly one tenant at creation time. To access another tenant's data, the user must log in again or use a different API key.

**Code:** [`infra/session.ts:14`](../../src/infra/session.ts#L14) (`toSessionUser`), [`api-key.guard.ts`](../../src/modules/api-keys/api-key.guard.ts)

---

## Signup: Tenant Selection Flow

```
POST /app/signup
{
  email: "alice@acme.com",
  password: "s3cret",

  // ONE OF:
  tenant_id: "abc123",           // Option A: join existing
  // — OR —
  new_tenant: {                  // Option B: create new
    slug: "acme",
    name: "Acme Corp"
  }
  // — OR —
  // (neither) → Option C: auto-create from email prefix "alice"
}
```

**Code:** [`user.service.ts:23`](../../src/modules/users/user.service.ts#L23), [`validation.ts` signupSchema](../../src/app/validation.ts#L93)

---

## Tenant Deletion (Cascade)

Admin-initiated tenant deletion cascades across all scoped tables in a single transaction:

```
AdminService.deleteTenant(tenantId)
       │
       ▼
AdminRepository.deleteTenantCascaded(id)
       │
       ▼
  $transaction([
    sessions.deleteMany({ user_id: { in: [userIds] } }),
    api_keys.deleteMany({ tenant_id: id }),
    jira_connections.deleteMany({ tenant_id: id }),
    tickets_cache.deleteMany({ tenant_id: id }),
    audit_log.deleteMany({ tenant_id: id }),
    users.deleteMany({ tenant_id: id }),
    tenants.delete({ id }),
  ])
```

**Code:** [`admin.repository.ts:108`](../../src/modules/admin/admin.repository.ts#L108)

---

## Admin Module (Cross-Tenant Exception)

The admin module is the **only** place that operates across tenants. It is the documented exception to the tenant-first rule:

```
┌──────────────────────────────────────────────────────┐
│  Admin Module                                        │
│                                                      │
│  Guard: AdminGuard                                   │
│    ├── ALLOW_ADMIN env must be true                  │
│    └── SessionGuard must have resolved a session     │
│                                                      │
│  AdminRepository methods do NOT take tenantId        │
│  — they query across all tenants by design           │
│                                                      │
│  All mutations audit-logged with actor's tenantId    │
│  (the admin operator's own context)                  │
└──────────────────────────────────────────────────────┘
```

**Code:** [`admin.guard.ts`](../../src/modules/admin/admin.guard.ts), [`admin.repository.ts`](../../src/modules/admin/admin.repository.ts)

---

## tenantId Propagation Flow (End-to-End)

```
HTTP Request
     │
     │  (tenantId NOT in request — client never sends it)
     │
     ▼
Guard: SessionGuard / ApiKeyGuard
     │  Reads credential → looks up user/api_key in DB
     │  Sets request.tenantId from DB column
     │
     ▼
Controller: @CurrentTenantId()
     │  Extracts request.tenantId
     │  Injects as method parameter
     │
     ▼
Service: tenantId as first argument
     │  Business logic, passes to repository
     │
     ▼
Repository: tenant_id in Prisma where clause
     │  SQL-level isolation
     │
     ▼
Database: rows filtered by tenant_id
```

**Invariant:** `tenantId` is derived from the authenticated principal, never from client input. The two entry points that set it (`SessionGuard` line 26, `ApiKeyGuard` line 43) read from the database.

---

## Key Invariants

1. **Client never passes tenantId** — it is derived from the credential (session or API key) via DB lookup.
2. **Repository methods take tenantId first** — every query filters by `tenant_id` in SQL, not JavaScript.
3. **No tenant switching** — a credential is bound to one tenant for its lifetime.
4. **Two principal types, same boundary** — session users and API key holders both resolve to a single `tenantId`.
5. **Admin is the only cross-tenant surface** — behind `AdminGuard` + `ALLOW_ADMIN` flag.
6. **Cascade delete is explicit** — no DB-level foreign keys; `AdminRepository.deleteTenantCascaded()` handles cleanup in a transaction.
7. **Sessions don't carry tenant_id** — they reference `user_id`, which is already tenant-scoped.
8. **Audit trail is tenant-scoped** — every `audit_log` row includes `tenant_id` for the actor's context.
