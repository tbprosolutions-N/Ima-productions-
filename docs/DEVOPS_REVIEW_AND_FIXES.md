# DevOps Review & Fixes

**Date:** 2026  
**Scope:** Build, auth, env, docs, production behavior.

---

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | **Build** – Verify `npm run build` (tsc + vite). Worktree needed `npm install` first; build succeeds after install. | ✅ |
| 2 | **Doc** – `FINAL_SERVER_SETUP.md`: rescue timeout 7s → 10s; note that login page is available when rescue shows. | ✅ |
| 3 | **EnvCheck** – Use `getSupabaseEnvDiagnostic()` from `@/lib/supabase` so env check uses same normalized URL/key as the client. | ✅ |
| 4 | **Console** – Log `[NPC Auth Diagnostic]` only in **development** (`import.meta.env.DEV`); no diagnostic log in production. | ✅ |
| 5 | **Netlify** – Doc: add build note (NODE_VERSION optional; build command `npm run build`). | ✅ |

---

## Build

- **Command:** `npm run build` → `tsc && vite build`
- **Publish:** `dist` (see `netlify.toml`)
- **Requirement:** Run `npm install` before first build in a new clone/worktree.

---

## Auth & Supabase

- **Rescue timeout:** 10s; then “Retry” and “Go to login page” are shown.
- **AbortError:** Handled in `getSessionUserFast()` and via `unhandledrejection` in `main.tsx` so Supabase abort does not spam the console.
- **URL config:** Production must set Supabase **Authentication → URL Configuration** (Site URL + Redirect URLs) per `FINAL_SERVER_SETUP.md`.

---

## Env Vars (Netlify)

Required at **build** time (so they are inlined into the client):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional: `VITE_APP_NAME`, `VITE_APP_VERSION`, `VITE_MORNING_API_URL`.  
Do **not** set `VITE_DEMO_BYPASS=true` in production.

---

## Files Touched

- `docs/FINAL_SERVER_SETUP.md` – Rescue 10s, Netlify build note
- `src/contexts/AuthContext.tsx` – Diagnostic only in DEV
- `src/components/EnvCheck.tsx` – Use `getSupabaseEnvDiagnostic()`
- `docs/DEVOPS_REVIEW_AND_FIXES.md` – This summary
