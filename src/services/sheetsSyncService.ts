/**
 * Google Sheets Sync via Netlify Function proxy.
 * Uses /api/sheets-sync (redirected to /.netlify/functions/sheets-sync-api).
 */

const SHEETS_API_PATH = '/api/sheets-sync';

export type SheetsSyncResult =
  | { ok: true; spreadsheetId: string; spreadsheetUrl: string; counts: { events: number; clients: number; artists: number; expenses: number }; saEmail?: string }
  | { ok: false; error: string; detail?: string; spreadsheetId?: string; spreadsheetUrl?: string };

/**
 * Create a new Google Spreadsheet in the specified Drive folder and sync all data.
 */
export async function createSheetAndSync(agencyId: string, folderId: string): Promise<SheetsSyncResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(`${base}${SHEETS_API_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'createAndSync', agencyId, folderId }),
  });
  const data = await res.json().catch(() => ({})) as any;
  if (!res.ok) {
    return { ok: false, error: data?.error || `HTTP ${res.status}`, detail: data?.detail, spreadsheetId: data?.spreadsheetId, spreadsheetUrl: data?.spreadsheetUrl };
  }
  if (data?.ok) {
    return { ok: true, spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl, counts: data.counts, saEmail: data.saEmail };
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
    headers: { 'content-type': 'application/json' },
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
