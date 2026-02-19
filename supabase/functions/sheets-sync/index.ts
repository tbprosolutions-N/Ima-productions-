/**
 * Supabase Edge Function: Google Sheets Sync
 * Deno runtime — replaces the Netlify sheets-sync-api function.
 *
 * Env secrets (set via `supabase secrets set`):
 *   GOOGLE_SA_CLIENT_EMAIL   — service account email
 *   GOOGLE_SA_PRIVATE_KEY    — PEM private key (newlines as \n in secret)
 *   SUPABASE_URL             — automatically injected by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY — automatically injected by Supabase runtime
 *
 * Deploy:
 *   npx supabase functions deploy sheets-sync --no-verify-jwt
 */

// @ts-nocheck — Deno runtime; standard lib types not available in TS project config
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOG_PREFIX = '[sheets-sync]';

// ── Custom error classes ─────────────────────────────────────────────────────

class GoogleAuthError extends Error {
  constructor(msg: string) { super(msg); this.name = 'GoogleAuthError'; }
}
class FolderAccessError extends Error {
  constructor(msg: string) { super(msg); this.name = 'FolderAccessError'; }
}

// ── Base64url helpers (Deno / Web Crypto compatible) ─────────────────────────

function base64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlText(text: string): string {
  return base64url(new TextEncoder().encode(text));
}

// ── PEM → DER for Web Crypto importKey ───────────────────────────────────────

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Service Account JWT → Google access token ────────────────────────────────

