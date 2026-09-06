# Testing Context

Agent guide for automated tests (vitest + supertest).

## Current state

- Vitest config `vitest.config.ts`; specs live in `test/**/*.spec.ts`.
- `test/smoke.spec.ts`:
  - Unit tests for `src/infra/crypto.ts` (seal/open, unique nonce, hash/verify,
    sha256, randomBytes, timing-safe compare).
  - HTTP smoke: boots the real Nest app with `NODE_ENV=test`, hits
    `/healthz` and `/readyz` via supertest.
- Run: `npm test`. Full gate: `npm run check` (lint + typecheck + test). CI runs
  the same (`ci.yml`).
- Test files are linted/type-checked via `tsconfig.test.json`.

## Conventions

- Integration tests boot the real `AppModule` through supertest.
- **Jira calls must be stubbed** — never hit real Jira network in tests
  (CONTEXT.md §14).
- New modules (auth, tickets, jira, api-keys) should add:
  - auth: login/logout, session rotation, no-enumeration behavior;
  - tickets/API: Zod validation errors, 401/403/404/502 mapping;
  - tenancy isolation: user A cannot read user B's tickets.
- Use throwaway test values; never real tokens. Tests must not depend on `.env`.
