/**
 * Client-side Google Sheets sync — bypasses Netlify to avoid 502.
 * Calls Google Sheets/Drive APIs directly from the browser using the user's OAuth token.
 * Saves spreadsheet ID to Supabase integrations via RLS (owner can write).
 */
import { supabase } from '@/lib/supabase';
import { cleanNotes } from '@/lib/notesCleanup';

export type SheetsSyncClientResult =
  | { ok: true; spreadsheetId: string; spreadsheetUrl: string; counts: { events: number; clients: number; artists: number; expenses: number } }
  | { ok: false; error: string; code?: string };

function getGoogleToken(): string | null {
  try { return localStorage.getItem('google_provider_token'); } catch { return null; }
}

export function hasGoogleToken(): boolean {
  return !!getGoogleToken();
}

export function clearGoogleTokens(): void {
  try {
    localStorage.removeItem('google_provider_token');
    localStorage.removeItem('google_provider_refresh_token');
  } catch {}
}

async function googleFetch<T = unknown>(url: string, init: RequestInit & { token: string }): Promise<T> {
  const { token, ...opts } = init;
  const res = await fetch(url, {
    ...opts,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...opts.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearGoogleTokens();
      throw new Error(`Google API ${res.status}: ${text}`);
    }
    throw new Error(`Google API ${res.status}: ${text}`);
  }
  try { return JSON.parse(text) as T; } catch { return text as T; }
}

// ── Row mappers (match backend) ──────────────────────────────────────────────

const eventHeaders = () => ['תאריך', 'שם עסק', 'שם לחשבונית', 'סכום', 'סטטוס', 'אמן', 'לקוח', 'תאריך תשלום', 'סוג מסמך', 'הערות', 'סנכרון Morning', 'עודכן'];
const clientHeaders = () => ['שם', 'איש קשר', 'טלפון', 'אימייל', 'ח.פ/עוסק', 'כתובת', 'הערות'];
const artistHeaders = () => ['שם', 'שם מלא', 'חברה', 'טלפון', 'אימייל', 'ח.פ/עוסק', 'בנק', 'סניף', 'חשבון', 'הערות'];
const financeHeaders = () => ['קובץ', 'ספק', 'סכום', 'מע״מ', 'תאריך הוצאה', 'סנכרון Morning', 'הערות'];

function eventToRow(e: any, artistMap: Map<string, string>, clientMap: Map<string, string>): string[] {
  return [
    e.event_date || '',
    e.business_name || '',
    e.invoice_name || '',
    String(e.amount ?? ''),
    e.status || '',
    artistMap.get(e.artist_id) || e.artist_id || '',
    clientMap.get(e.client_id) || e.client_id || '',
    e.payment_date || '',
    e.doc_type || '',
    cleanNotes(e.notes),
    e.morning_sync_status || '',
    e.updated_at || '',
  ];
}

function clientToRow(c: any): string[] {
  return [c.name || '', c.contact_person || '', c.phone || '', c.email || '', c.vat_id || '', c.address || '', cleanNotes(c.notes)];
}

function artistToRow(a: any): string[] {
  return [a.name || '', a.full_name || '', a.company_name || '', a.phone || '', a.email || '', a.vat_id || '', a.bank_name || '', a.bank_branch || '', a.bank_account || '', cleanNotes(a.notes)];
}

function financeToRow(f: any): string[] {
  return [f.filename || '', f.vendor || f.supplier_name || '', String(f.amount ?? ''), String(f.vat ?? ''), f.expense_date || '', f.morning_status || '', f.notes || ''];
}

// ── Create spreadsheet (omit locale to avoid "Unsupported locale" from Google) ─
async function createSpreadsheet(token: string, title: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheetTabs = ['אירועים', 'לקוחות', 'אמנים', 'פיננסים'];
  const body = {
    properties: { title },
    sheets: sheetTabs.map(t => ({ properties: { title: t } })),
  };
  const res = await googleFetch<{ spreadsheetId: string; spreadsheetUrl: string }>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    { method: 'POST', token, body: JSON.stringify(body) }
  );
  return { spreadsheetId: res.spreadsheetId, spreadsheetUrl: res.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${res.spreadsheetId}/edit` };
}

async function moveToFolder(token: string, fileId: string, folderId: string): Promise<void> {
  const fileRes = await googleFetch<{ parents?: string[] }>(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    { token }
  );
  const oldParent = fileRes?.parents?.[0] || 'root';
  await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}&removeParents=${oldParent}`,
    { method: 'PATCH', token, body: '{}' }
  );
}

