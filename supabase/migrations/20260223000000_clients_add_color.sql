-- Add optional color column to clients for UI (cards, calendar)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN clients.color IS 'Hex color for UI display (e.g. #3B82F6)';
