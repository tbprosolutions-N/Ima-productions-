-- Performance indexes for frequently queried columns
-- Run in Supabase SQL Editor or via: supabase db push
-- Idempotent: uses IF NOT EXISTS

-- agency_id indexes (RLS and multi-tenancy filter almost every query)
CREATE INDEX IF NOT EXISTS idx_users_agency_id ON public.users(agency_id);
CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON public.clients(agency_id);
CREATE INDEX IF NOT EXISTS idx_artists_agency_id ON public.artists(agency_id);
CREATE INDEX IF NOT EXISTS idx_events_agency_id ON public.events(agency_id);
CREATE INDEX IF NOT EXISTS idx_documents_agency_id ON public.documents(agency_id);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_agency_id ON public.finance_expenses(agency_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_id ON public.audit_logs(agency_id);
CREATE INDEX IF NOT EXISTS idx_integrations_agency_id ON public.integrations(agency_id);
CREATE INDEX IF NOT EXISTS idx_integration_tokens_agency_id ON public.integration_tokens(agency_id);
CREATE INDEX IF NOT EXISTS idx_integration_secrets_agency_id ON public.integration_secrets(agency_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_watches_agency_id ON public.google_calendar_watches(agency_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_agency_id ON public.sync_jobs(agency_id);

-- events table: event_date for date-range queries (calendar, reports, period summary)
CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events(event_date);

-- Composite index for common filter: agency + date (dashboard, calendar)
CREATE INDEX IF NOT EXISTS idx_events_agency_date ON public.events(agency_id, event_date);
