/**
 * Supabase Edge Function: Google Sheets Sync
 * Deno runtime — replaces the Netlify sheets-sync-api function.
 *
 * DESIGN: Completely stateless. Receives pre-formatted 2D arrays from the client,
 * writes to Google Sheets via Service Account, and (createAndSync only) upserts
 * integrations using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). No DB reads.
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

type GoogleApiResult = { updatedRange?: string; updatedRows?: number; updatedColumns?: number; updatedCells?: number } | unknown;

async function googleApi<T = GoogleApiResult>(args: { url: string; method?: string; token: string; body?: unknown }): Promise<T> {
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
  try { return JSON.parse(text) as T; } catch { return text as T; }
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

// ── Push pre-formatted data to Sheets (sequential, low memory, detailed logging) ─

type SheetCounts = { events: number; clients: number; artists: number; expenses: number };

/** Push client-provided 2D arrays to Google Sheets. Sequential to avoid memory spike. Returns server-verified row counts. */
async function pushSheetsData(
  token: string,
  spreadsheetId: string,
  sheets: { 'אירועים'?: string[][]; 'לקוחות'?: string[][]; 'אמנים'?: string[][]; 'פיננסים'?: string[][] },
  requestId: string
): Promise<SheetCounts> {
  const sheetOrder = ['אירועים', 'לקוחות', 'אמנים', 'פיננסים'] as const;
  const countKeys: (keyof SheetCounts)[] = ['events', 'clients', 'artists', 'expenses'];
  const serverCounts: SheetCounts = { events: 0, clients: 0, artists: 0, expenses: 0 };

  for (let i = 0; i < sheetOrder.length; i++) {
    const name = sheetOrder[i];
    const values = sheets[name] ?? [];
    if (values.length === 0) continue;

    try {
      const t0 = Date.now();
      const resp = await googleApi<{ updatedRows?: number }>({
        url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(name)}!A1?valueInputOption=RAW`,
        method: 'PUT',
        token,
        body: { values },
      });
      const rows = resp?.updatedRows ?? values.length;
      serverCounts[countKeys[i]] = Math.max(0, rows - 1); // exclude header
      console.log(`${LOG_PREFIX} ${requestId} Sync: ${name} ok, ${rows} rows in ${Date.now() - t0}ms`);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const stack = e?.stack ?? '';
      console.error(`${LOG_PREFIX} ${requestId} Sync FAILED sheet=${name}: ${msg}`, stack.slice(0, 500));
      throw new Error(`Failed to write sheet "${name}": ${msg}`);
    }
  }
  return serverCounts;
}

// ── CORS + response helpers ───────────────────────────────────────────────────

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

function isValidFolderId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{20,64}$/.test(id);
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Super-Logger: first line — confirms function is invoked
  const hasAuth = !!req.headers.get('authorization');
  console.log(`${LOG_PREFIX} Function triggered`, { method: req.method, hasAuth });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  let reqBody: any;
  try {
    reqBody = await req.json();
  } catch (e: unknown) {
    console.error(`${LOG_PREFIX} ${requestId} JSON parse failed:`, e);
    return respond(400, { error: 'Invalid JSON body' });
  }

  // ── Webhook: Database trigger on sync_queue INSERT ────────────────────────────
  const webhookRecord = reqBody?.type === 'INSERT' && reqBody?.table === 'sync_queue' ? reqBody?.record : null;
  if (webhookRecord?.id && webhookRecord?.agency_id && webhookRecord?.data) {
    const queueId = webhookRecord.id as string;
    const agencyId = String(webhookRecord.agency_id).trim();
    const data = webhookRecord.data as { action?: string; folderId?: string; spreadsheetId?: string; sheets?: Record<string, string[][]>; counts?: SheetCounts };
    const action = data?.action === 'createAndSync' ? 'createAndSync' : data?.action === 'sync' ? 'sync' : null;
    const sheets = data?.sheets && typeof data.sheets === 'object' ? data.sheets : undefined;
    const counts = data?.counts && typeof data.counts === 'object' ? data.counts : { events: 0, clients: 0, artists: 0, expenses: 0 };

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    const googleEmail = Deno.env.get('GOOGLE_SA_CLIENT_EMAIL')?.trim();
    const googleKey = Deno.env.get('GOOGLE_SA_PRIVATE_KEY')?.trim();

    if (!supabaseUrl || !supabaseKey || !googleEmail || !googleKey) {
      console.error(`${LOG_PREFIX} ${requestId} Webhook: missing env`);
      return respond(502, { error: 'Server not configured' });
    }

    const supabase = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });

    const markProcessing = () => supabase.from('sync_queue').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', queueId);
    const markCompleted = (result: object) => supabase.from('sync_queue').update({ status: 'completed', result, updated_at: new Date().toISOString() }).eq('id', queueId);
    const markFailed = (errMsg: string) => supabase.from('sync_queue').update({ status: 'failed', error_message: errMsg, updated_at: new Date().toISOString() }).eq('id', queueId);

    if (!action || !sheets || !sheets['אירועים']) {
      await markFailed('Invalid webhook payload: missing action or sheets');
      return respond(400, { error: 'Invalid webhook payload' });
    }

    const ev = (sheets['אירועים']?.length ?? 1) - 1;
    const ar = (sheets['אמנים']?.length ?? 1) - 1;
    const ex = (sheets['פיננסים']?.length ?? 1) - 1;
    if (ev === 0 && ar === 0 && ex === 0) {
      await markFailed('Empty payload');
      return respond(400, { error: 'Empty payload' });
    }

    let folderId = typeof data?.folderId === 'string' ? data.folderId.trim() : undefined;
    const spreadsheetId = typeof data?.spreadsheetId === 'string' ? data.spreadsheetId.trim() : undefined;

    if (action === 'createAndSync') {
      if (!folderId) {
        await markFailed('Missing folderId');
        return respond(400, { error: 'Missing folderId' });
      }
      const folderMatch = folderId.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch) folderId = folderMatch[1];
      if (!isValidFolderId(folderId)) {
        await markFailed('Invalid folderId');
        return respond(400, { error: 'Invalid folderId' });
      }
    } else if (action === 'sync' && !spreadsheetId) {
      await markFailed('Missing spreadsheetId');
      return respond(400, { error: 'Missing spreadsheetId' });
    }

    await markProcessing();
    console.log(`${LOG_PREFIX} ${requestId} Webhook processing queueId=${queueId} action=${action}`);

    try {
      const token = await getServiceAccountToken(requestId);

      if (action === 'createAndSync') {
        await checkFolderAccess(token, folderId!, requestId);
        const result = await createSpreadsheetInFolder(token, `NPC Sync — ${new Date().toISOString().slice(0, 10)}`, folderId!, requestId);
        const serverCounts = await pushSheetsData(token, result.spreadsheetId, sheets, requestId);
        const mismatch = counts.events !== serverCounts.events || counts.clients !== serverCounts.clients || counts.artists !== serverCounts.artists || counts.expenses !== serverCounts.expenses;
        if (mismatch) {
          await markFailed('Row count mismatch');
          return respond(502, { error: 'Row count mismatch' });
        }
        await supabase.from('integrations').upsert([{
          agency_id: agencyId,
          provider: 'sheets',
          status: 'connected',
          config: { spreadsheet_id: result.spreadsheetId, folder_id: folderId, sheet_name: 'Events' },
          connected_at: new Date().toISOString(),
        }], { onConflict: 'agency_id,provider' });
        await markCompleted({ spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl, counts });
        return respond(200, { ok: true, queueId, spreadsheetId: result.spreadsheetId });
      }

      if (action === 'sync') {
        const serverCounts = await pushSheetsData(token, spreadsheetId!, sheets, requestId);
        const mismatch = counts.events !== serverCounts.events || counts.clients !== serverCounts.clients || counts.artists !== serverCounts.artists || counts.expenses !== serverCounts.expenses;
        if (mismatch) {
          await markFailed('Row count mismatch');
          return respond(502, { error: 'Row count mismatch' });
        }
        await markCompleted({ spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, counts });
        return respond(200, { ok: true, queueId });
      }

      await markFailed('Unknown action');
      return respond(400, { error: 'Unknown action' });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error(`${LOG_PREFIX} ${requestId} Webhook error:`, msg);
      await markFailed(msg.slice(0, 500));
      return respond(502, { error: msg });
    }
  }

  // ── Direct call (legacy / fallback) ──────────────────────────────────────────
  const action       = typeof reqBody.action       === 'string' ? reqBody.action.trim()       : undefined;
  const agencyId     = typeof reqBody.agencyId     === 'string' ? reqBody.agencyId.trim()     : undefined;
  let   folderId     = typeof reqBody.folderId     === 'string' ? reqBody.folderId.trim()     : undefined;
  const spreadsheetId= typeof reqBody.spreadsheetId=== 'string' ? reqBody.spreadsheetId.trim(): undefined;

  console.log(`${LOG_PREFIX} ${requestId} Direct call action=${action} agencyId=${agencyId?.slice(0, 8)}...`);

  if (!agencyId) return respond(400, { error: 'Missing agencyId' });

  // Early env validation — avoid 502 from missing vars
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const googleEmail = Deno.env.get('GOOGLE_SA_CLIENT_EMAIL')?.trim();
  const googleKey   = Deno.env.get('GOOGLE_SA_PRIVATE_KEY')?.trim();

  if (!supabaseUrl || !supabaseKey) {
    console.error(`${LOG_PREFIX} ${requestId} Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
    return respond(502, { error: 'Supabase not configured (missing URL or service role key)' });
  }
  if (!googleEmail || !googleKey) {
    console.error(`${LOG_PREFIX} ${requestId} Missing GOOGLE_SA_CLIENT_EMAIL or GOOGLE_SA_PRIVATE_KEY`);
    return respond(502, { error: 'Google Service Account not configured. Set GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY via supabase secrets set' });
  }

  const sheets = reqBody.sheets && typeof reqBody.sheets === 'object' ? reqBody.sheets : undefined;
  const counts = reqBody.counts && typeof reqBody.counts === 'object' ? reqBody.counts : { events: 0, clients: 0, artists: 0, expenses: 0 };

  // Stateless guard: reject empty payload with 400 (not 502) — prevents crash loop
  if (action === 'createAndSync' || action === 'sync') {
    if (!sheets || !sheets['אירועים']) {
      return respond(400, { error: 'Missing sheets data. Client must send formatted data in request body.', code: 'MISSING_SHEETS' });
    }
    const ev = (sheets['אירועים']?.length ?? 1) - 1;
    const ar = (sheets['אמנים']?.length ?? 1) - 1;
    const ex = (sheets['פיננסים']?.length ?? 1) - 1;
    if (ev === 0 && ar === 0 && ex === 0) {
      console.log(`${LOG_PREFIX} ${requestId} Rejecting empty payload (no events/artists/expenses)`);
      return respond(400, { error: 'Empty payload. Add events, artists, or expenses before syncing.', code: 'EMPTY_PAYLOAD' });
    }
  }
  if (action === 'createAndSync') {
    if (!folderId) return respond(400, { error: 'Missing folderId' });
    const folderMatch = folderId.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) folderId = folderMatch[1];
    if (!isValidFolderId(folderId)) return respond(400, { error: 'Invalid folderId' });
  }

  try {
    let token: string;
    try {
      token = await getServiceAccountToken(requestId);
    } catch (e: any) {
      return respond(502, { error: 'Google Service Account not configured', detail: e.message });
    }

    // Service Role Key bypasses RLS — required for server-side sync
    const supabase = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });

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

      let serverCounts: SheetCounts;
      try {
        serverCounts = await pushSheetsData(token, result.spreadsheetId, sheets!, requestId);
      } catch (e: any) {
        console.error(`${LOG_PREFIX} ${requestId} createAndSync pushSheetsData error:`, e?.message, e?.stack?.slice(0, 300));
        return respond(502, {
          error: 'Created spreadsheet but sync failed',
          detail: e?.message,
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
        });
      }

      const mismatch = counts.events !== serverCounts.events || counts.clients !== serverCounts.clients ||
        counts.artists !== serverCounts.artists || counts.expenses !== serverCounts.expenses;
      if (mismatch) {
        console.error(`${LOG_PREFIX} ${requestId} Row count mismatch: client=${JSON.stringify(counts)} server=${JSON.stringify(serverCounts)}`);
        return respond(502, {
          error: 'Sync row count mismatch — data may be incomplete',
          detail: `Client sent ${counts.events} events, ${counts.clients} clients, ${counts.artists} artists, ${counts.expenses} expenses. Server wrote different counts.`,
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
      let serverCounts: SheetCounts;
      try {
        serverCounts = await pushSheetsData(token, spreadsheetId, sheets!, requestId);
      } catch (e: any) {
        console.error(`${LOG_PREFIX} ${requestId} sync pushSheetsData error:`, e?.message, e?.stack?.slice(0, 300));
        return respond(502, { error: 'Sync failed', detail: e?.message });
      }
      const mismatch = counts.events !== serverCounts.events || counts.clients !== serverCounts.clients ||
        counts.artists !== serverCounts.artists || counts.expenses !== serverCounts.expenses;
      if (mismatch) {
        console.error(`${LOG_PREFIX} ${requestId} Row count mismatch: client=${JSON.stringify(counts)} server=${JSON.stringify(serverCounts)}`);
        return respond(502, {
          error: 'Sync row count mismatch — data may be incomplete',
          detail: `Client sent ${counts.events} events, ${counts.clients} clients, ${counts.artists} artists, ${counts.expenses} expenses. Server wrote different counts.`,
        });
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
    const msg = e?.message ?? String(e);
    const stack = e?.stack ?? '';
    console.error(`${LOG_PREFIX} ${requestId} Unhandled error:`, msg, 'stack:', stack.slice(0, 600));
    return respond(502, { error: 'Backup request failed', detail: msg });
  }
});
