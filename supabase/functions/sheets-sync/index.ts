/**
 * Supabase Edge Function: Google Sheets Sync (GAS Bridge)
 * Deno runtime. No direct Google API — POSTs payload to a Google Apps Script Web App (GAS_WEBHOOK_URL).
 *
 * Flow: Parse webhook/direct body → build { spreadsheetId?, sheets } → POST to GAS → update sync_queue from GAS response.
 * For autoSync: fetch events/clients/artists/expenses server-side, build sheets, then POST to GAS.
 *
 * Env secrets:
 *   GAS_WEBHOOK_URL            — URL of the GAS Web app (Deploy as Web app → Execute as Me → Anyone)
 *   SUPABASE_URL               — injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY   — injected by Supabase
 *
 * Deploy: npx supabase functions deploy sheets-sync --no-verify-jwt
 */

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOG_PREFIX = '[sheets-sync]';

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

async function postToGas(body: { spreadsheetId?: string; sheets: Record<string, string[][]> }, requestId: string): Promise<{ ok: boolean; error?: string; spreadsheetId?: string; spreadsheetUrl?: string; counts?: SheetCounts }> {
  const url = getGasWebhookUrl();
  if (!url) throw new Error('GAS_WEBHOOK_URL not set. Set it via supabase secrets set.');
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
    throw new Error(`GAS returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(data.error || `GAS ${res.status}: ${text.slice(0, 200)}`);
  }
  if (data.ok !== true && data.error) {
    throw new Error(data.error);
  }
  return data;
}

function isValidFolderId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{20,64}$/.test(id);
}

// ── Server-side data fetch and sheet build (for autoSync) ───────────────────────

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

async function getSpreadsheetIdForAgency(supabase: any, agencyId: string): Promise<string | null> {
  const { data } = await supabase.from('integrations').select('config').eq('agency_id', agencyId).eq('provider', 'sheets').maybeSingle();
  const id = (data as any)?.config?.spreadsheet_id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

async function fetchSyncDataForAgency(supabase: any, agencyId: string): Promise<SyncData> {
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

// ── Webhook payload parsing (JSON-first, no atob on record) ────────────────────

function isWebhookPayload(obj: unknown): obj is { type: string; table: string; record: unknown } {
  return obj != null && typeof obj === 'object' && 'record' in obj &&
    (obj as any).type === 'INSERT' && (obj as any).table === 'sync_queue';
}

async function parseRequestBody(req: Request): Promise<{ isWebhook: boolean; record: any; raw: any }> {
  const text = await req.text();
  let raw: any;
  try {
    raw = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    try {
      if (text.length > 0) raw = JSON.parse(atob(text));
      else raw = {};
    } catch {
      raw = {};
    }
  }
  if (raw == null || typeof raw !== 'object') return { isWebhook: false, record: null, raw: {} };
  if (isWebhookPayload(raw)) {
    let record = raw.record;
    if (record != null && typeof record === 'string') {
      try { record = JSON.parse(record); } catch { record = null; }
    }
    if (record != null && typeof record === 'object' && record.data != null && typeof record.data === 'string') {
      try { record = { ...record, data: JSON.parse(record.data) }; } catch { /* leave */ }
    }
    const valid = !!record?.id && !!record?.agency_id && record?.data != null;
    return { isWebhook: valid, record: valid ? record : null, raw };
  }
  return { isWebhook: false, record: null, raw };
}

// ── Entry ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  console.log(`${LOG_PREFIX} Function triggered`, { method: req.method });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' });

  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  let reqBody: any;
  try {
    const parsed = await parseRequestBody(req);
    if (parsed.isWebhook && parsed.record) reqBody = { type: 'INSERT', table: 'sync_queue', record: parsed.record };
    else if (parsed.raw != null && typeof parsed.raw === 'object') reqBody = parsed.raw;
    else reqBody = {};
  } catch (e: unknown) {
    console.error(`${LOG_PREFIX} ${requestId} Parse failed:`, e);
    return respond(400, { error: 'Invalid request body' });
  }

  const webhookRecord = reqBody?.type === 'INSERT' && reqBody?.table === 'sync_queue' ? reqBody?.record : null;
  if (webhookRecord?.id && webhookRecord?.agency_id && webhookRecord?.data) {
    const queueId = webhookRecord.id as string;
    const agencyId = String(webhookRecord.agency_id).trim();
    const data = webhookRecord.data as { action?: string; folderId?: string; spreadsheetId?: string; sheets?: Record<string, string[][]>; counts?: SheetCounts };
    const action = data?.action === 'createAndSync' ? 'createAndSync' : data?.action === 'sync' ? 'sync' : data?.action === 'syncEditable' ? 'syncEditable' : data?.action === 'autoSync' ? 'autoSync' : null;
    const sheets = data?.sheets && typeof data.sheets === 'object' ? data.sheets : undefined;
    const counts = data?.counts && typeof data.counts === 'object' ? data.counts : { events: 0, clients: 0, artists: 0, expenses: 0 };

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    if (!supabaseUrl || !supabaseKey) {
      console.error(`${LOG_PREFIX} ${requestId} Webhook: missing Supabase env`);
      return respond(502, { error: 'Server not configured' });
    }
    if (!getGasWebhookUrl()) {
      console.error(`${LOG_PREFIX} ${requestId} GAS_WEBHOOK_URL not set`);
      return respond(502, { error: 'GAS_WEBHOOK_URL not set. Set via supabase secrets set.' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const markProcessing = async () => {
      await supabase.from('sync_queue').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', queueId);
    };
    const markCompleted = async (result: object) => {
      await supabase.from('sync_queue').update({ status: 'completed', result, updated_at: new Date().toISOString() }).eq('id', queueId);
    };
    const markFailed = async (errMsg: string) => {
      await supabase.from('sync_queue').update({ status: 'failed', error_message: String(errMsg).slice(0, 500), result: null, updated_at: new Date().toISOString() }).eq('id', queueId);
    };

    if (!action) {
      await markFailed('Invalid webhook payload: missing action');
      return respond(400, { error: 'Invalid webhook payload', detail: 'Request must include record with action.' });
    }
    if (action !== 'autoSync' && !sheets) {
      await markFailed('Invalid webhook payload: missing sheets');
      return respond(400, { error: 'Invalid webhook payload', detail: 'Request must include record with sheets.' });
    }
    if (action !== 'autoSync' && action !== 'syncEditable' && !sheets?.['אירועים']) {
      await markFailed('Invalid webhook payload: missing אירועים sheet');
      return respond(400, { error: 'Invalid webhook payload', detail: 'Sheets must include אירועים.' });
    }

    let spreadsheetId = typeof data?.spreadsheetId === 'string' ? data.spreadsheetId.trim() : undefined;
    if ((action === 'sync' || action === 'syncEditable') && !spreadsheetId) {
      await markFailed('Missing spreadsheetId');
      return respond(400, { error: 'Missing spreadsheetId', detail: 'sync and syncEditable require spreadsheetId in data.' });
    }
    if (action === 'createAndSync') {
      const folderId = typeof data?.folderId === 'string' ? data.folderId.replace(/.*folders\//, '').trim() : undefined;
      if (!folderId || !isValidFolderId(folderId)) {
        await markFailed('Missing or invalid folderId');
        return respond(400, { error: 'Missing folderId', detail: 'createAndSync requires folderId in data.' });
      }
      spreadsheetId = undefined;
    }

    await markProcessing();
    console.log(`${LOG_PREFIX} ${requestId} Webhook queueId=${queueId} action=${action}`);
    console.table([{ requestId, queueId, action, agency_id: agencyId, has_sheets: !!sheets }]);

    try {
      let payloadSheets: Record<string, string[][]>;
      if (action === 'autoSync') {
        const sid = await getSpreadsheetIdForAgency(supabase, agencyId);
        if (!sid) {
          await markFailed('No Google Sheet linked for this agency. Run "Create & Sync" once from Settings.');
          return respond(400, { error: 'No spreadsheet linked', detail: 'Create and sync a sheet first from Settings.' });
        }
        spreadsheetId = sid;
        const syncData = await fetchSyncDataForAgency(supabase, agencyId);
        payloadSheets = buildSheetsFromData(syncData);
      } else {
        payloadSheets = sheets!;
      }

      const gasBody: { spreadsheetId?: string; sheets: Record<string, string[][]> } = { sheets: payloadSheets };
      if (spreadsheetId) gasBody.spreadsheetId = spreadsheetId;

      const gasRes = await postToGas(gasBody, requestId);

      if (!gasRes.ok) {
        await markFailed(gasRes.error || 'GAS sync failed');
        return respond(502, { error: gasRes.error || 'GAS sync failed' });
      }

      const resultSpreadsheetId = gasRes.spreadsheetId || spreadsheetId;
      const resultSpreadsheetUrl = gasRes.spreadsheetUrl || (resultSpreadsheetId ? `https://docs.google.com/spreadsheets/d/${resultSpreadsheetId}/edit` : undefined);
      const resultCounts = gasRes.counts || counts;

      if (action === 'createAndSync' && resultSpreadsheetId) {
        await supabase.from('integrations').upsert([{
          agency_id: agencyId,
          provider: 'sheets',
          status: 'connected',
          config: { spreadsheet_id: resultSpreadsheetId, sheet_name: 'Events' },
          connected_at: new Date().toISOString(),
        }], { onConflict: 'agency_id,provider' });
      }

      await markCompleted({
        spreadsheetId: resultSpreadsheetId,
        spreadsheetUrl: resultSpreadsheetUrl,
        counts: resultCounts,
      });
      return respond(200, { ok: true, queueId, spreadsheetId: resultSpreadsheetId, counts: resultCounts });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error(`${LOG_PREFIX} ${requestId} Webhook error:`, msg);
      await markFailed(msg);
      return respond(502, { error: msg });
    }
  }

  // ── Direct call (legacy): require agencyId + action + sheets, POST to GAS ─────
  const action = typeof reqBody.action === 'string' ? reqBody.action.trim() : undefined;
  const agencyId = typeof reqBody.agencyId === 'string' ? reqBody.agencyId.trim() : undefined;
  const spreadsheetId = typeof reqBody.spreadsheetId === 'string' ? reqBody.spreadsheetId.trim() : undefined;
  const sheets = reqBody.sheets && typeof reqBody.sheets === 'object' ? reqBody.sheets : undefined;

  if (!agencyId) return respond(400, { error: 'Missing agencyId' });
  if (!getGasWebhookUrl()) return respond(502, { error: 'GAS_WEBHOOK_URL not set' });
  if (!action || !sheets || !sheets['אירועים']) return respond(400, { error: 'Missing action or sheets with אירועים' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !supabaseKey) return respond(502, { error: 'Supabase not configured' });

  try {
    const gasBody: { spreadsheetId?: string; sheets: Record<string, string[][]> } = { sheets };
    if (spreadsheetId) gasBody.spreadsheetId = spreadsheetId;
    const gasRes = await postToGas(gasBody, requestId);
    if (!gasRes.ok) return respond(502, { error: gasRes.error || 'GAS sync failed' });
    return respond(200, { ok: true, spreadsheetId: gasRes.spreadsheetId || spreadsheetId, spreadsheetUrl: gasRes.spreadsheetUrl, counts: gasRes.counts });
  } catch (e: any) {
    console.error(`${LOG_PREFIX} ${requestId} Direct error:`, e?.message);
    return respond(502, { error: e?.message ?? 'Backup request failed' });
  }
});
