# IdentityHub — NHI Jira Integration

Toolchain: Node.js + TypeScript (Fastify, Prisma, Postgres).

See `CONTEXT.md` for the full design context (scope decisions, tenancy model,
security checklist, open questions). This file is the working agreement for
day-to-day changes.

## Where to Find What

| Area                                  | Context file                               |
| ------------------------------------- | ------------------------------------------ |
| Login/logout & session management     | `docs/context/Identity-Session-Context.md` |
| Machine-facing REST API (API keys)    | `docs/context/Rest-Api-Context.md`         |
| Jira Cloud client code                | `docs/context/Jira-Client-Context.md`      |
| React client (pages, api, components) | `docs/context/UI-Context.md`               |
| Automated tests                       | `docs/context/Test-Context.md`             |
| Full design context                   | `CONTEXT.md`                               |

## Conventions

- TypeScript strict mode. No `any` in new code without justification.
- Node 22 LTS baseline.
- Validation: Zod schemas live in `src/app/validation.ts`; routes parse input
  through them, never hand-rolled checks.
- Formatting: Prettier (default config).
- Linting: ESLint with `@typescript-eslint/recommended-type-checked`.
- No comments unless the code is genuinely tricky. Prefer self-naming over
  commenting.
- Module structure follows `src/modules/<feature>/` (routes, service, repo).
  Handlers are thin; business logic lives in services.
- All repository methods take `tenantId` as the first argument and filter by it
  inside the query — no tenant filtering in handler code.

## Workflow

- After changes: `npm run check` (lint + typecheck + test).
- Migrations: `npx prisma migrate dev` for dev, `npx prisma migrate deploy` for
  prod-like. Never edit a migration after it's been applied.
- Secrets: never commit `.env`; ship `.env.example`. Rotate `APP_SECRET` if it
  leaks — it invalidates all stored Jira tokens.
- Pre-commit gate: `.husky/pre-commit` runs TruffleHog over staged files and
  blocks the commit on any detected secret (requires `brew install trufflehog`),
  then runs lint-staged (eslint --fix + prettier) on staged files. Never weaken
  or bypass this hook.
- Commits: small, scoped, imperative subject ("add ticket create endpoint",
  not "added stuff").

## Hard Gates (Enforced by Tooling)

| Gate                                                   | Enforced By                                                     | What Happens on Violation |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------- |
| TypeScript strict mode                                 | `tsconfig.json`, `client/tsconfig.json` — `strict: true`        | `npm run typecheck` fails |
| No `any` type                                          | ESLint `@typescript-eslint/no-explicit-any: error`              | `npm run lint` fails      |
| No `console.*` in server code                          | ESLint `no-console: error` (src only)                           | `npm run lint` fails      |
| React hooks rules                                      | ESLint `eslint-plugin-react-hooks`                              | `npm run lint` fails      |
| Unsafe server patterns (eval, raw child_process, etc.) | ESLint `eslint-plugin-security` on `src/`, `test/`              | `npm run lint` fails      |
| Pre-commit secret scan                                 | `.husky/pre-commit` runs TruffleHog                             | Commit blocked            |
| Pre-commit format/lint                                 | `.husky/pre-commit` runs lint-staged                            | Commit blocked            |
| CI                                                     | `.github/workflows/ci.yml` runs lint + typecheck + test + build | PR/push to main fails     |
