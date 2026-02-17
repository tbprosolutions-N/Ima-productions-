/**
 * Netlify Function: Google Sheets Sync API.
 * Creates a spreadsheet in a Drive folder and syncs all agency data.
 * Uses Service Account JWT auth (no user OAuth). User shares the Drive folder with the SA email.
 *
 * Env:
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - GOOGLE_SA_CLIENT_EMAIL (service account email)
 * - GOOGLE_SA_PRIVATE_KEY (PEM private key; newlines as \n in env)
 */

import { createSign } from 'crypto';

// ── Custom error for Google auth failures ───────────────────────────────────

class GoogleAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'GoogleAuthError'; }
}

// ── Service Account JWT → access token ───────────────────────────────────────

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Get Google access token using Service Account credentials (JWT grant). Uses GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY from Netlify env. */
async function getServiceAccountAccessToken(): Promise<string> {
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.GOOGLE_SA_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKeyRaw) {
    throw new Error('GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY must be set in Netlify env');
  }
  // Restore newlines in PEM (env often has literal \n)
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signatureInput = `${headerB64}.${payloadB64}`;

  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = base64UrlEncode(sign.sign(privateKey));
  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google OAuth2 token error ${res.status}: ${text}`);
  const data = JSON.parse(text) as { access_token?: string };
  const token = data?.access_token;
  if (!token) throw new Error('No access_token in Google OAuth2 response');
  return token;
}

// ── Google API helpers ──────────────────────────────────────────────────────

async function googleApi(args: { url: string; method?: string; token: string; body?: unknown }) {
  const res = await fetch(args.url, {
    method: args.method || 'GET',
    headers: {
      authorization: `Bearer ${args.token}`,
      'content-type': 'application/json',
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new GoogleAuthError(`Google API ${res.status}: ${text}`);
    }
    throw new Error(`Google API ${res.status}: ${text}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

// ── Spreadsheet creation & data writing ─────────────────────────────────────

async function createSpreadsheetInFolder(token: string, title: string, folderId: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheetTabs = ['אירועים', 'לקוחות', 'אמנים', 'פיננסים'];
  const spreadsheet = await googleApi({
    url: 'https://sheets.googleapis.com/v4/spreadsheets',
    method: 'POST',
    token,
    body: {
      properties: { title, locale: 'he_IL' },
      sheets: sheetTabs.map(t => ({ properties: { title: t } })),
    },
  }) as { spreadsheetId: string; spreadsheetUrl: string };

  if (folderId) {
    try {
      const fileRes = await googleApi({
        url: `https://www.googleapis.com/drive/v3/files/${spreadsheet.spreadsheetId}?fields=parents`,
        token,
      }) as { parents?: string[] };
      const oldParent = fileRes?.parents?.[0] || 'root';
      await googleApi({
        url: `https://www.googleapis.com/drive/v3/files/${spreadsheet.spreadsheetId}?addParents=${folderId}&removeParents=${oldParent}`,
        method: 'PATCH',
        token,
        body: {},
      });
    } catch (e: any) {
      if (e instanceof GoogleAuthError) throw e;
      const msg = e?.message || String(e);
      throw new Error(
        `Spreadsheet was created but could not be moved to the folder. ` +
        `Ensure the folder is shared with the Service Account email (GOOGLE_SA_CLIENT_EMAIL) with Editor access. Details: ${msg}`
      );
    }
  }

  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
  };
}

function eventHeaders(): string[] {
  return ['תאריך', 'שם עסק', 'שם לחשבונית', 'סכום', 'סטטוס', 'אמן', 'לקוח', 'תאריך תשלום', 'סוג מסמך', 'הערות', 'סנכרון Morning', 'עודכן'];
}

function clientHeaders(): string[] {
  return ['שם', 'איש קשר', 'טלפון', 'אימייל', 'ח.פ/עוסק', 'כתובת', 'הערות'];
}

function artistHeaders(): string[] {
  return ['שם', 'שם מלא', 'חברה', 'טלפון', 'אימייל', 'ח.פ/עוסק', 'בנק', 'סניף', 'חשבון', 'הערות'];
}

function financeHeaders(): string[] {
  return ['קובץ', 'ספק', 'סכום', 'מע״מ', 'תאריך הוצאה', 'סנכרון Morning', 'הערות'];
}

function eventToRow(e: any): string[] {
  return [
    e.event_date || '', e.business_name || '', e.invoice_name || '',
    String(e.amount ?? ''), e.status || '', e.artist_id || '', e.client_id || '',
    e.payment_date || '', e.doc_type || '', e.notes || '',
    e.morning_sync_status || '', e.updated_at || '',
  ];
}

function clientToRow(c: any): string[] {
  return [c.name || '', c.contact_person || '', c.phone || '', c.email || '', c.vat_id || '', c.address || '', c.notes || ''];
}

function artistToRow(a: any): string[] {
  return [a.name || '', a.full_name || '', a.company_name || '', a.phone || '', a.email || '', a.vat_id || '', a.bank_name || '', a.bank_branch || '', a.bank_account || '', a.notes || ''];
}

function financeToRow(f: any): string[] {
  return [f.filename || '', f.vendor || f.supplier_name || '', String(f.amount ?? ''), String(f.vat ?? ''), f.expense_date || '', f.morning_status || '', f.notes || ''];
}

