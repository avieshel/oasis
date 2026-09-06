# UI Context

Agent guide for the React client (Vite SPA in `client/`).

## Current state

- Vite + React 18 + TypeScript strict (`client/tsconfig.json`, `noUnusedLocals`).
- Dev server on :5173 proxies `/api` → `http://localhost:3000`
  (`client/vite.config.ts`).
- `client/src/`:
  - `main.tsx` — entrypoint, mounts `<App />` inside `<StrictMode>`
  - `App.tsx` — react-router-dom `<BrowserRouter>` with three routes:
    - `/login` — `<AuthPage mode="login" />`
    - `/signup` — `<AuthPage mode="signup" />`
    - `/` — `<HomePage />` (session-guarded, redirects to `/login`)
  - `pages/AuthPage.tsx` — shared login/signup form (useCurrentUser redirect,
    error display, auto-login on signup)
  - `pages/HomePage.tsx` — displays email, logout button
  - `api/client.ts` — typed `fetch` wrapper: sends `credentials: 'same-origin'`,
    caches CSRF token, attaches `x-csrf-token` header on all mutating calls
  - `api/auth.ts` — typed wrappers: `me()`, `login()`, `signup()`, `logout()`
  - `hooks/useCurrentUser.ts` — fetches `GET /api/app/auth/me`, returns
    `{ status, user }` state
  - `index.css` — minimal page/form styles
- Linted with `eslint-plugin-react-hooks` (`exhaustive-deps` is `error`),
  `no-explicit-any` is `error`.

## Planned surface

- `client/src/pages/` — connect Jira, create ticket, recent tickets, API-key
  management (future slices)
- `client/src/components/` — shared UI (ticket form, ticket list)

## Conventions

- Layered: pages → api client → backend services. Client never imports server
  code; in prod the built SPA is served by Nest static assets.
- Auth is via `HttpOnly` cookie (`sid`); CSRF via double-submit header
  (`x-csrf-token` with `csrf_token` cookie) — store no tokens in
  localStorage/sessionStorage.
- Root `npm run lint` covers `client/src` (React-Hooks + type-checked TS).
- Errors render from the API's `{ error, fields?, detail? }` shape —
  `AppExceptionFilter` (`src/app/errors.ts`).
