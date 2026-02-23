/**
 * Supabase Edge Function: export-to-sheets (Data Warehouse backup)
 * Deno runtime. Fetches a full snapshot of events, clients, artists, finance_expenses
 * for the given agency and POSTs it to the Google Apps Script Web App (GAS_WEBHOOK_URL).
 * GAS overwrites the sheet with the snapshot — no real-time sync, no sync_queue.
 *
 * Invoked from Settings → Backup: "Export to Sheets".
 * Body: { agency_id: string, spreadsheet_id?: string }
 * Returns: { ok: boolean, spreadsheetId?, spreadsheetUrl?, counts?: { events, clients, artists, expenses }, error? }
 *
 * Env: GAS_WEBHOOK_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Deploy: npx supabase functions deploy export-to-sheets --no-verify-jwt
 */

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOG_PREFIX = '[export-to-sheets]';

type SheetCounts = { events: number; clients: number; artists: number; expenses: number };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function getGasWebhookUrl(): string | null {
  const url = Deno.env.get('GAS_WEBHOOK_URL')?.trim();
  return url && url.startsWith('http') ? url : null;
}

async function postToGas(body: { spreadsheetId?: string; sheets: Record<string, string[][]> }): Promise<{ ok: boolean; error?: string; spreadsheetId?: string; spreadsheetUrl?: string; counts?: SheetCounts }> {
  const url = getGasWebhookUrl();
  if (!url) throw new Error('GAS_WEBHOOK_URL not set.');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    console.error(`${LOG_PREFIX} GAS non-JSON response (status=${res.status}):`, text.slice(0, 300));
    throw new Error(`Google Apps Script returned invalid JSON (status ${res.status}). Check GAS deployment and doPost.`);
  }
  if (!res.ok) {
    console.error(`${LOG_PREFIX} GAS HTTP error: status=${res.status}`, data);
    throw new Error(data.error || `Google Apps Script error (${res.status}): ${text.slice(0, 200)}`);
  }
  if (data.ok !== true && data.error) {
    console.error(`${LOG_PREFIX} GAS reported error:`, data.error);
    throw new Error(data.error);
  }
  return data;
}

const EVENT_HEADERS = ['תאריך', 'שם עסק', 'שם לחשבונית', 'סכום', 'סטטוס', 'אמן', 'לקוח', 'תאריך תשלום', 'סוג מסמך', 'הערות', 'סנכרון Morning', 'עודכן'];
const CLIENT_HEADERS = ['שם', 'איש קשר', 'טלפון', 'אימייל', 'ח.פ/עוסק', 'כתובת', 'הערות'];
const ARTIST_HEADERS = ['שם', 'שם מלא', 'חברה', 'טלפון', 'אימייל', 'ח.פ/עוסק', 'בנק', 'סניף', 'חשבון', 'הערות'];
const FINANCE_HEADERS = ['קובץ', 'ספק', 'סכום', 'מע״מ', 'תאריך הוצאה', 'סנכרון Morning', 'הערות'];

function notesVal(s: unknown): string {
  const t = typeof s === 'string' ? s : s != null ? String(s) : '';
  return t.replace(/\r\n/g, '\n').trim();
}

function eventRow(e: any, artistMap: Map<string, string>, clientMap: Map<string, string>): string[] {
  return [
    e.event_date || '', e.business_name || '', e.invoice_name || '',
    String(e.amount ?? ''), e.status || '',
    artistMap.get(e.artist_id) || e.artist_id || '',
    clientMap.get(e.client_id) || e.client_id || '',
    e.payment_date || '', e.doc_type || '', notesVal(e.notes),
    e.morning_sync_status || '', e.updated_at || '',
  ];
}
function clientRow(c: any): string[] {
  return [c.name || '', c.contact_person || '', c.phone || '', c.email || '', c.vat_id || '', c.address || '', notesVal(c.notes)];
}
function artistRow(a: any): string[] {
  return [a.name || '', a.full_name || '', a.company_name || '', a.phone || '', a.email || '', a.vat_id || '', a.bank_name || '', a.bank_branch || '', a.bank_account || '', notesVal(a.notes)];
}
function financeRow(f: any): string[] {
  return [f.filename || '', f.vendor || f.supplier_name || '', String(f.amount ?? ''), String(f.vat ?? ''), f.expense_date || '', f.morning_status || '', f.notes || ''];
}

type SyncData = { events: any[]; clients: any[]; artists: any[]; expenses: any[] };

