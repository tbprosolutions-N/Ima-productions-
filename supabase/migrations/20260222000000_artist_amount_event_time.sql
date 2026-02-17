-- NPC App: Add Artist amount (סכום) and Event event_time (שעת אירוע)
-- Run this migration before UI updates.

-- 1. Artist: add optional amount/sum field (סכום)
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS amount numeric DEFAULT NULL;

COMMENT ON COLUMN public.artists.amount IS 'סכום – optional sum/amount for artist context';

-- 2. Events: add optional event time (שעת אירוע), stored as TIME or text (e.g. "14:30")
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_time text DEFAULT NULL;

COMMENT ON COLUMN public.events.event_time IS 'שעת אירוע – event time (e.g. 14:30 or 14:30:00)';