async function writeSheetData(token: string, spreadsheetId: string, sheetName: string, headers: string[], rows: string[][]) {
  const values = [headers, ...rows];
  await googleApi({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`,
    method: 'PUT',
    token,
    body: { values },
  });
}

async function clearAndSyncAll(args: {
  token: string;
  spreadsheetId: string;
  supabase: any;
  agencyId: string;
}) {
  const { token, spreadsheetId, supabase, agencyId } = args;

  const [eventsRes, clientsRes, artistsRes, expensesRes] = await Promise.all([
    supabase.from('events').select('*').eq('agency_id', agencyId).order('event_date', { ascending: false }),
    supabase.from('clients').select('*').eq('agency_id', agencyId).order('name'),
    supabase.from('artists').select('*').eq('agency_id', agencyId).order('name'),
    supabase.from('finance_expenses').select('*').eq('agency_id', agencyId).order('created_at', { ascending: false }),
  ]);

  const events = (eventsRes.data || []) as any[];
  const clients = (clientsRes.data || []) as any[];
  const artists = (artistsRes.data || []) as any[];
  const expenses = (expensesRes.data || []) as any[];

  const artistMap = new Map(artists.map((a: any) => [a.id, a.name]));
  const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));
  const enrichedEvents = events.map((e: any) => ({
    ...e,
    artist_id: artistMap.get(e.artist_id) || e.artist_id || '',
    client_id: clientMap.get(e.client_id) || e.client_id || '',
  }));

  const sheetNames = ['אירועים', 'לקוחות', 'אמנים', 'פיננסים'];
  for (const name of sheetNames) {
    try {
      await googleApi({
        url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(name)}?valueInputOption=RAW`,
        method: 'PUT',
        token,
        body: { values: [[]] },
      });
    } catch (e) {
      if (e instanceof GoogleAuthError) throw e;
    }
  }

  await Promise.all([
    writeSheetData(token, spreadsheetId, 'אירועים', eventHeaders(), enrichedEvents.map(eventToRow)),
    writeSheetData(token, spreadsheetId, 'לקוחות', clientHeaders(), clients.map(clientToRow)),
    writeSheetData(token, spreadsheetId, 'אמנים', artistHeaders(), artists.map(artistToRow)),
    writeSheetData(token, spreadsheetId, 'פיננסים', financeHeaders(), expenses.map(financeToRow)),
  ]);

  return { events: events.length, clients: clients.length, artists: artists.length, expenses: expenses.length };
}

// ── CORS + Handler ──────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function respond(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'content-type': 'application/json', ...CORS_HEADERS }, body: JSON.stringify(body) };
}

export const handler = async (event: { httpMethod: string; headers: Record<string, string>; body?: string | null }) => {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return respond(405, { error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !supabaseServiceKey) {
      return respond(502, { error: 'Supabase not configured', detail: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set' });
    }

    let reqBody: { action?: string; agencyId?: string; folderId?: string; spreadsheetId?: string };
    try {
      reqBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
    } catch {
      return respond(400, { error: 'Invalid JSON' });
    }

    const { action, agencyId, folderId, spreadsheetId } = reqBody;
    if (!agencyId) {
      return respond(400, { error: 'Missing agencyId' });
    }

    let token: string;
    try {
      token = await getServiceAccountAccessToken();
    } catch (e: any) {
      const msg = e?.message || String(e);
      return respond(502, {
        error: 'Google Service Account not configured',
        detail: msg,
      });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // ── createAndSync ─────────────────────────────────────────────────────────
    if (action === 'createAndSync') {
      if (!folderId) {
        return respond(400, { error: 'Missing folderId' });
      }

      let result: { spreadsheetId: string; spreadsheetUrl: string };
      try {
        result = await createSpreadsheetInFolder(token, `NPC Sync — ${new Date().toISOString().slice(0, 10)}`, folderId);
      } catch (e: any) {
        return respond(502, { error: 'Failed to create spreadsheet', detail: e?.message });
      }

      let counts: { events: number; clients: number; artists: number; expenses: number };
      try {
        counts = await clearAndSyncAll({ token, spreadsheetId: result.spreadsheetId, supabase, agencyId });
      } catch (e: any) {
        return respond(502, {
          error: 'Created spreadsheet but sync failed',
          detail: e?.message,
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
        });
      }

      try {
        await supabase.from('integrations').upsert([{
          agency_id: agencyId,
          provider: 'sheets',
          status: 'connected',
          config: { spreadsheet_id: result.spreadsheetId, folder_id: folderId, sheet_name: 'Events' },
          connected_at: new Date().toISOString(),
        } as any], { onConflict: 'agency_id,provider' });
      } catch (e) {
        console.warn('Failed to save integration record:', e);
      }

      return respond(200, { ok: true, spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl, counts });
    }

    // ── sync ──────────────────────────────────────────────────────────────────
    if (action === 'sync') {
      if (!spreadsheetId) {
        return respond(400, { error: 'Missing spreadsheetId' });
      }

      let counts: { events: number; clients: number; artists: number; expenses: number };
      try {
        counts = await clearAndSyncAll({ token, spreadsheetId, supabase, agencyId });
      } catch (e: any) {
        return respond(502, { error: 'Sync failed', detail: e?.message });
      }

      return respond(200, { ok: true, spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, counts });
    }

    return respond(400, { error: 'Unknown action. Use createAndSync or sync.' });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error('sheets-sync unhandled error:', e);
    return respond(502, {
      error: 'Backup request failed',
      detail: msg,
    });
  }
};
