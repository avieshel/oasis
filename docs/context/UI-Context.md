# UI Context

Agent guide for the React client (Vite SPA in `client/`).

## Current state

- Vite + React 18 + TypeScript strict (`client/tsconfig.json`, `noUnusedLocals`).
- Dev server on :5173 proxies `/api` → `http://localhost:3000`
  (`client/vite.config.ts`).
- `client/src/`:
  - `main.tsx` — entrypoint, mounts `<App />` inside `<StrictMode>`
  - `App.tsx` — react-router-dom `<BrowserRouter>` routes:
    - `/login` — `<AuthPage mode="login" />`
    - `/signup` — `<AuthPage mode="signup" />`
    - `/` — `<HomePage />` (session-guarded, redirects to `/login`; links to
      `/jira` and `/api-keys`)
    - `/jira` — `<JiraPage />` (connect form, project select, create-ticket
      form, recent-tickets list with Load recent / Refresh, disconnect)
    - `/api-keys` — `<ApiKeysPage />` (mint key with optional
      `allowed_project_keys` scoping, shows the raw key **once**, per-key
      Jira service-account tie form + disconnect, revoke)
    - `/admin` — `<AdminPage />` (tenant & user CRUD tables with inline
      create/edit/delete, user password reset, tenant filter — see
      `Admin-Context.md`; link shown only when the status endpoint reports
      `enabled`)
  - `pages/AuthPage.tsx` — shared login/signup form (useCurrentUser redirect,
    error display, auto-login on signup)
  - `pages/HomePage.tsx` — displays email, logout button, nav links
  - `pages/JiraPage.tsx`, `pages/ApiKeysPage.tsx` — feature pages (see
    `Jira-Client-Context.md` / `Rest-Api-Context.md`)
  - `api/client.ts` — typed `fetch` wrapper: sends `credentials: 'same-origin'`,
    caches CSRF token, attaches `x-csrf-token` header on all mutating calls
  - `api/auth.ts`, `api/jira.ts`, `api/keys.ts` — typed wrappers per feature
  - `hooks/useCurrentUser.ts` — fetches `GET /api/app/auth/me`, returns
    `{ status, user }` state
  - `index.css` — minimal page/form styles
- Linted with `eslint-plugin-react-hooks` (`exhaustive-deps` is `error`,
  `set-state-in-effect` is `error` — effects use inline `.then` chains, not
  calls to state-setting helpers), `no-explicit-any` is `error`.

## Convention: effects must not call setState synchronously

The `react-hooks/set-state-in-effect` rule (error) rejects effects that call a
function which sets state directly. Mirror `JiraPage`/`ApiKeysPage`: do the
fetch inline in the effect with `.then(...)`/`.catch(...)` chains; the spy-load
helpers can also live as `useCallback` and be called from event handlers.

## Convention

- Layered: pages → api client → backend services. Client never imports server
  code; in prod the built SPA is served by Nest static assets.
- Auth is via `HttpOnly` cookie (`sid`); CSRF via double-submit header
  (`x-csrf-token` with `csrf_token` cookie) — store no tokens in
  localStorage/sessionStorage.
- Root `npm run lint` covers `client/src` (React-Hooks + type-checked TS).
- Errors render from the API's `{ error, fields?, detail? }` shape —
  `AppExceptionFilter`.
- Secrets on screen: API keys are shown only at mint time (raw value); never
  rendered again afterward.
