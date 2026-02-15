# Backend Integration Tests

This folder contains backend and integration test setup for:

- **Netlify Functions** (e.g. `morning-api.ts`) — tested via `netlify dev` + HTTP calls
- **Supabase Edge Functions** — tested via `supabase functions serve` + HTTP calls

## Running Backend Tests

### Netlify Functions

```bash
# Terminal 1: Start Netlify dev (serves functions)
npm run netlify:dev

# Terminal 2: Run integration tests (requires test script)
npx node tests/backend/netlify-functions.test.mjs
```

### Supabase Edge Functions

```bash
# With Supabase CLI
supabase functions serve extract-invoice-vision --env-file .env.local

# Test via curl:
curl -X POST http://localhost:54321/functions/v1/extract-invoice-vision \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"imageBase64":"..."}'
```

### Database / RLS

- Run migrations: `npm run db:migrate`
- Manual verification: See `docs/QA_TASKS.md` and `docs/DELIVERY_READINESS_REPORT_E2E.md`
