/**
 * Google Sheets Sync via Netlify Function proxy.
 * Uses /api/sheets-sync with Service Account auth (no user OAuth).
 * Server uses GOOGLE_SA_CLIENT_EMAIL + GOOGLE_SA_PRIVATE_KEY; user shares Drive folder with SA.
 */

const SHEETS_API_PATH = '/api/sheets-sync';

export type SheetsSyncResult =
  | { ok: true; spreadsheetId: string; spreadsheetUrl: string; counts: { events: number; clients: number; artists: number; expenses: number } }
  | { ok: false; error: string; detail?: string; code?: string; spreadsheetId?: string; spreadsheetUrl?: string };

async function sheetsFetch(bodyObj: Record<string, unknown>): Promise<SheetsSyncResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';

  const res = await fetch(`${base}${SHEETS_API_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bodyObj),
  });
  const data = await res.json().catch(() => ({})) as any;

  if (!res.ok) {
    const errorMsg = data?.error || `HTTP ${res.status}`;
    const detailMsg = data?.detail ? ` — ${data.detail}` : '';
    return {
      ok: false,
      error: errorMsg + detailMsg,
      detail: data?.detail,
      spreadsheetId: data?.spreadsheetId,
      spreadsheetUrl: data?.spreadsheetUrl,
    };
  }
  if (data?.ok) {
    return {
      ok: true,
      spreadsheetId: data.spreadsheetId,
      spreadsheetUrl: data.spreadsheetUrl,
      counts: data.counts ?? { events: 0, clients: 0, artists: 0, expenses: 0 },
    };
  }
  const err = data?.error || 'Unknown error';
  const detail = data?.detail ? ` — ${data.detail}` : '';
  return { ok: false, error: err + detail, detail: data?.detail };
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
