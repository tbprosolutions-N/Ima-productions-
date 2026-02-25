-- NPC: Add invoice_name to clients, event_time_end for time slots
-- Clients: default invoice name for invoicing
-- Events: end time for calendar time slots (not all-day)

-- 1. Clients: invoice name (שם בחשבונית)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS invoice_name text DEFAULT NULL;

COMMENT ON COLUMN public.clients.invoice_name IS 'שם בחשבונית – default name for invoices';

-- 2. Events: end time for time slots (e.g. "16:30")
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_time_end text DEFAULT NULL;

COMMENT ON COLUMN public.events.event_time_end IS 'שעת סיום – event end time for calendar slots';
