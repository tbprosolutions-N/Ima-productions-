/**
 * Google Sheets Sync via Supabase Edge Function.
 * Uses `supabase.functions.invoke('sheets-sync')` — no Netlify dependency.
 * Server-side uses GOOGLE_SA_CLIENT_EMAIL + GOOGLE_SA_PRIVATE_KEY secrets.
 */

import { supabase } from '@/lib/supabase';

export type SheetsSyncResult =
  | { ok: true; spreadsheetId: string; spreadsheetUrl: string; counts: { events: number; clients: number; artists: number; expenses: number } }
  | { ok: false; error: string; detail?: string; code?: string; spreadsheetId?: string; spreadsheetUrl?: string };

const SHEETS_REQUEST_TIMEOUT_MS = 110_000; // 110s client timeout; Supabase Edge Functions allow 150s

async function sheetsFetch(bodyObj: Record<string, unknown>): Promise<SheetsSyncResult> {
  // Race the invoke against a hard client-side timeout
  const timeoutPromise = new Promise<SheetsSyncResult>((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), SHEETS_REQUEST_TIMEOUT_MS)
  );

  const invokePromise = supabase.functions
    .invoke('sheets-sync', { body: bodyObj })
    .then(({ data, error }) => {
      if (error) {
        return {
          ok: false as const,
          error: error.message || 'Edge Function error',
          detail: String(error),
        };
      }
      if (data?.ok) {
        return {
          ok: true as const,
          spreadsheetId: data.spreadsheetId as string,
          spreadsheetUrl: data.spreadsheetUrl as string,
          counts: (data.counts as { events: number; clients: number; artists: number; expenses: number }) ??
            { events: 0, clients: 0, artists: 0, expenses: 0 },
        };
      }
      return {
        ok: false as const,
        error: (data?.error as string) || 'Unknown error',
        detail: data?.detail as string | undefined,
        spreadsheetId: data?.spreadsheetId as string | undefined,
        spreadsheetUrl: data?.spreadsheetUrl as string | undefined,
      };
    });

  try {
    return await Promise.race([invokePromise, timeoutPromise]);
  } catch (e: any) {
    if (e?.message === 'TIMEOUT') {
      return { ok: false, error: 'Request timed out. Try again — large datasets may take up to 2 minutes.', code: 'TIMEOUT' };
    }
    return { ok: false, error: e?.message || 'Network error calling sheets-sync function' };
  }
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
