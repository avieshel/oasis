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
    - `/` — `<HomePage />` (session-guarded, redirects to `/login`; nav links to
      `/settings` and `/admin` when enabled). Two tabs:
- **Recent tickets** (default, main view): table of `tickets_cache` rows
  returned via Jira (Key linked to Jira, Title, Created) with Load
  recent / Refresh, plus a **collapsible** create-ticket form (project
  select + title + description) that hides itself after a successful
  create. - **Items**: summary chips and the Oasis items table with
  status/severity filters, "Generate random item" button, Close/Reopen,
  and per-item "Create Jira ticket" with an inline project picker —
  linked tickets render as a Jira link. The tab button shows a "N new"
  indicator for `new` items, and creating a ticket switches to the
  Recent tickets tab. When no Jira connection exists a banner links to
  Settings, and create-ticket attempts auto-redirect to `/settings`.
  - `/settings` — `<SettingsPage />` with **Jira connection** / **API keys**
    tabs (`?tab=keys` deep-links the API-keys tab): connect/disconnect and
    status for the user's Jira connection; mint key with optional
    `allowed_project_keys` scoping, raw key shown **once**, per-key Jira
    service-account tie + revoke. No ticket creation here — that lives on the
    findings page.
  - `/jira` → `<Navigate to="/settings" />`; `/api-keys` →
    `<Navigate to="/settings?tab=keys" />` (kept as redirects for old links)
  - `/admin` — `<AdminPage />` (tenant & user CRUD tables with inline
    create/edit/delete, user password reset, tenant filter — see
    `Admin-Context.md`; link shown only when the status endpoint reports
    `enabled`)
  - `pages/AuthPage.tsx` — shared login/signup form (useCurrentUser redirect,
    error display, auto-login on signup)
  - `pages/HomePage.tsx` — two-tab dashboard: Recent tickets (main view:
    Jira tickets table + collapsible create form) and Items (new-item
    indicator, summary chips, filter selects, badge table, jira link column,
    triage actions)
  - `pages/SettingsPage.tsx` — guarded settings shell with Jira/API-keys tabs;
    tab sections are the page-chrome-free `JiraSettings` / `ApiKeysSettings`
    components (see `Jira-Client-Context.md` / `Rest-Api-Context.md`)
  - `api/client.ts` — typed `fetch` wrapper: sends `credentials: 'same-origin'`,
    caches CSRF token, attaches `x-csrf-token` header on all mutating calls
  - `api/auth.ts`, `api/jira.ts`, `api/keys.ts`, `api/items.ts` — typed
    wrappers per feature
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
