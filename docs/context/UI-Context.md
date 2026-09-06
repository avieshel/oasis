# UI Context

Agent guide for the React client (Vite SPA in `client/`).

## Current state

- Vite + React 18 + TypeScript strict (`client/tsconfig.json`, `noUnusedLocals`).
- Dev server on :5173 proxies `/api` → `http://localhost:3000`
  (`client/vite.config.ts`).
- `client/src/` contains only `main.tsx`, `App.tsx` (backend health check),
  `index.css`.
- Linted with `eslint-plugin-react-hooks` (`exhaustive-deps` is `error`),
  `no-explicit-any` is `error`.

## Planned surface

- `client/src/pages/` — login/logout, connect Jira, create ticket, recent
  tickets, API-key management.
- `client/src/components/` — shared UI (ticket form, ticket list).
- `client/src/api/` — typed `fetch` client sending cookies + double-submit CSRF
  header.

## Conventions

- Layered: pages → api client → backend services. Client never imports server
  code; in prod the built SPA is served by Nest static assets.
- Auth is via `HttpOnly` cookie; CSRF via double-submit header — store no tokens
  in localStorage/sessionStorage.
- Root `npm run lint` covers `client/src` (React-Hooks + type-checked TS).
- Errors render from the API's `{ error, fields?, detail? }` shape —
  `AppExceptionFilter` (`src/app/errors.ts`).
