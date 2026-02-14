import type { Artist, Client, Event } from '@/types';
import { formatCurrency, formatDate, getWeekday, parseTemplateVariables } from '@/lib/utils';

export type SentDocRecipient = 'client' | 'artist';

export type SentDocKind = 'agreement' | 'custom' | 'template';

export type SentDocRecord = {
  id: string;
  agency_id: string;
  created_at: string;
  kind: SentDocKind;
  to: SentDocRecipient;
  to_id: string;
  to_name: string;
  to_email?: string;
  event_id?: string;
  title: string;
  rendered: string;
};

function key(agencyId: string) {
  return `ima_demo_${agencyId}_sent_docs`;
}

export function demoGetSentDocs(agencyId: string): SentDocRecord[] {
  try {
    const raw = localStorage.getItem(key(agencyId));
    const parsed = raw ? (JSON.parse(raw) as SentDocRecord[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function demoAddSentDoc(
  agencyId: string,
  record: Omit<SentDocRecord, 'id' | 'created_at' | 'agency_id'>
): SentDocRecord {
  const existing = demoGetSentDocs(agencyId);
  const full: SentDocRecord = {
    id: globalThis.crypto?.randomUUID?.() ?? `sent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
    agency_id: agencyId,
    ...record,
  };
  localStorage.setItem(key(agencyId), JSON.stringify([full, ...existing]));
  return full;
}

export function buildTemplateVariables(opts: { event?: Event; client?: Client; artist?: Artist }): Record<string, string> {
  const ev = opts.event;
  const client = opts.client;
  const artist = opts.artist;

  const due = ev?.due_date ? formatDate(ev.due_date) : '';

  return {
    // Event
    event_date: ev ? formatDate(ev.event_date) : '',
    weekday: ev ? (ev.weekday || getWeekday(ev.event_date)) : '',
    business_name: ev?.business_name || '',
    invoice_name: ev?.invoice_name || '',
    amount: ev ? formatCurrency(ev.amount || 0) : '',
    due_date: due,
    payment_date: due,
    status: ev?.status || '',

    // Client
    client_name: client?.name || '',
    client_contact: client?.contact_person || '',
    client_email: client?.email || '',
    client_phone: client?.phone || '',
    client_vat: client?.vat_id || '',
    client_address: client?.address || '',
    // Clients table doesn't currently include bank fields in production schema.
    client_bank_name: '',
    client_bank_branch: '',
    client_bank_account: '',

    // Artist
    artist_name: artist?.name || '',
    artist_full_name: artist?.full_name || '',
    artist_company_name: artist?.company_name || '',
    artist_email: artist?.email || '',
    artist_phone: artist?.phone || '',
    artist_vat: artist?.vat_id || '',
    artist_bank_name: artist?.bank_name || '',
    artist_bank_branch: artist?.bank_branch || '',
    artist_bank_account: artist?.bank_account || '',
  };
}

export function renderTemplate(content: string, vars: Record<string, string>): string {
  return parseTemplateVariables(content, vars);
}

