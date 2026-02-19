-- Add Morning (Green Invoice) integration columns to events table.
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS).
-- These columns were referenced by the frontend but were never added via migration.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS morning_id              text,
  ADD COLUMN IF NOT EXISTS morning_sync_status     text DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS morning_document_id     text,
  ADD COLUMN IF NOT EXISTS morning_document_number text,
  ADD COLUMN IF NOT EXISTS morning_document_url    text,
  ADD COLUMN IF NOT EXISTS morning_last_error      text,
  ADD COLUMN IF NOT EXISTS morning_doc_status      text;

COMMENT ON COLUMN public.events.morning_id              IS 'Morning (Green Invoice) external document ID';
COMMENT ON COLUMN public.events.morning_sync_status     IS 'Sync state: not_synced | syncing | synced | error';
COMMENT ON COLUMN public.events.morning_document_id     IS 'Morning document ID (invoice/receipt)';
COMMENT ON COLUMN public.events.morning_document_number IS 'Morning document number for display';
COMMENT ON COLUMN public.events.morning_document_url    IS 'Direct URL to the Morning document';
COMMENT ON COLUMN public.events.morning_last_error      IS 'Last Morning sync error message';
COMMENT ON COLUMN public.events.morning_doc_status      IS 'Morning document lifecycle status';