async function writeSheetValues(token: string, spreadsheetId: string, sheetName: string, headers: string[], rows: string[][]): Promise<void> {
  const values = [headers, ...rows];
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`,
    { method: 'PUT', token, body: JSON.stringify({ values }) }
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

export type SyncData = {
  events: any[];
  clients: any[];
  artists: any[];
  expenses: any[];
};

/**
 * Create a new spreadsheet in the given Drive folder and sync all data.
 * All Google API calls run in the browser — no backend required.
 */
export async function createSheetAndSyncClient(
  agencyId: string,
  folderId: string,
  data: SyncData
): Promise<SheetsSyncClientResult> {
  const token = getGoogleToken();
  if (!token) {
    return { ok: false, error: 'טוקן Google חסר. התנתק/י והתחבר/י מחדש עם Google.', code: 'NO_TOKEN' };
  }

  try {
    const title = `NPC Sync — ${new Date().toISOString().slice(0, 10)}`;
    const { spreadsheetId, spreadsheetUrl } = await createSpreadsheet(token, title);

    if (folderId) {
      try {
        await moveToFolder(token, spreadsheetId, folderId);
      } catch (e) {
        console.warn('Could not move spreadsheet to folder:', e);
      }
    }

    const artistMap = new Map(data.artists.map((a: any) => [a.id, a.name]));
    const clientMap = new Map(data.clients.map((c: any) => [c.id, c.name]));
    const enrichedEvents = data.events.map((e: any) => ({ ...e }));

    await Promise.all([
      writeSheetValues(token, spreadsheetId, 'אירועים', eventHeaders(), enrichedEvents.map((e: any) => eventToRow(e, artistMap, clientMap))),
      writeSheetValues(token, spreadsheetId, 'לקוחות', clientHeaders(), data.clients.map(clientToRow)),
      writeSheetValues(token, spreadsheetId, 'אמנים', artistHeaders(), data.artists.map(artistToRow)),
      writeSheetValues(token, spreadsheetId, 'פיננסים', financeHeaders(), data.expenses.map(financeToRow)),
    ]);

    const counts = {
      events: data.events.length,
      clients: data.clients.length,
      artists: data.artists.length,
      expenses: data.expenses.length,
    };

    const { error } = await supabase.from('integrations').upsert(
      [{
        agency_id: agencyId,
        provider: 'sheets',
        status: 'connected',
        config: { spreadsheet_id: spreadsheetId, folder_id: folderId, sheet_name: 'Events' },
        connected_at: new Date().toISOString(),
      }],
      { onConflict: 'agency_id,provider' }
    );
    if (error) console.warn('Failed to save integration:', error);

    return { ok: true, spreadsheetId, spreadsheetUrl, counts };
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes('Google API 401') || msg.includes('Google API 403')) {
      return { ok: false, error: 'טוקן Google פג תוקף. התנתק/י והתחבר/י מחדש עם Google.', code: 'TOKEN_EXPIRED' };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Re-sync all data to an existing spreadsheet.
 */
export async function resyncSheetClient(
  _agencyId: string,
  spreadsheetId: string,
  data: SyncData
): Promise<SheetsSyncClientResult> {
  const token = getGoogleToken();
  if (!token) {
    return { ok: false, error: 'טוקן Google חסר. התנתק/י והתחבר/י מחדש עם Google.', code: 'NO_TOKEN' };
  }

  try {
    const artistMap = new Map(data.artists.map((a: any) => [a.id, a.name]));
    const clientMap = new Map(data.clients.map((c: any) => [c.id, c.name]));
    const enrichedEvents = data.events.map((e: any) => ({ ...e }));

    await Promise.all([
      writeSheetValues(token, spreadsheetId, 'אירועים', eventHeaders(), enrichedEvents.map((e: any) => eventToRow(e, artistMap, clientMap))),
      writeSheetValues(token, spreadsheetId, 'לקוחות', clientHeaders(), data.clients.map(clientToRow)),
      writeSheetValues(token, spreadsheetId, 'אמנים', artistHeaders(), data.artists.map(artistToRow)),
      writeSheetValues(token, spreadsheetId, 'פיננסים', financeHeaders(), data.expenses.map(financeToRow)),
    ]);

    const counts = {
      events: data.events.length,
      clients: data.clients.length,
      artists: data.artists.length,
      expenses: data.expenses.length,
    };

    return {
      ok: true,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      counts,
    };
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes('Google API 401') || msg.includes('Google API 403')) {
      return { ok: false, error: 'טוקן Google פג תוקף. התנתק/י והתחבר/י מחדש עם Google.', code: 'TOKEN_EXPIRED' };
    }
    return { ok: false, error: msg };
  }
}
