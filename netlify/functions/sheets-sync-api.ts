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

const LOG_PREFIX = '[sheets-sync]';
const HANDLER_TIMEOUT_MS = 25_000; // Stay under Netlify limit (26s) to return 504 instead of 500

// ── Custom errors ────────────────────────────────────────────────────────────

class GoogleAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'GoogleAuthError'; }
}

class FolderAccessError extends Error {
  constructor(message: string) { super(message); this.name = 'FolderAccessError'; }
}

// ── Service Account JWT → access token ───────────────────────────────────────

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Get Google access token using Service Account credentials (JWT grant). Uses GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY from Netlify env. */
async function getServiceAccountAccessToken(requestId: string): Promise<string> {
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.GOOGLE_SA_PRIVATE_KEY?.trim();

  if (!clientEmail || !privateKeyRaw) {
    console.warn(`${LOG_PREFIX} ${requestId} Auth: missing env — clientEmail=${!!clientEmail} privateKeySet=${!!privateKeyRaw}`);
    throw new Error('GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY must be set in Netlify env');
  }
  if (!privateKeyRaw.includes('-----BEGIN')) {
    console.warn(`${LOG_PREFIX} ${requestId} Auth: GOOGLE_SA_PRIVATE_KEY does not look like a PEM key (missing -----BEGIN)`);
    throw new Error('GOOGLE_SA_PRIVATE_KEY must be a valid PEM private key (starts with -----BEGIN PRIVATE KEY-----)');
  }

  // Restore newlines in PEM (env often has literal \n)
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  console.log(`${LOG_PREFIX} ${requestId} Auth: requesting access token (client_email=${clientEmail.slice(0, 20)}...)`);

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
  if (!res.ok) {
    console.error(`${LOG_PREFIX} ${requestId} Auth: OAuth2 token error ${res.status} — ${text.slice(0, 200)}`);
    throw new Error(`Google OAuth2 token error ${res.status}: ${text.slice(0, 150)}`);
  }
  const data = JSON.parse(text) as { access_token?: string };
  const token = data?.access_token;
  if (!token) {
    console.error(`${LOG_PREFIX} ${requestId} Auth: no access_token in response`);
    throw new Error('No access_token in Google OAuth2 response');
  }
  console.log(`${LOG_PREFIX} ${requestId} Auth: token obtained successfully`);
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

/** Verify the Service Account can access the folder (exists + Editor). Fails with FolderAccessError if not. */
async function checkFolderAccess(token: string, folderId: string, requestId: string): Promise<void> {
  try {
    const file = await googleApi({
      url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,mimeType,name`,
      token,
    }) as { id?: string; mimeType?: string; name?: string };
    if (!file?.id) {
      throw new FolderAccessError('Folder not found or no access.');
    }
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    if (!isFolder) {
      throw new FolderAccessError(`The ID is not a folder (mimeType=${file.mimeType}). Use a Google Drive folder ID.`);
    }
    console.log(`${LOG_PREFIX} ${requestId} Folder: access OK — "${(file.name || '').slice(0, 40)}"`);
  } catch (e: any) {
    if (e instanceof GoogleAuthError) throw e;
    if (e instanceof FolderAccessError) throw e;
    const msg = e?.message || String(e);
    if (msg.includes('404') || msg.includes('not found')) {
      throw new FolderAccessError('Folder not found. Check that the folder ID is correct and the folder exists.');
    }
    if (msg.includes('403') || msg.includes('Forbidden')) {
      throw new FolderAccessError(
        'Service Account does not have access to this folder. Share the folder with the Service Account email (GOOGLE_SA_CLIENT_EMAIL) and grant Editor access.'
      );
    }
    throw new FolderAccessError(`Could not verify folder access: ${msg.slice(0, 120)}`);
  }
}

// ── Spreadsheet creation & data writing ─────────────────────────────────────

async function createSpreadsheetInFolder(
  token: string,
  title: string,
  folderId: string,
  requestId: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  console.log(`${LOG_PREFIX} ${requestId} Create: creating spreadsheet...`);
  const sheetTabs = ['אירועים', 'לקוחות', 'אמנים', 'פיננסים'];
  const spreadsheet = await googleApi({
    url: 'https://sheets.googleapis.com/v4/spreadsheets',
    method: 'POST',
    token,
    body: {
      // Omit locale — 'he_IL' is not accepted by Google Sheets API and causes a 400 error.
      properties: { title },
      sheets: sheetTabs.map(t => ({ properties: { title: t } })),
    },
  }) as { spreadsheetId: string; spreadsheetUrl: string };
  console.log(`${LOG_PREFIX} ${requestId} Create: spreadsheet created id=${spreadsheet.spreadsheetId}`);

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
      console.log(`${LOG_PREFIX} ${requestId} Create: moved to folder ${folderId}`);
    } catch (e: any) {
      if (e instanceof GoogleAuthError) throw e;
      const msg = e?.message || String(e);
      console.error(`${LOG_PREFIX} ${requestId} Create: move failed — ${msg.slice(0, 150)}`);
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
  requestId: string;
}) {
  const { token, spreadsheetId, supabase, agencyId, requestId } = args;

  console.log(`${LOG_PREFIX} ${requestId} Sync: fetching data from Supabase...`);
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

  console.log(`${LOG_PREFIX} ${requestId} Sync: clearing sheets then writing ${events.length} events, ${clients.length} clients, ${artists.length} artists, ${expenses.length} expenses`);
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
  console.log(`${LOG_PREFIX} ${requestId} Sync: completed successfully`);
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

/** Valid Drive folder ID: alphanumeric, dash, underscore; typical length 33 */
function isValidFolderId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{20,64}$/.test(id);
}

/** Run fn with a timeout; on timeout throw so we return 504 before Netlify kills with 500 */
function withTimeout<T>(ms: number, fn: () => Promise<T>, requestId: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.error(`${LOG_PREFIX} ${requestId} Handler timeout after ${ms}ms`);
      reject(new Error(`Backup timed out after ${ms / 1000}s. Try fewer records or run sync again.`));
    }, ms);
    fn()
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

export const handler = async (event: { httpMethod: string; headers: Record<string, string>; body?: string | null }) => {
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return respond(405, { error: 'Method not allowed' });
    }

    let reqBody: { action?: string; agencyId?: string; folderId?: string; spreadsheetId?: string };
    try {
      reqBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
    } catch {
      console.warn(`${LOG_PREFIX} ${requestId} Payload: invalid JSON`);
      return respond(400, { error: 'Invalid JSON body' });
    }

    const action = typeof reqBody.action === 'string' ? reqBody.action.trim() : undefined;
    const agencyId = typeof reqBody.agencyId === 'string' ? reqBody.agencyId.trim() : undefined;
    let folderId = typeof reqBody.folderId === 'string' ? reqBody.folderId.trim() : undefined;
    const spreadsheetId = typeof reqBody.spreadsheetId === 'string' ? reqBody.spreadsheetId.trim() : undefined;

    console.log(`${LOG_PREFIX} ${requestId} Payload: action=${action} agencyId=${agencyId ? agencyId.slice(0, 8) + '...' : 'missing'} folderId=${folderId ? (folderId.length > 12 ? folderId.slice(0, 12) + '...' : folderId) : 'n/a'} spreadsheetId=${spreadsheetId ? 'set' : 'n/a'}`);

    if (!agencyId) {
      return respond(400, { error: 'Missing agencyId', detail: 'Request body must include agencyId (string).' });
    }

    if (action === 'createAndSync') {
      if (!folderId) {
        return respond(400, { error: 'Missing folderId', detail: 'createAndSync requires folderId (Google Drive folder ID or full folder URL).' });
      }
      const folderMatch = folderId.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch) folderId = folderMatch[1];
      if (!isValidFolderId(folderId)) {
        return respond(400, { error: 'Invalid folderId', detail: 'folderId must be a valid Google Drive folder ID (or a full drive.google.com folder URL).' });
      }
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn(`${LOG_PREFIX} ${requestId} Supabase env missing`);
      return respond(502, { error: 'Supabase not configured', detail: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set' });
    }

    const run = async () => {
      let token: string;
      try {
        token = await getServiceAccountAccessToken(requestId);
      } catch (e: any) {
        const msg = e?.message || String(e);
        return respond(502, {
          error: 'Google Service Account not configured',
          detail: msg,
        });
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

      if (action === 'createAndSync') {
        try {
          await checkFolderAccess(token, folderId!, requestId);
        } catch (e: any) {
          if (e instanceof FolderAccessError) {
            return respond(403, { error: 'Folder access denied', detail: e.message });
          }
          throw e;
        }

        let result: { spreadsheetId: string; spreadsheetUrl: string };
        try {
          result = await createSpreadsheetInFolder(token, `NPC Sync — ${new Date().toISOString().slice(0, 10)}`, folderId!, requestId);
        } catch (e: any) {
          if (e instanceof GoogleAuthError) {
            return respond(502, { error: 'Google auth failed', detail: e.message });
          }
          if (e instanceof FolderAccessError) {
            return respond(403, { error: 'Folder access denied', detail: e.message });
          }
          return respond(502, { error: 'Failed to create spreadsheet', detail: e?.message });
        }

        let counts: { events: number; clients: number; artists: number; expenses: number };
        try {
          counts = await clearAndSyncAll({ token, spreadsheetId: result.spreadsheetId, supabase, agencyId, requestId });
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
          console.warn(`${LOG_PREFIX} ${requestId} Failed to save integration record:`, e);
        }

        return respond(200, { ok: true, spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl, counts });
      }

      if (action === 'sync') {
        if (!spreadsheetId) {
          return respond(400, { error: 'Missing spreadsheetId', detail: 'sync action requires spreadsheetId.' });
        }
        let counts: { events: number; clients: number; artists: number; expenses: number };
        try {
          counts = await clearAndSyncAll({ token, spreadsheetId, supabase, agencyId, requestId });
        } catch (e: any) {
          return respond(502, { error: 'Sync failed', detail: e?.message });
        }
        return respond(200, { ok: true, spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, counts });
      }

      return respond(400, { error: 'Unknown action', detail: 'Use action: "createAndSync" or "sync".' });
    };

    const result = await withTimeout(HANDLER_TIMEOUT_MS, run, requestId);
    return result;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const isTimeout = msg.includes('timed out');
    console.error(`${LOG_PREFIX} ${requestId} Unhandled error:`, e);
    return respond(isTimeout ? 504 : 502, {
      error: isTimeout ? 'Backup timed out' : 'Backup request failed',
      detail: msg,
    });
  }
};
