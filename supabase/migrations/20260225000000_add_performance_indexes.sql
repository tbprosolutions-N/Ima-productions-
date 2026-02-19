-- Performance indexes for the most common query patterns.
-- All CREATE INDEX statements are idempotent (IF NOT EXISTS).

-- events: the primary list query filters by agency_id and orders by event_date
CREATE INDEX IF NOT EXISTS idx_events_agency_date
  ON events (agency_id, event_date DESC);

-- events: filter by status within an agency (Events page filter bar)
CREATE INDEX IF NOT EXISTS idx_events_agency_status
  ON events (agency_id, status);

-- events: join/filter by artist within an agency
CREATE INDEX IF NOT EXISTS idx_events_agency_artist
  ON events (agency_id, artist_id);

-- artists: list page orders by name within agency
CREATE INDEX IF NOT EXISTS idx_artists_agency_name
  ON artists (agency_id, name);

-- clients: list page orders by name within agency
CREATE INDEX IF NOT EXISTS idx_clients_agency_name
  ON clients (agency_id, name);

-- sync_jobs: worker polls for pending jobs ordered by created_at
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status_created
  ON sync_jobs (status, created_at)
  WHERE status = 'pending';
