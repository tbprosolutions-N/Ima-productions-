/**
 * Google Sheets Sync via Netlify Function proxy.
 * Uses /api/sheets-sync (redirected to /.netlify/functions/sheets-sync-api).
 * Passes the user's Google OAuth token in the request body to avoid CORS preflight.
 */

const SHEETS_API_PATH = '/api/sheets-sync';

export type SheetsSyncResult =
  | { ok: true; spreadsheetId: string; spreadsheetUrl: string; counts: { events: number; clients: number; artists: number; expenses: number } }
  | { ok: false; error: string; detail?: string; code?: string; spreadsheetId?: string; spreadsheetUrl?: string };

function getGoogleToken(): string | null {
  try { return localStorage.getItem('google_provider_token'); } catch { return null; }
}

function getGoogleRefreshToken(): string | null {
  try { return localStorage.getItem('google_provider_refresh_token'); } catch { return null; }
}

/** Clear stale Google tokens from localStorage. Called on auth failures. */
export function clearGoogleTokens(): void {
  try {
    localStorage.removeItem('google_provider_token');
    localStorage.removeItem('google_provider_refresh_token');
  } catch {}
}

async function sheetsFetch(bodyObj: Record<string, unknown>): Promise<SheetsSyncResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';

  const googleToken = getGoogleToken();
  if (googleToken) bodyObj.googleToken = googleToken;
  const refreshToken = getGoogleRefreshToken();
  if (refreshToken) bodyObj.refreshToken = refreshToken;

  const res = await fetch(`${base}${SHEETS_API_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bodyObj),
  });
  const data = await res.json().catch(() => ({})) as any;

  if (res.status === 401 || data?.code === 'TOKEN_EXPIRED' || data?.code === 'NO_TOKEN') {
    clearGoogleTokens();
    return { ok: false, error: data?.error || 'טוקן Google פג תוקף. התנתק/י והתחבר/י מחדש.', code: data?.code || 'TOKEN_EXPIRED' };
  }

  if (!res.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, detail: data?.detail, spreadsheetId: data?.spreadsheetId, spreadsheetUrl: data?.spreadsheetUrl };
  }
  if (data?.ok) {
    return { ok: true, spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl, counts: data.counts };
  }
  return { ok: false, error: data?.error || 'Unknown error', detail: data?.detail };
}

/**
 * Create a new Google Spreadsheet in the specified Drive folder and sync all data.
 */
export async function createSheetAndSync(agencyId: string, folderId: string): Promise<SheetsSyncResult> {
  return sheetsFetch({ action: 'createAndSync', agencyId, folderId });
}

/**
 * Re-sync all data to an existing spreadsheet.
 */
export async function resyncSheet(agencyId: string, spreadsheetId: string): Promise<SheetsSyncResult> {
  return sheetsFetch({ action: 'sync', agencyId, spreadsheetId });
}

/** Check whether a Google provider token is available in localStorage. */
export function hasGoogleToken(): boolean {
  return !!getGoogleToken();
}
