-- IMA OS - CLEAN SLATE DATABASE SCHEMA
-- Drop all existing tables first to avoid conflicts
-- Multi-tenant Agency Management System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop all existing tables in correct order (reverse of dependencies)
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS finance_expenses CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS artists CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS agencies CASCADE;

-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS sync_client_from_event() CASCADE;
DROP FUNCTION IF EXISTS set_event_weekday() CASCADE;

-- =====================================================
-- AGENCIES TABLE (Multi-tenancy)
-- =====================================================
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('ima', 'bar', 'nightclub')),
  company_id VARCHAR(50),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('producer', 'finance', 'manager', 'owner')),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  avatar_url TEXT,
  onboarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CLIENTS TABLE
-- =====================================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vat_id VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  contact_person VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ARTISTS TABLE
-- =====================================================
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vat_id VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(255),
  -- If the artist uses a different email for Google Calendar invites
  calendar_email VARCHAR(255),
  -- Optional: a shared calendar ID (created/owned by Admin Google account) for this artist
  google_calendar_id TEXT,
  -- UI color for Daybook/Calendar (hex like #A82781)
  color VARCHAR(20) DEFAULT '#A82781',
  bank_name VARCHAR(255),
  bank_branch VARCHAR(50),
  bank_account VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EVENTS TABLE (Complete with all columns)
-- =====================================================
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  producer_id UUID REFERENCES users(id),
  client_id UUID REFERENCES clients(id),
  artist_id UUID REFERENCES artists(id),
  event_date DATE NOT NULL,
  weekday VARCHAR(20),
  business_name VARCHAR(255) NOT NULL,
  invoice_name VARCHAR(255) NOT NULL,
  -- Company income for this event (what the client pays to IMA)
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  -- Payment date (when the client should pay / when payment is expected)
  payment_date DATE,
  -- Artist payout per event (admin/owner can edit)
  artist_fee_type VARCHAR(20) CHECK (artist_fee_type IN ('fixed', 'percent')) DEFAULT 'fixed',
  artist_fee_value DECIMAL(10, 2) DEFAULT 0,
  artist_fee_amount DECIMAL(10, 2) DEFAULT 0,
  -- Google Calendar sync (company calendar)
  google_event_id TEXT,
  google_event_html_link TEXT,
  -- Optional: artist shared calendar copy (admin-owned calendar per artist)
  google_artist_event_id TEXT,
  google_artist_event_html_link TEXT,
  google_sync_status VARCHAR(20) DEFAULT 'not_synced',
  google_synced_at TIMESTAMPTZ,
  approver VARCHAR(255),
  doc_type VARCHAR(20) CHECK (doc_type IN ('tax_invoice', 'receipt', 'payment_request')),
  doc_number VARCHAR(50),
  due_date DATE,
  status VARCHAR(20) CHECK (status IN ('draft', 'pending', 'approved', 'paid', 'cancelled')) DEFAULT 'draft',
  morning_sync_status VARCHAR(20) DEFAULT 'not_synced',
  morning_document_id TEXT,
  morning_document_number TEXT,
  morning_document_url TEXT,
  morning_last_error TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- DOCUMENTS TABLE
-- =====================================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) CHECK (type IN ('agreement', 'invoice', 'receipt', 'contract')),
  template TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- FINANCE EXPENSES (Production)
-- Files stored in Supabase Storage bucket: expenses
-- =====================================================
CREATE TABLE finance_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  filetype TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  vendor TEXT,
  supplier_name TEXT,
  amount DECIMAL(10, 2),
  vat DECIMAL(10, 2),
  expense_date DATE,
  notes TEXT,
  morning_status VARCHAR(20) DEFAULT 'not_synced',
  morning_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- AUDIT LOGS (Production)
-- Append-only activity trail (server-side)
-- =====================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  actor_email TEXT,
  action VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INTEGRATIONS TABLE (Production foundation)
-- Stores connection metadata. OAuth tokens should be handled server-side (Edge Function)
-- and referenced here via token_ref.
-- =====================================================
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'morning', 'sheets')),
  status VARCHAR(20) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
  token_ref TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  last_error TEXT,
  connected_by UUID REFERENCES users(id),
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (agency_id, provider)
);

-- =====================================================
-- INTEGRATION SECRETS (server-only)
-- For non-OAuth integrations (e.g., Morning/GreenInvoice API key).
-- No client policies are added on purpose.
-- =====================================================
CREATE TABLE integration_secrets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('morning')),
  secret JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (agency_id, provider)
);

-- =====================================================
-- INTEGRATION TOKENS (server-only)
-- IMPORTANT: No client policies are added on purpose.
-- Tokens are written/read only by server using service-role (Edge Functions).
-- =====================================================
CREATE TABLE integration_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google')),
  access_token TEXT,
  refresh_token TEXT,
  scope TEXT,
  token_type TEXT,
  expiry_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- GOOGLE CALENDAR WATCHES (server-only)