async function getServiceAccountToken(requestId: string): Promise<string> {
  const clientEmail = Deno.env.get('GOOGLE_SA_CLIENT_EMAIL')?.trim();
  const privateKeyRaw = Deno.env.get('GOOGLE_SA_PRIVATE_KEY')?.trim();

  if (!clientEmail || !privateKeyRaw) {
    throw new GoogleAuthError(
      'GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY must be set via `supabase secrets set`'
    );
  }
  if (!privateKeyRaw.includes('-----BEGIN')) {
    throw new GoogleAuthError('GOOGLE_SA_PRIVATE_KEY must be a valid PEM key (starts with -----BEGIN PRIVATE KEY-----)');
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const headerB64 = base64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payloadB64 = base64urlText(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyData = pemToDer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${base64url(sigBytes)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new GoogleAuthError(`Google OAuth2 ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  if (!data.access_token) throw new GoogleAuthError('No access_token in Google OAuth2 response');
  console.log(`${LOG_PREFIX} ${requestId} Auth: token obtained`);
  return data.access_token;
}

// ── Google API helper ─────────────────────────────────────────────────────────

async function googleApi(args: { url: string; method?: string; token: string; body?: unknown }) {
  const res = await fetch(args.url, {
    method: args.method || 'GET',
    headers: { authorization: `Bearer ${args.token}`, 'content-type': 'application/json' },
    body: args.body != null ? JSON.stringify(args.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new GoogleAuthError(`Google API ${res.status}: ${text}`);
    throw new Error(`Google API ${res.status}: ${text.slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

// ── Folder access check ───────────────────────────────────────────────────────

async function checkFolderAccess(token: string, folderId: string, requestId: string): Promise<void> {
  try {
    const file = await googleApi({
      url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,mimeType,name`,
      token,
    }) as { id?: string; mimeType?: string; name?: string };
    if (!file?.id) throw new FolderAccessError('Folder not found or no access.');
    if (file.mimeType !== 'application/vnd.google-apps.folder') {
      throw new FolderAccessError(`The ID is not a folder (mimeType=${file.mimeType}). Use a Google Drive folder ID.`);
    }
    console.log(`${LOG_PREFIX} ${requestId} Folder: access OK — "${(file.name || '').slice(0, 40)}"`);
  } catch (e: any) {
    if (e instanceof GoogleAuthError || e instanceof FolderAccessError) throw e;
    const msg = e?.message || String(e);
    if (msg.includes('404') || msg.includes('not found')) {
      throw new FolderAccessError('Folder not found. Check that the folder ID is correct.');
    }
    if (msg.includes('403') || msg.includes('Forbidden')) {
      throw new FolderAccessError(
        'Service Account does not have access to this folder. Share the folder with the Service Account email and grant Editor access.'
      );
    }
    throw new FolderAccessError(`Could not verify folder access: ${msg.slice(0, 120)}`);
  }
}

// ── Spreadsheet creation ──────────────────────────────────────────────────────

async function createSpreadsheetInFolder(
  token: string,
  title: string,
  folderId: string,
  requestId: string,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  console.log(`${LOG_PREFIX} ${requestId} Create: creating spreadsheet...`);
  const spreadsheet = await googleApi({
    url: 'https://sheets.googleapis.com/v4/spreadsheets',
    method: 'POST',
    token,
    body: {
      properties: { title },
      sheets: ['אירועים', 'לקוחות', 'אמנים', 'פיננסים'].map(t => ({ properties: { title: t } })),
    },
  }) as { spreadsheetId: string };

  console.log(`${LOG_PREFIX} ${requestId} Create: spreadsheet id=${spreadsheet.spreadsheetId}`);

  // Move to target folder
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

  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
  };
}

// ── Row serialisers ───────────────────────────────────────────────────────────

const eventHeaders  = () => ['תאריך','שם עסק','שם לחשבונית','סכום','סטטוס','אמן','לקוח','תאריך תשלום','סוג מסמך','הערות','סנכרון Morning','עודכן'];
const clientHeaders = () => ['שם','איש קשר','טלפון','אימייל','ח.פ/עוסק','כתובת','הערות'];
const artistHeaders = () => ['שם','שם מלא','חברה','טלפון','אימייל','ח.פ/עוסק','בנק','סניף','חשבון','הערות'];
const financeHeaders= () => ['קובץ','ספק','סכום','מע״מ','תאריך הוצאה','סנכרון Morning','הערות'];

const eventToRow   = (e: any) => [e.event_date||'',e.business_name||'',e.invoice_name||'',String(e.amount??''),e.status||'',e.artist_id||'',e.client_id||'',e.payment_date||'',e.doc_type||'',e.notes||'',e.morning_sync_status||'',e.updated_at||''];
const clientToRow  = (c: any) => [c.name||'',c.contact_person||'',c.phone||'',c.email||'',c.vat_id||'',c.address||'',c.notes||''];
const artistToRow  = (a: any) => [a.name||'',a.full_name||'',a.company_name||'',a.phone||'',a.email||'',a.vat_id||'',a.bank_name||'',a.bank_branch||'',a.bank_account||'',a.notes||''];
const financeToRow = (f: any) => [f.filename||'',f.vendor||f.supplier_name||'',String(f.amount??''),String(f.vat??''),f.expense_date||'',f.morning_status||'',f.notes||''];

// ── Sheet write helper ────────────────────────────────────────────────────────

async function writeSheet(token: string, spreadsheetId: string, sheetName: string, headers: string[], rows: string[][]) {
  await googleApi({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`,
    method: 'PUT',
    token,
    body: { values: [headers, ...rows] },
  });
}

// ── Full sync ─────────────────────────────────────────────────────────────────

async function clearAndSyncAll(args: {
  token: string;
  spreadsheetId: string;
  supabase: ReturnType<typeof createClient>;
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

  const events   = (eventsRes.data   || []) as any[];
  const clients  = (clientsRes.data  || []) as any[];
  const artists  = (artistsRes.data  || []) as any[];
  const expenses = (expensesRes.data || []) as any[];

  const artistMap = new Map(artists.map((a: any) => [a.id, a.name]));
  const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));
  const enrichedEvents = events.map((e: any) => ({
    ...e,
    artist_id: artistMap.get(e.artist_id) || e.artist_id || '',
    client_id: clientMap.get(e.client_id) || e.client_id || '',
  }));

  console.log(`${LOG_PREFIX} ${requestId} Sync: ${events.length} events, ${clients.length} clients, ${artists.length} artists, ${expenses.length} expenses`);

  // Clear all sheets first
  for (const name of ['אירועים', 'לקוחות', 'אמנים', 'פיננסים']) {
    try {
      await googleApi({
        url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(name)}?valueInputOption=RAW`,
        method: 'PUT',
        token,
        body: { values: [[]] },
      });
    } catch (e) { if (e instanceof GoogleAuthError) throw e; }
  }

  await Promise.all([
    writeSheet(token, spreadsheetId, 'אירועים',  eventHeaders(),  enrichedEvents.map(eventToRow)),
    writeSheet(token, spreadsheetId, 'לקוחות',   clientHeaders(), clients.map(clientToRow)),
    writeSheet(token, spreadsheetId, 'אמנים',    artistHeaders(), artists.map(artistToRow)),
    writeSheet(token, spreadsheetId, 'פיננסים',  financeHeaders(),expenses.map(financeToRow)),
  ]);

  console.log(`${LOG_PREFIX} ${requestId} Sync: completed`);
  return { events: events.length, clients: clients.length, artists: artists.length, expenses: expenses.length };
}

// ── CORS + response helpers ───────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function isValidFolderId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{20,64}$/.test(id);
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  let reqBody: { action?: string; agencyId?: string; folderId?: string; spreadsheetId?: string };
  try {
    reqBody = await req.json();
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const action       = typeof reqBody.action       === 'string' ? reqBody.action.trim()       : undefined;
  const agencyId     = typeof reqBody.agencyId     === 'string' ? reqBody.agencyId.trim()     : undefined;
  let   folderId     = typeof reqBody.folderId     === 'string' ? reqBody.folderId.trim()     : undefined;
  const spreadsheetId= typeof reqBody.spreadsheetId=== 'string' ? reqBody.spreadsheetId.trim(): undefined;

  console.log(`${LOG_PREFIX} ${requestId} action=${action} agencyId=${agencyId?.slice(0, 8)}...`);

  if (!agencyId) return respond(400, { error: 'Missing agencyId' });

  if (action === 'createAndSync') {
    if (!folderId) return respond(400, { error: 'Missing folderId' });
    const folderMatch = folderId.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) folderId = folderMatch[1];
    if (!isValidFolderId(folderId)) return respond(400, { error: 'Invalid folderId' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) {
    return respond(502, { error: 'Supabase not configured' });
  }

  try {
    let token: string;
    try {
      token = await getServiceAccountToken(requestId);
    } catch (e: any) {
      return respond(502, { error: 'Google Service Account not configured', detail: e.message });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    // ── createAndSync action ─────────────────────────────────────────────────
    if (action === 'createAndSync') {
      try {
        await checkFolderAccess(token, folderId!, requestId);
      } catch (e: any) {
        if (e instanceof FolderAccessError) return respond(403, { error: 'Folder access denied', detail: e.message });
        throw e;
      }

      let result: { spreadsheetId: string; spreadsheetUrl: string };
      try {
        result = await createSpreadsheetInFolder(
          token,
          `NPC Sync — ${new Date().toISOString().slice(0, 10)}`,
          folderId!,
          requestId,
        );
      } catch (e: any) {
        if (e instanceof GoogleAuthError)  return respond(502, { error: 'Google auth failed', detail: e.message });
        if (e instanceof FolderAccessError) return respond(403, { error: 'Folder access denied', detail: e.message });
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
        }], { onConflict: 'agency_id,provider' });
      } catch (e) {
        console.warn(`${LOG_PREFIX} ${requestId} Failed to save integration record:`, e);
      }

      return respond(200, { ok: true, spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl, counts });
    }

    // ── sync action ──────────────────────────────────────────────────────────
    if (action === 'sync') {
      if (!spreadsheetId) return respond(400, { error: 'Missing spreadsheetId' });
      let counts: { events: number; clients: number; artists: number; expenses: number };
      try {
        counts = await clearAndSyncAll({ token, spreadsheetId, supabase, agencyId, requestId });
      } catch (e: any) {
        return respond(502, { error: 'Sync failed', detail: e?.message });
      }
      return respond(200, {
        ok: true,
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        counts,
      });
    }

    return respond(400, { error: 'Unknown action', detail: 'Use action: "createAndSync" or "sync".' });

  } catch (e: any) {
    console.error(`${LOG_PREFIX} ${requestId} Unhandled error:`, e);
    return respond(502, { error: 'Backup request failed', detail: e?.message });
  }
});
