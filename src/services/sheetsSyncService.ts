/**
 * Legacy Google Sheets sync — DEPRECATED.
 * sync_queue table has been removed. Backup is now on-demand via Settings → Backup → "Export to Sheets"
 * which calls the export-to-sheets Edge Function (no sync_queue).
 *
 * These stubs prevent any frontend code from calling the deleted sync_queue table (404).
 */

export type SheetsSyncResult =
  | { ok: true; queued: true; queueId: string }
  | { ok: true; spreadsheetId: string; spreadsheetUrl: string; counts: { events: number; clients: number; artists: number; expenses: number } }
  | { ok: false; error: string; detail?: string; code?: string; spreadsheetId?: string; spreadsheetUrl?: string };

export type SyncQueueRow = {
  id: string;
  user_id: string;
  agency_id: string;
  data: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result: { spreadsheetId?: string; spreadsheetUrl?: string; counts?: Record<string, number> } | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

const LEGACY_MSG = 'גיבוי לגיליון מתבצע כעת דרך הגדרות → גיבוי נתונים → ייצוא לגיליון.';

/** @deprecated sync_queue removed. Use Settings → Backup → Export to Sheets. */
export async function createSheetAndSync(
  _agencyId: string,
  _folderId: string,
  _sheets: { 'אירועים': string[][]; 'לקוחות': string[][]; 'אמנים': string[][]; 'פיננסים': string[][] },
  _userId: string
): Promise<SheetsSyncResult> {
  return { ok: false, error: LEGACY_MSG, code: 'LEGACY_SYNC_REMOVED' };
}

/** @deprecated sync_queue removed. Use Settings → Backup → Export to Sheets. */
export async function resyncSheet(
  _agencyId: string,
  _spreadsheetId: string,
  _sheets: { 'אירועים': string[][]; 'לקוחות': string[][]; 'אמנים': string[][]; 'פיננסים': string[][] },
  _userId: string
): Promise<SheetsSyncResult> {
  return { ok: false, error: LEGACY_MSG, code: 'LEGACY_SYNC_REMOVED' };
}

export type EditableFlatSheets = {
  'אירועים': string[][];
  'לקוחות': string[][];
  'אמנים': string[][];
  'פיננסים': string[][];
};

/** @deprecated sync_queue removed. Use Settings → Backup → Export to Sheets. */
export async function resyncEditableSheet(
  _agencyId: string,
  _spreadsheetId: string,
  _flatSheets: EditableFlatSheets,
  _userId: string
): Promise<SheetsSyncResult> {
  return { ok: false, error: LEGACY_MSG, code: 'LEGACY_SYNC_REMOVED' };
}

/** @deprecated sync_queue removed. No-op subscription. */
export function subscribeSyncQueue(
  _queueId: string,
  _callbacks: { onCompleted?: (result: SyncQueueRow['result']) => void; onFailed?: (errorMessage: string | null) => void }
): () => void {
  return () => {};
}
