/**
 * Google Sheets Sync via Netlify Function proxy.
 * Uses /api/sheets-sync (redirected to /.netlify/functions/sheets-sync-api).
 * Passes the user's Google OAuth token from localStorage in the Authorization header.
 */

const SHEETS_API_PATH = '/api/sheets-sync';

export type SheetsSyncResult =
  | { ok: true; spreadsheetId: string; spreadsheetUrl: string; counts: { events: number; clients: number; artists: number; expenses: number } }
  | { ok: false; error: string; detail?: string; spreadsheetId?: string; spreadsheetUrl?: string };

function getGoogleToken(): string | null {
  try { return localStorage.getItem('google_provider_token'); } catch { return null; }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = getGoogleToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Create a new Google Spreadsheet in the specified Drive folder and sync all data.
 */
export async function createSheetAndSync(agencyId: string, folderId: string): Promise<SheetsSyncResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(`${base}${SHEETS_API_PATH}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ action: 'createAndSync', agencyId, folderId }),
  });
  const data = await res.json().catch(() => ({})) as any;
  if (!res.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, detail: data?.detail, spreadsheetId: data?.spreadsheetId, spreadsheetUrl: data?.spreadsheetUrl };
  }
  if (data?.ok) {
    return { ok: true, spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl, counts: data.counts };
  }
  return { ok: false, error: data?.error || 'Unknown error', detail: data?.detail };
}

/**
 * Re-sync all data to an existing spreadsheet.
 */
export async function resyncSheet(agencyId: string, spreadsheetId: string): Promise<SheetsSyncResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(`${base}${SHEETS_API_PATH}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ action: 'sync', agencyId, spreadsheetId }),
  });
  const data = await res.json().catch(() => ({})) as any;
  if (!res.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, detail: data?.detail };
  }
  if (data?.ok) {
    return { ok: true, spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl, counts: data.counts };
  }
  return { ok: false, error: data?.error || 'Unknown error', detail: data?.detail };
}

/** Check whether a Google provider token is available in localStorage. */
export function hasGoogleToken(): boolean {
  return !!getGoogleToken();
}