-- Used for two-way calendar sync (company + per-artist calendars).
-- No client policies are added on purpose.
-- =====================================================
CREATE TABLE google_calendar_watches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('company', 'artist')),
  artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  channel_token TEXT,
  resource_id TEXT,
  expiration TIMESTAMPTZ,
  sync_token TEXT,
  last_received_at TIMESTAMPTZ,
  last_pulled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SYNC JOBS TABLE (Production foundation)
-- Tracks background sync operations (calendar/drive/gmail/morning/sheets)
-- =====================================================
CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'morning', 'sheets')),
  kind VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  payload JSONB DEFAULT '{}'::jsonb,
  result JSONB DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX idx_users_agency_id ON users(agency_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_events_agency_id ON events(agency_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_producer_id ON events(producer_id);
CREATE INDEX idx_clients_agency_id ON clients(agency_id);
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_artists_agency_id ON artists(agency_id);
CREATE INDEX idx_finance_expenses_agency_id ON finance_expenses(agency_id);
CREATE INDEX idx_finance_expenses_created_at ON finance_expenses(created_at);
CREATE INDEX idx_audit_logs_agency_id ON audit_logs(agency_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_artists_name ON artists(name);
CREATE INDEX idx_documents_agency_id ON documents(agency_id);
CREATE INDEX idx_integrations_agency_id ON integrations(agency_id);
CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE INDEX idx_sync_jobs_agency_id ON sync_jobs(agency_id);
CREATE INDEX idx_sync_jobs_provider ON sync_jobs(provider);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX idx_integration_tokens_agency_id ON integration_tokens(agency_id);
CREATE INDEX idx_integration_secrets_agency_id ON integration_secrets(agency_id);
CREATE INDEX idx_google_calendar_watches_agency_id ON google_calendar_watches(agency_id);
CREATE INDEX idx_google_calendar_watches_channel_id ON google_calendar_watches(channel_id);
CREATE INDEX idx_google_calendar_watches_calendar_id ON google_calendar_watches(calendar_id);

-- =====================================================
-- FUNCTION: Update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- TRIGGERS: Auto-update timestamps
-- =====================================================
CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON agencies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_artists_updated_at BEFORE UPDATE ON artists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_jobs_updated_at BEFORE UPDATE ON sync_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_tokens_updated_at BEFORE UPDATE ON integration_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_secrets_updated_at BEFORE UPDATE ON integration_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_google_calendar_watches_updated_at BEFORE UPDATE ON google_calendar_watches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTION: Auto-create/update client from event
-- =====================================================
CREATE OR REPLACE FUNCTION sync_client_from_event()
RETURNS TRIGGER AS $$
BEGIN
  -- If client_id is not set but we have business_name, try to find or create client
  IF NEW.client_id IS NULL AND NEW.business_name IS NOT NULL THEN
    -- Try to find existing client by name (case-insensitive)
    SELECT id INTO NEW.client_id
    FROM clients
    WHERE agency_id = NEW.agency_id
      AND LOWER(name) = LOWER(NEW.business_name)
    LIMIT 1;
    
    -- If no client found, create one automatically
    IF NEW.client_id IS NULL THEN
      INSERT INTO clients (agency_id, name, created_at, updated_at)
      VALUES (NEW.agency_id, NEW.business_name, NOW(), NOW())
      RETURNING id INTO NEW.client_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS: Auto-create clients
-- =====================================================
CREATE TRIGGER sync_client_before_insert_event
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION sync_client_from_event();

CREATE TRIGGER sync_client_before_update_event
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION sync_client_from_event();

-- =====================================================
-- FUNCTION: Auto-set weekday from event_date
-- =====================================================
CREATE OR REPLACE FUNCTION set_event_weekday()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_date IS NOT NULL THEN
    NEW.weekday = TO_CHAR(NEW.event_date, 'Day');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS: Auto-set weekday
-- =====================================================
CREATE TRIGGER set_weekday_before_insert_event
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_event_weekday();

CREATE TRIGGER set_weekday_before_update_event
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_event_weekday();

-- =====================================================
-- TRIGGER GUARD: Enforce server-side RBAC for events
-- - status: owner-only
-- - money fields (amount/payment_date/doc fields/artist_fee_*): owner/manager only
-- - producers can create events but cannot modify restricted fields
-- =====================================================
CREATE OR REPLACE FUNCTION enforce_event_write_permissions()
RETURNS TRIGGER AS $$
DECLARE
  r TEXT;
BEGIN
  SELECT role INTO r FROM public.users WHERE id = auth.uid();
  IF r IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Status is owner-only
  IF r <> 'owner' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'status is owner-only';
    END IF;
  END IF;

  -- Financial fields are owner/manager only
  IF r NOT IN ('owner', 'manager') THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount THEN
      RAISE EXCEPTION 'amount is owner/manager only';
    END IF;
    IF NEW.payment_date IS DISTINCT FROM OLD.payment_date THEN
      RAISE EXCEPTION 'payment_date is owner/manager only';
    END IF;
    IF NEW.doc_type IS DISTINCT FROM OLD.doc_type OR NEW.doc_number IS DISTINCT FROM OLD.doc_number OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      RAISE EXCEPTION 'document fields are owner/manager only';
    END IF;
    IF NEW.artist_fee_type IS DISTINCT FROM OLD.artist_fee_type OR NEW.artist_fee_value IS DISTINCT FROM OLD.artist_fee_value OR NEW.artist_fee_amount IS DISTINCT FROM OLD.artist_fee_amount THEN
      RAISE EXCEPTION 'artist fee fields are owner/manager only';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_event_write_permissions_before_update
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_event_write_permissions();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_secrets ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (CRITICAL FOR ONBOARDING)
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Users can read agencies they belong to
CREATE POLICY "Users can read own agency" ON agencies
  FOR SELECT USING (
    id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- Users can read events from their agency
CREATE POLICY "Users can read agency events" ON events
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- Users can create events in their agency
CREATE POLICY "Users can create agency events" ON events
  FOR INSERT WITH CHECK (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- Users can update events in their agency
CREATE POLICY "Users can update agency events" ON events
  FOR UPDATE USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- Only managers and owners can delete events
CREATE POLICY "Managers can delete agency events" ON events
  FOR DELETE USING (
    agency_id IN (
      SELECT agency_id FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'manager')
    )
  );

-- RLS for clients
CREATE POLICY "Users can read agency clients" ON clients
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage agency clients" ON clients
  FOR ALL USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- RLS for artists
CREATE POLICY "Users can read agency artists" ON artists
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage agency artists" ON artists
  FOR ALL USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- RLS for documents
CREATE POLICY "Users can read agency documents" ON documents
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage agency documents" ON documents
  FOR ALL USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- RLS for finance_expenses (production)
CREATE POLICY "Users can read agency finance_expenses" ON finance_expenses
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- Insert for finance/manager/owner only (producers should not upload expenses)
CREATE POLICY "Finance roles can insert finance_expenses" ON finance_expenses
  FOR INSERT WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM users
      WHERE id = auth.uid()
      AND role IN ('owner','manager','finance')
    )
  );

-- Update for finance/manager/owner only
CREATE POLICY "Finance roles can update finance_expenses" ON finance_expenses
  FOR UPDATE USING (
    agency_id IN (
      SELECT agency_id FROM users
      WHERE id = auth.uid()
      AND role IN ('owner','manager','finance')
    )
  );

-- Delete for finance/manager/owner only
CREATE POLICY "Finance roles can delete finance_expenses" ON finance_expenses
  FOR DELETE USING (
    agency_id IN (
      SELECT agency_id FROM users
      WHERE id = auth.uid()
      AND role IN ('owner','manager','finance')
    )
  );

-- RLS for audit_logs (append-only)
CREATE POLICY "Users can read agency audit logs" ON audit_logs
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert agency audit logs" ON audit_logs
  FOR INSERT WITH CHECK (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- No UPDATE/DELETE policies for audit_logs (append-only)

-- RLS for integrations (read for agency members; write owner-only)
CREATE POLICY "Users can read agency integrations" ON integrations
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Owners can manage integrations" ON integrations
  FOR ALL USING (
    agency_id IN (
      SELECT agency_id FROM users
      WHERE id = auth.uid()
      AND role IN ('owner')
    )
  );

-- RLS for sync_jobs (read for agency members; create owner-only)
CREATE POLICY "Users can read agency sync jobs" ON sync_jobs
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Owners can manage sync jobs" ON sync_jobs
  FOR ALL USING (
    agency_id IN (
      SELECT agency_id FROM users
      WHERE id = auth.uid()
      AND role IN ('owner')
    )
  );

-- NOTE: integration_tokens intentionally has NO SELECT/INSERT/UPDATE/DELETE policies.
-- Client cannot read/write tokens even as owner. Server uses service-role.
-- NOTE: google_calendar_watches intentionally has NO SELECT/INSERT/UPDATE/DELETE policies.
-- Client cannot read/write watch channel tokens. Server uses service-role.
-- NOTE: integration_secrets intentionally has NO SELECT/INSERT/UPDATE/DELETE policies.
-- Client cannot read/write API keys. Server uses service-role.

-- =====================================================
-- SUPABASE STORAGE POLICIES (expenses bucket)
-- IMPORTANT: Create a Storage bucket named "expenses" (private).
-- Files are stored under: <agencyId>/<expenseId>/<filename>
-- =====================================================
CREATE POLICY "Agency members can read expenses files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Finance roles can upload expenses files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );

CREATE POLICY "Finance roles can delete expenses files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );

-- =====================================================
-- INSERT DEFAULT DATA
-- =====================================================

-- Insert default agencies
INSERT INTO agencies (name, type, company_id, settings) VALUES
  ('IMA Productions', 'ima', 'IMA001', '{"currency": "ILS", "timezone": "Asia/Jerusalem"}'),
  ('The Cocktail Bar', 'bar', 'BAR001', '{"currency": "ILS", "timezone": "Asia/Jerusalem"}'),
  ('The Nightclub', 'nightclub', 'CLUB001', '{"currency": "ILS", "timezone": "Asia/Jerusalem"}');

-- =====================================================
-- FUNCTION: Handle new user signup
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'producer'),
    (SELECT id FROM agencies WHERE type = 'ima' LIMIT 1),
    FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGER: Auto-create user profile on signup
-- =====================================================
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- FUNCTION: Ensure missing user profile exists (self-heal)
-- =====================================================
-- This is used when auth user exists but public.users row is missing
-- (e.g. auth user created before triggers were installed).
CREATE OR REPLACE FUNCTION public.ensure_user_profile(company_code TEXT DEFAULT NULL)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  au RECORD;
  resolved_agency_id UUID;
  resolved_email TEXT;
  resolved_full_name TEXT;
  resolved_role TEXT;
  result_row public.users%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- already provisioned
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = uid) THEN
    SELECT * INTO result_row FROM public.users u WHERE u.id = uid;
    RETURN result_row;
  END IF;

  SELECT * INTO au FROM auth.users WHERE id = uid;
  resolved_email := COALESCE(au.email, '');
  resolved_full_name := COALESCE(
    au.raw_user_meta_data->>'full_name',
    NULLIF(split_part(resolved_email, '@', 1), ''),
    'New User'
  );

  IF company_code IS NOT NULL AND length(trim(company_code)) > 0 THEN
    SELECT id INTO resolved_agency_id
    FROM public.agencies
    WHERE company_id = trim(company_code)
    LIMIT 1;
  END IF;

  IF resolved_agency_id IS NULL THEN
    SELECT id INTO resolved_agency_id
    FROM public.agencies
    WHERE type = 'ima'
    LIMIT 1;
  END IF;

  IF resolved_agency_id IS NULL THEN
    RAISE EXCEPTION 'No agency found to provision user';
  END IF;

  -- Safe bootstrap: first user in an agency becomes owner; afterward default to producer.
  resolved_role := 'producer';
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.agency_id = resolved_agency_id AND u.role = 'owner'
  ) THEN
    resolved_role := 'owner';
  END IF;

  INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
  VALUES (uid, resolved_email, resolved_full_name, resolved_role, resolved_agency_id, FALSE)
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile(TEXT) TO authenticated;

