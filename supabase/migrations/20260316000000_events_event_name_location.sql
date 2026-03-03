-- NPC Collective Production: Add event_name and location to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_name text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location text;
COMMENT ON COLUMN public.events.event_name IS 'Event display name (e.g. Wedding at Hilton)';
COMMENT ON COLUMN public.events.location IS 'Event location (synced with Google Calendar)';
