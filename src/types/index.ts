export type UserRole = 'producer' | 'finance' | 'manager' | 'owner';

export type BusinessType = 'ima' | 'bar' | 'nightclub';

export type EventStatus = 'draft' | 'pending' | 'approved' | 'paid' | 'cancelled';

export type DocumentType = 'tax_invoice' | 'receipt' | 'payment_request';

export type MorningSyncStatus = 'not_synced' | 'syncing' | 'synced' | 'error';

export type DocumentTemplateType = 'artist_agreement' | 'client_agreement' | 'appearance_agreement' | 'invoice_template' | 'other';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  agency_id: string;
  // Optional fine-grained permissions (demo-first)
  permissions?: {
    finance?: boolean;
    users?: boolean;
    integrations?: boolean;
    events_create?: boolean;
    events_delete?: boolean;
  };
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  onboarded: boolean;
}

export interface Agency {
  id: string;
  name: string;
  type: BusinessType;
  created_at: string;
  updated_at: string;
  settings: Record<string, any>;
}

export interface Event {
  id: string;
  agency_id: string;
  producer_id: string;
  event_date: string;
  weekday: string;
  business_name: string;
  invoice_name: string;
  // Company income for this event (client -> IMA)
  amount: number;
  // Client payment date (expected/actual depends on workflow)
  payment_date?: string;
  // Artist payout per event
  artist_fee_type?: 'fixed' | 'percent' | 'none';
  artist_fee_value?: number;
  artist_fee_amount?: number;
  approver?: string;
  doc_type: DocumentType;
  doc_number?: string;
  due_date?: string;
  status: EventStatus;
  notes?: string;
  morning_sync_status?: MorningSyncStatus;
  /** When set, row is read-only (official document in Morning). Use "Request Correction" to ask for changes. */
  morning_id?: string;
  morning_document_id?: string;
  morning_document_number?: string;
  morning_document_url?: string;
  morning_last_error?: string | null;
  /** Fetched from Morning API (e.g. 'paid', 'open') for display/sync */
  morning_doc_status?: string | null;
  created_at: string;
  updated_at: string;
  client_id?: string;
  artist_id?: string;
  // Google Calendar sync (company calendar)
  google_event_id?: string;
  google_event_html_link?: string;
  // Optional: copy in admin-owned artist shared calendar
  google_artist_event_id?: string;
  google_artist_event_html_link?: string;
  google_sync_status?: MorningSyncStatus;
  google_synced_at?: string;
}

export interface Artist {
  id: string;
  agency_id: string;
  name: string;
  color?: string;
  full_name?: string;
  company_name?: string;
  vat_id?: string;
  phone?: string;
  email?: string;
  calendar_email?: string;
  google_calendar_id?: string;
  bank_id?: string;
  bank_name?: string;
  bank_branch?: string;
  bank_account?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  agency_id: string;
  name: string;
  contact_person?: string;
  vat_id?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  agency_id: string;
  title: string;
  type: DocumentTemplateType;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface KPI {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  insight?: string;
}

export type IntegrationProvider = 'google' | 'morning' | 'sheets';
export type IntegrationStatus = 'disconnected' | 'connected' | 'error';
export interface IntegrationConnection {
  id: string;
  agency_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  token_ref?: string | null;
  config?: Record<string, any>;
  last_error?: string | null;
  connected_by?: string | null;
  connected_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type SyncJobStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export interface SyncJob {
  id: string;
  agency_id: string;
  provider: IntegrationProvider;
  kind: string;
  status: SyncJobStatus;
  payload?: Record<string, any>;
  result?: Record<string, any>;
  last_error?: string | null;
  created_by?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}