-- Refresh PostgREST schema cache (so the RPC becomes discoverable immediately)
-- In Supabase SQL Editor you can run this after creating the function.
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- INSERT DEFAULT DOCUMENT TEMPLATES
-- =====================================================
INSERT INTO documents (agency_id, name, type, template, variables) 
SELECT 
  id,
  'הסכם אמן סטנדרטי',
  'agreement',
  'הסכם זה נעשה ונחתם ביום {{date}} בין:

{{client_name}} (ח.פ/ע.מ: {{client_vat}})
כתובת: {{client_address}}
טלפון: {{client_phone}}
דוא"ל: {{client_email}}

לבין:

{{artist_name}} (ח.פ/ע.מ: {{artist_vat}})
טלפון: {{artist_phone}}
דוא"ל: {{artist_email}}

בעניין: הופעה/אירוע ביום {{event_date}}

תנאי ההסכם:
1. המחיר המוסכם: {{amount}} ₪
2. מועד התשלום: {{due_date}}
3. מיקום האירוע: {{business_name}}

חתימות:
_________________          _________________
לקוח                      אמן',
  '{"date": "", "client_name": "", "client_vat": "", "client_address": "", "client_phone": "", "client_email": "", "artist_name": "", "artist_vat": "", "artist_phone": "", "artist_email": "", "event_date": "", "amount": "", "due_date": "", "business_name": ""}'::jsonb
FROM agencies;

-- =====================================================
-- SCHEMA COMPLETE
-- =====================================================
-- All tables created with proper TIMESTAMPTZ
-- All triggers and functions in place
-- Row-Level Security enabled
-- Default agencies and templates loaded
-- Ready for production use
