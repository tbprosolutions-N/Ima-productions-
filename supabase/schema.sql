-- IMA OS Database Schema
-- Multi-tenant Agency Management System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agencies table (Multi-tenancy)
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) CHECK (type IN ('ima', 'bar', 'nightclub')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) CHECK (role IN ('producer', 'finance', 'manager', 'owner')),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  avatar_url TEXT,
  onboarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Clients table
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vat_id VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  contact_person VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Artists table
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vat_id VARCHAR(20),
  phone VARCHAR(20),
  email VARCHAR(255),
  bank_name VARCHAR(255),
  bank_branch VARCHAR(50),
  bank_account VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  producer_id UUID REFERENCES users(id),
  client_id UUID REFERENCES clients(id),
  artist_id UUID REFERENCES artists(id),
  event_date DATE NOT NULL,
  weekday VARCHAR(20),
  business_name VARCHAR(255) NOT NULL,
  invoice_name VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  approver VARCHAR(255),
  doc_type VARCHAR(20) CHECK (doc_type IN ('invoice', 'receipt', 'quote')),
  doc_number VARCHAR(50),
  due_date DATE,
  status VARCHAR(20) CHECK (status IN ('draft', 'pending', 'approved', 'paid', 'cancelled')) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) CHECK (type IN ('agreement', 'invoice', 'receipt', 'contract')),
  template TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_users_agency_id ON users(agency_id);
CREATE INDEX idx_events_agency_id ON events(agency_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_clients_agency_id ON clients(agency_id);
CREATE INDEX idx_artists_agency_id ON artists(agency_id);
CREATE INDEX idx_documents_agency_id ON documents(agency_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
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

-- Function to auto-create/update client from event
CREATE OR REPLACE FUNCTION sync_client_from_event()
RETURNS TRIGGER AS $$
BEGIN
  -- If client_id is not set but we have business_name, try to find or create client
  IF NEW.client_id IS NULL AND NEW.business_name IS NOT NULL THEN
    -- Try to find existing client by name
    SELECT id INTO NEW.client_id
    FROM clients
    WHERE agency_id = NEW.agency_id
      AND LOWER(name) = LOWER(NEW.business_name)
    LIMIT 1;
    
    -- If no client found, create one
    IF NEW.client_id IS NULL THEN
      INSERT INTO clients (agency_id, name, created_at, updated_at)
      VALUES (NEW.agency_id, NEW.business_name, NOW(), NOW())
      RETURNING id INTO NEW.client_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for client sync
CREATE TRIGGER sync_client_before_insert_event
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION sync_client_from_event();

CREATE TRIGGER sync_client_before_update_event
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION sync_client_from_event();

-- Function to auto-set weekday from event_date
CREATE OR REPLACE FUNCTION set_event_weekday()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_date IS NOT NULL THEN
    NEW.weekday = TO_CHAR(NEW.event_date, 'Day');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for weekday
CREATE TRIGGER set_weekday_before_insert_event
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_event_weekday();

CREATE TRIGGER set_weekday_before_update_event
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_event_weekday();

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

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

-- Users can delete events in their agency (owners and managers only)
CREATE POLICY "Managers can delete agency events" ON events
  FOR DELETE USING (
    agency_id IN (
      SELECT agency_id FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'manager')
    )
  );

-- Similar policies for clients, artists, and documents
CREATE POLICY "Users can read agency clients" ON clients
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage agency clients" ON clients
  FOR ALL USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can read agency artists" ON artists
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage agency artists" ON artists
  FOR ALL USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can read agency documents" ON documents
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage agency documents" ON documents
  FOR ALL USING (
    agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid())
  );

-- Insert default agencies
INSERT INTO agencies (name, type, settings) VALUES
  ('IMA Agency', 'ima', '{"currency": "ILS", "timezone": "Asia/Jerusalem"}'),
  ('Bar Events', 'bar', '{"currency": "ILS", "timezone": "Asia/Jerusalem"}'),
  ('Nightclub Elite', 'nightclub', '{"currency": "ILS", "timezone": "Asia/Jerusalem"}');

-- Insert default admin user (will be linked after auth signup)
-- Note: The actual user creation happens through Supabase Auth
-- This is a placeholder that will be populated after signup

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, agency_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'producer'),
    (SELECT id FROM agencies LIMIT 1) -- Default to first agency
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create default document templates
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
