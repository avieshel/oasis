# IdentityHub — NHI Jira Integration

Toolchain: Node.js + TypeScript (Fastify, Prisma, Postgres).

See `CONTEXT.md` for the full design context (scope decisions, tenancy model,
security checklist, open questions). This file is the working agreement for
day-to-day changes.

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

- After changes: `npm run lint && npm run typecheck && npm test`.
- Migrations: `npx prisma migrate dev` for dev, `npx prisma migrate deploy` for
  prod-like. Never edit a migration after it's been applied.
- Secrets: never commit `.env`; ship `.env.example`. Rotate `APP_SECRET` if it
  leaks — it invalidates all stored Jira tokens.
- Commits: small, scoped, imperative subject ("add ticket create endpoint",
  not "added stuff").
