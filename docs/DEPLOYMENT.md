# Deployment

## Frontend: Cloudflare Pages

**Site:** https://npc-am.com

The frontend is deployed on **Cloudflare Pages** (migrated from Netlify).

### How to deploy

1. **Push to master** — Git push triggers an automatic build on Cloudflare Pages:
   ```bash
   git add -A
   git commit -m "Your message"
   git push origin master
   ```

2. Cloudflare Pages builds and deploys automatically. No CLI or manual deploy needed.

### Build configuration

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Node version:** 20 (configure in Cloudflare Pages → Settings → Build & deployments)

### Environment variables

Set in Cloudflare Pages → Settings → Environment variables:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (required)
- Other `VITE_*` vars as needed

---

## Backend: Supabase

- **Database:** Supabase (PostgreSQL)
- **Edge Functions:** Deploy manually:
  ```bash
  npx supabase functions deploy send-email
  npx supabase functions deploy calendar-invite
  npx supabase functions deploy extract-invoice-vision
  ```

---

## Legacy (Netlify)

Netlify deployment is **deprecated**. The `netlify.toml`, `netlify/` folder, and `scripts/deploy-netlify.js` remain for reference. The `netlify/functions/` (morning-api, sheets-sync-api) may need to be migrated to Cloudflare Workers or another serverless platform if those APIs are still required.