function buildSheetsFromData(data: SyncData): Record<string, string[][]> {
  const artistMap = new Map(data.artists.map((a: any) => [a.id, a.name]));
  const clientMap = new Map(data.clients.map((c: any) => [c.id, c.name]));
  return {
    'אירועים': [EVENT_HEADERS, ...data.events.map((e: any) => eventRow(e, artistMap, clientMap))],
    'לקוחות': [CLIENT_HEADERS, ...data.clients.map((c: any) => clientRow(c))],
    'אמנים': [ARTIST_HEADERS, ...data.artists.map((a: any) => artistRow(a))],
    'פיננסים': [FINANCE_HEADERS, ...data.expenses.map((f: any) => financeRow(f))],
  };
}

async function fetchSnapshotForAgency(supabase: any, agencyId: string): Promise<SyncData> {
  const COLS = {
    events: 'id,agency_id,event_date,business_name,invoice_name,amount,status,doc_type,payment_date,notes,artist_id,client_id,morning_sync_status,updated_at',
    clients: 'id,agency_id,name,contact_person,phone,email,vat_id,address,notes',
    artists: 'id,agency_id,name,full_name,company_name,phone,email,vat_id,bank_name,bank_branch,bank_account,notes',
    expenses: 'id,agency_id,filename,vendor,supplier_name,amount,vat,expense_date,morning_status,notes',
  };
  const [er, cr, ar, ex] = await Promise.all([
    supabase.from('events').select(COLS.events).eq('agency_id', agencyId).order('event_date', { ascending: false }).limit(2000),
    supabase.from('clients').select(COLS.clients).eq('agency_id', agencyId).order('name').limit(2000),
    supabase.from('artists').select(COLS.artists).eq('agency_id', agencyId).order('name').limit(2000),
    supabase.from('finance_expenses').select(COLS.expenses).eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(2000),
  ]);
  return {
    events: (er.data || []) as any[],
    clients: (cr.data || []) as any[],
    artists: (ar.data || []) as any[],
    expenses: (ex.data || []) as any[],
  };
}

Deno.serve(async (req: Request) => {
  const hasGasUrl = !!getGasWebhookUrl();
  console.log(`${LOG_PREFIX} triggered`, { method: req.method, GAS_WEBHOOK_URL_set: hasGasUrl });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !supabaseKey) {
    return respond(502, { ok: false, error: 'Server not configured (missing Supabase env)' });
  }
  if (!hasGasUrl) {
    console.error(`${LOG_PREFIX} GAS_WEBHOOK_URL not set. Set it in Supabase Dashboard → Project Settings → Edge Functions → Secrets.`);
    return respond(502, { ok: false, error: 'GAS_WEBHOOK_URL not set. Add the Google Apps Script Web app URL in Supabase secrets.' });
  }

  let body: { agency_id?: string; spreadsheet_id?: string };
  try {
    const text = await req.text();
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return respond(400, { ok: false, error: 'Invalid JSON body' });
  }

  const agencyId = typeof body?.agency_id === 'string' ? body.agency_id.trim() : undefined;
  const spreadsheetId = typeof body?.spreadsheet_id === 'string' ? body.spreadsheet_id.trim() || undefined : undefined;

  if (!agencyId) {
    return respond(400, { ok: false, error: 'Missing agency_id' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const data = await fetchSnapshotForAgency(supabase, agencyId);
    const sheets = buildSheetsFromData(data);

    const gasBody: { spreadsheetId?: string; sheets: Record<string, string[][]> } = { sheets };
    if (spreadsheetId) gasBody.spreadsheetId = spreadsheetId;

    const gasRes = await postToGas(gasBody);

    if (!gasRes.ok) {
      return respond(502, { ok: false, error: gasRes.error || 'GAS export failed' });
    }

    const resultId = gasRes.spreadsheetId || spreadsheetId;
    const resultUrl = gasRes.spreadsheetUrl || (resultId ? `https://docs.google.com/spreadsheets/d/${resultId}/edit` : undefined);
    const counts = gasRes.counts || {
      events: data.events.length,
      clients: data.clients.length,
      artists: data.artists.length,
      expenses: data.expenses.length,
    };

    if (resultId && !spreadsheetId) {
      await supabase.from('integrations').upsert([{
        agency_id: agencyId,
        provider: 'sheets',
        status: 'connected',
        config: { spreadsheet_id: resultId, sheet_name: 'Events' },
        connected_at: new Date().toISOString(),
      }], { onConflict: 'agency_id,provider' });
    }

    return respond(200, {
      ok: true,
      spreadsheetId: resultId,
      spreadsheetUrl: resultUrl,
      counts,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error(`${LOG_PREFIX} error:`, msg, e?.stack);
    return respond(502, { ok: false, error: msg });
  }
});
