## Netlify deploy (no Git, no credit card)

### 1) Build locally

```bash
npm install
npm run build
```

This creates the `dist/` folder.

### 2) Deploy via Drag & Drop (fastest)

1. Go to Netlify → **Sites**
2. Drag the **`dist/` folder** into the deploy area

Important:
- SPA routing (React Router deep links like `/dashboard`) is handled by `public/_redirects`,
  which gets copied into `dist/_redirects` when you run `npm run build`.

### 3) Set required environment variables in Netlify

Netlify → Site → **Site configuration → Environment variables**

- `VITE_SUPABASE_URL` = your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
- `VITE_DEMO_BYPASS` = `false` (recommended for production)

Then trigger a redeploy.

Note:
- If you deploy by **drag & drop**, Netlify will NOT rebuild your app.
  The values must already be baked into your local build via your local `.env`.
  (Environment variables in Netlify matter only when Netlify is doing the build from Git or via Netlify CLI build.)

### 4) Supabase Auth settings (must)

Supabase → Authentication → URL Configuration:
- **Site URL**: https://npc-am.com
- **Redirect URLs**: add `https://npc-am.com` and `https://npc-am.com/login` (see docs/NPC_AM_DOMAIN.md)

### Notes
- SPA routing is handled by `netlify.toml` (redirects all routes to `index.html`).
- If you later want a “demo bypass” site, use a second Netlify site with separate env vars.
