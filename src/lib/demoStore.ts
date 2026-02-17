import type { Agency, Artist, Client, Document, DocumentTemplateType, DocumentSendTo, Event, EventStatus, DocumentType } from '@/types';

export function isDemoMode(): boolean {
  // Production: never enable demo. Ensures live site always uses real Supabase.
  if (import.meta.env.PROD) return false;
  // Development only: demo when user chose "Demo login" or VITE_DEMO_BYPASS=true (default: false)
  if (!import.meta.env.DEV) return false;
  if (localStorage.getItem('demo_authenticated') === 'true') return true;
  return String(import.meta.env.VITE_DEMO_BYPASS || '').toLowerCase() === 'true';
}

export const DEMO_AGENCY: Agency = {
  id: 'ima-productions-id',
  name: 'NPC',
  type: 'ima',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  settings: {},
};

function key(agencyId: string, table: string) {
  return `ima_demo_${agencyId}_${table}`;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `demo-${Math.random().toString(36).slice(2)}`;
}

export function demoGetEvents(agencyId: string): Event[] {
  return safeJsonParse<Event[]>(localStorage.getItem(key(agencyId, 'events')), []);
}
export function demoSetEvents(agencyId: string, events: Event[]) {
  localStorage.setItem(key(agencyId, 'events'), JSON.stringify(events));
}

export function demoGetArtists(agencyId: string): Artist[] {
  return safeJsonParse<Artist[]>(localStorage.getItem(key(agencyId, 'artists')), []);
}
export function demoSetArtists(agencyId: string, artists: Artist[]) {
  localStorage.setItem(key(agencyId, 'artists'), JSON.stringify(artists));
}

export function demoGetClients(agencyId: string): Client[] {
  const raw = safeJsonParse<any[]>(localStorage.getItem(key(agencyId, 'clients')), []);
  // Backward-compatible migration (older demo data used business_name/contact_name)
  return (raw || []).map((c) => ({
    ...c,
    name: c?.name ?? c?.business_name ?? '',
    contact_person: c?.contact_person ?? c?.contact_name ?? undefined,
  })) as Client[];
}
export function demoSetClients(agencyId: string, clients: Client[]) {
  localStorage.setItem(key(agencyId, 'clients'), JSON.stringify(clients));
}

export function demoGetDocuments(agencyId: string): Document[] {
  return safeJsonParse<Document[]>(localStorage.getItem(key(agencyId, 'documents')), []);
}
export function demoSetDocuments(agencyId: string, docs: Document[]) {
  localStorage.setItem(key(agencyId, 'documents'), JSON.stringify(docs));
}

export function demoUpsertArtist(agencyId: string, partial: Omit<Artist, 'id' | 'agency_id' | 'created_at' | 'updated_at'>, id?: string): Artist {
  const now = new Date().toISOString();
  return {
    id: id ?? uuid(),
    agency_id: agencyId,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

export function demoUpsertClient(agencyId: string, partial: Omit<Client, 'id' | 'agency_id' | 'created_at' | 'updated_at'>, id?: string): Client {
  const now = new Date().toISOString();
  return {
    id: id ?? uuid(),
    agency_id: agencyId,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

export function demoUpsertDocument(
  agencyId: string,
  partial: { title: string; type: DocumentTemplateType; content: string; send_to?: DocumentSendTo },
  id?: string
): Document {
  const now = new Date().toISOString();
  return {
    id: id ?? uuid(),
    agency_id: agencyId,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

export function demoUpsertEvent(
  agencyId: string,
  partial: Omit<Event, 'id' | 'agency_id' | 'created_at' | 'updated_at'>,
  id?: string
): Event {
  const now = new Date().toISOString();
  return {
    id: id ?? uuid(),
    agency_id: agencyId,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

// Helpers to build valid defaults
export function demoDefaultEvent(agencyId: string, userId: string, opts: { business_name: string; invoice_name?: string; amount?: number; event_date?: string }): Event {
  const event_date = opts.event_date ? new Date(opts.event_date).toISOString() : new Date().toISOString();
  const status: EventStatus = 'draft';
  const doc_type: DocumentType = 'tax_invoice';

  return demoUpsertEvent(agencyId, {
    producer_id: userId,
    event_date,
    weekday: new Date(event_date).toLocaleDateString('he-IL', { weekday: 'long' }),
    business_name: opts.business_name,
    invoice_name: opts.invoice_name ?? '',
    amount: opts.amount ?? 0,
    payment_date: undefined,
    artist_fee_type: 'fixed',
    artist_fee_value: 0,
    artist_fee_amount: 0,
    doc_type,
    doc_number: '',
    due_date: '',
    status,
    notes: '',
    morning_sync_status: 'not_synced',
    client_id: undefined,
    artist_id: undefined,
  });
}

