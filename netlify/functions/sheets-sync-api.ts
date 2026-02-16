/**
 * Netlify Function: Google Sheets Sync API.
 * Creates a spreadsheet in a user's Drive folder and syncs all agency data.
 * Uses the logged-in user's Google OAuth token (passed via Authorization header).
 *
 * Token refresh: If GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set, the function
 * can refresh an expired access token using the refresh_token from the request body.
 *
 * Env:
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (optional, for token refresh)
 */

// ── Custom error for Google auth failures ───────────────────────────────────

class GoogleAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'GoogleAuthError'; }
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

// ── Token refresh ───────────────────────────────────────────────────────────

async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = await res.json() as { access_token?: string };
    return data?.access_token || null;
  } catch {
    return null;
  }
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
    } catch (e) {
      if (e instanceof GoogleAuthError) throw e;
      console.warn('Could not move spreadsheet to folder:', e);
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

// ── Handler ─────────────────────────────────────────────────────────────────

const AUTH_ERROR_MSG = 'טוקן Google פג תוקף או חסר. התנתק/י והתחבר/י מחדש עם Google.';

export const handler = async (event: { httpMethod: string; headers: Record<string, string>; body?: string | null }) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseServiceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  let reqBody: { action?: string; agencyId?: string; folderId?: string; spreadsheetId?: string; refreshToken?: string };
  try {
    reqBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Extract user's Google OAuth token from Authorization header
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  let token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: AUTH_ERROR_MSG, code: 'NO_TOKEN' }) };
  }

  const { action, agencyId, folderId, spreadsheetId } = reqBody;
  if (!agencyId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing agencyId' }) };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  // Helper: run an operation with automatic token refresh on auth failure
  async function withTokenRefresh<T>(operation: (t: string) => Promise<T>): Promise<T> {
    try {
      return await operation(token);
    } catch (e) {
      if (e instanceof GoogleAuthError && reqBody.refreshToken) {
        const newToken = await refreshGoogleToken(reqBody.refreshToken);
        if (newToken) {
          token = newToken;
          return await operation(newToken);
        }
      }
      throw e;
    }
  }

  // ── createAndSync ─────────────────────────────────────────────────────────
  if (action === 'createAndSync') {
    if (!folderId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing folderId' }) };
    }

    let result: { spreadsheetId: string; spreadsheetUrl: string };
    try {
      result = await withTokenRefresh(t => createSpreadsheetInFolder(t, `NPC Sync — ${new Date().toISOString().slice(0, 10)}`, folderId));
    } catch (e: any) {
      if (e instanceof GoogleAuthError) {
        return { statusCode: 401, body: JSON.stringify({ error: AUTH_ERROR_MSG, code: 'TOKEN_EXPIRED', detail: e.message }) };
      }
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to create spreadsheet', detail: e.message }) };
    }

    let counts: { events: number; clients: number; artists: number; expenses: number };
    try {
      counts = await withTokenRefresh(t => clearAndSyncAll({ token: t, spreadsheetId: result.spreadsheetId, supabase, agencyId }));
    } catch (e: any) {
      if (e instanceof GoogleAuthError) {
        return { statusCode: 401, body: JSON.stringify({ error: AUTH_ERROR_MSG, code: 'TOKEN_EXPIRED', detail: e.message, spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl }) };
      }
      return { statusCode: 502, body: JSON.stringify({ error: 'Created spreadsheet but sync failed', detail: e.message, spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl }) };
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

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl, counts }),
    };
  }

  // ── sync ──────────────────────────────────────────────────────────────────
  if (action === 'sync') {
    if (!spreadsheetId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing spreadsheetId' }) };
    }

    let counts: { events: number; clients: number; artists: number; expenses: number };
    try {
      counts = await withTokenRefresh(t => clearAndSyncAll({ token: t, spreadsheetId, supabase, agencyId }));
    } catch (e: any) {
      if (e instanceof GoogleAuthError) {
        return { statusCode: 401, body: JSON.stringify({ error: AUTH_ERROR_MSG, code: 'TOKEN_EXPIRED', detail: e.message }) };
      }
      return { statusCode: 502, body: JSON.stringify({ error: 'Sync failed', detail: e.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, counts }),
    };
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action. Use createAndSync or sync.' }) };
};
