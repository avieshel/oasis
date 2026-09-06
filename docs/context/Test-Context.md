# Testing Context

Agent guide for automated tests (vitest + supertest + shell harness).

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

## Integration harness (`npm run test:it`)

`scripts/integration-test.sh` runs a battery of HTTP assertions against a live
server (curl-based) and is deliberately separate from vitest.

- Auto-starts the server on `PORT` (default 3000) unless one is already running,
  runs assertions, writes logs, then stops it (or reuses/keeps a server).
- Logs:
  - JSON: `/tmp/identityhub-integration.json` (summary pass/fail/duration +
    per-test results)
  - Text: `/tmp/identityhub-integration.log`
- Re-inspect the last run without re-running:
  `npm run test:it -- --read` (prints JSON).
- Other flags: `--keep` (leave server running), `--quiet`, `--log` (print path).
- It starts its own server with `ALLOW_OPEN_SIGNUP=true`, so it exercises the
  open-signup path. To test signup-disabled, run a server with
  `ALLOW_OPEN_SIGNUP=false` then invoke against it.
- Add new scenarios by appending `check_http` / `check_json` / `check_jq` calls
  under the labeled sections in the script.

## Conventions

- Integration tests boot the real `AppModule` through supertest.
- **Jira calls must be stubbed** — never hit real Jira network in tests
  (CONTEXT.md §14).
- New modules (auth, tickets, jira, api-keys) should add:
  - auth: login/logout, session rotation, no-enumeration behavior;
  - tickets/API: Zod validation errors, 401/403/404/502 mapping;
  - tenancy isolation: user A cannot read user B's tickets.
- Extend the `test:it` harness alongside vitest specs for endpoint-level
  behavior, since it exercises the real HTTP stack + error filter.
- Use throwaway test values; never real tokens. Tests must not depend on `.env`.
