# Routes & Pages — Single Source of Truth

**Use this file to know exactly which component and file the app uses for each URL. There are no duplicate login or callback pages.**

---

## Entry point

| What | File |
|------|------|
| App bootstrap | `src/main.tsx` |
| Root component | `src/App.tsx` |
| Route definitions | `src/App.tsx` (inside `AppRoutes`) |

---

## Auth & login (only one of each)

| URL | Component | File | Purpose |
|-----|-----------|------|---------|
| `/login` | `LoginPage` | **`src/pages/LoginPage.tsx`** | Login screen: Google button + email/password form |
| `/auth/callback` | `AuthCallbackPage` | **`src/pages/AuthCallbackPage.tsx`** | OAuth callback: exchanges `?code=` for session, then redirects to dashboard |

**Where they are loaded:** In `src/App.tsx`:

```ts
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
```

So the app **always** uses `src/pages/LoginPage.tsx` for `/login` and `src/pages/AuthCallbackPage.tsx` for `/auth/callback`. There are no other login or callback components.

---

## Other routes (all in `App.tsx`)

| Path | Page component | File |
|------|----------------|------|
| `/` | (redirect or `MainLayout`) | — |
| `/dashboard` | `DashboardPage` | `src/pages/DashboardPage.tsx` |
| `/events` | `EventsPage` | `src/pages/EventsPage.tsx` |
| `/artists` | `ArtistsPage` | `src/pages/ArtistsPage.tsx` |
| `/clients` | `ClientsPage` | `src/pages/ClientsPage.tsx` |
| `/finance` | `FinancePage` | `src/pages/FinancePage.tsx` |
| `/calendar` | `CalendarPage` | `src/pages/CalendarPage.tsx` |
| `/documents` | `DocumentsPage` | `src/pages/DocumentsPage.tsx` |
| `/settings` | `SettingsPage` | `src/pages/SettingsPage.tsx` |
| `/health` | `SystemHealthPage` | `src/pages/SystemHealthPage.tsx` (dev only) |

---

## Redirect rules

- **Not logged in** → `PrivateRoute` sends to `/login`.
- **Logged in and open `/login`** → redirect to `/dashboard`.
- **Unknown path (`*`)** → redirect to `/dashboard`.

---

## Auth logic (not pages)

| Responsibility | File |
|----------------|------|
| Session, user, profile fetch | `src/contexts/AuthContext.tsx` |
| Supabase client, `signIn`, `signInWithGoogle` | `src/lib/supabase.ts` |

No duplicate auth logic: one context, one Supabase client.
