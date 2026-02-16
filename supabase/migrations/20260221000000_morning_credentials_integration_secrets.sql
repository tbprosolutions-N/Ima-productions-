-- Morning (Green Invoice) credentials are stored in integration_secrets(provider='morning').
-- secret JSONB shape: { id: companyId, secret: apiSecret, base_url?: string }
-- No new column needed; this migration documents the convention and ensures the table exists.
-- Frontend saves via server-only API (Netlify function or Edge Function); morning-api reads from here.

-- Ensure integration_secrets has correct structure (already in schema-clean)
-- Nothing to alter; integration_secrets(agency_id, provider, secret) is used by morning-connect and morning-api.

SELECT 1;
