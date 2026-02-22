/**
 * Google Sheets Sync — Async Pub/Sub pattern.
 * Inserts into sync_queue; Database Webhook triggers Edge Function; Realtime reports status.
 */

import { supabase } from '@/lib/supabase';

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

/** Circuit Breaker: do NOT enqueue when payload has no data. */
function circuitBreaker(sheets: { 'אירועים': string[][]; 'לקוחות': string[][]; 'אמנים': string[][]; 'פיננסים': string[][] }): SheetsSyncResult | null {
  const events = (sheets['אירועים']?.length ?? 1) - 1;
  const artists = (sheets['אמנים']?.length ?? 1) - 1;
  const expenses = (sheets['פיננסים']?.length ?? 1) - 1;
  if (events === 0 && artists === 0 && expenses === 0) {
    return {
      ok: false,
      error: 'אין נתונים לסנכרן. הוסף אירועים, אמנים או הוצאות תחילה.',
      detail: 'Empty payload blocked by circuit breaker.',
      code: 'EMPTY_PAYLOAD',
    };
  }
  return null;
}

/** Agency guard: sync job only created when agency_id is verified. */
function agencyGuard(agencyId: string): SheetsSyncResult | null {
  if (!agencyId || typeof agencyId !== 'string' || agencyId.trim().length === 0) {
    return {
      ok: false,
      error: 'טעינת הסוכנות נכשלה. ודא שהסוכנות נטענה ולחץ נסה שוב.',
      code: 'AGENCY_NOT_LOADED',
    };
  }
  return null;
}

/**
 * Enqueue create-and-sync job. Returns immediately with queueId.
 * Subscribe via subscribeSyncQueue(queueId, callbacks) for status updates.
 */
export async function createSheetAndSync(
  agencyId: string,
  folderId: string,
  sheets: { 'אירועים': string[][]; 'לקוחות': string[][]; 'אמנים': string[][]; 'פיננסים': string[][] },
  userId: string
): Promise<SheetsSyncResult> {
  const guard = agencyGuard(agencyId);
  if (guard) return guard;
  const blocked = circuitBreaker(sheets);
  if (blocked) return blocked;

  const counts = {
    events: sheets['אירועים'].length - 1,
    clients: sheets['לקוחות'].length - 1,
    artists: sheets['אמנים'].length - 1,
    expenses: sheets['פיננסים'].length - 1,
  };

  const { data: row, error } = await supabase
    .from('sync_queue')
    .insert({
      user_id: userId,
      agency_id: agencyId.trim(),
      data: {
        action: 'createAndSync',
        folderId: folderId.trim(),
        sheets,
        counts,
      },
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: error.message, detail: String(error), code: 'INSERT_FAILED' };
  }
  return { ok: true, queued: true, queueId: row.id };
}

/**
 * Enqueue resync job. Returns immediately with queueId.
 */
export async function resyncSheet(
  agencyId: string,
  spreadsheetId: string,
  sheets: { 'אירועים': string[][]; 'לקוחות': string[][]; 'אמנים': string[][]; 'פיננסים': string[][] },
  userId: string
): Promise<SheetsSyncResult> {
  const guard = agencyGuard(agencyId);
  if (guard) return guard;
  const blocked = circuitBreaker(sheets);
  if (blocked) return blocked;

  const counts = {
    events: sheets['אירועים'].length - 1,
    clients: sheets['לקוחות'].length - 1,
    artists: sheets['אמנים'].length - 1,
    expenses: sheets['פיננסים'].length - 1,
  };

  const { data: row, error } = await supabase
    .from('sync_queue')
    .insert({
      user_id: userId,
      agency_id: agencyId.trim(),
      data: {
        action: 'sync',
        spreadsheetId: spreadsheetId.trim(),
        sheets,
        counts,
      },
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: error.message, detail: String(error), code: 'INSERT_FAILED' };
  }
  return { ok: true, queued: true, queueId: row.id };
}

/**
 * Subscribe to sync_queue status changes. Callbacks fire when status becomes completed or failed.
 * Returns unsubscribe function.
 */
export function subscribeSyncQueue(
  queueId: string,
  callbacks: {
    onCompleted?: (result: SyncQueueRow['result']) => void;
    onFailed?: (errorMessage: string | null) => void;
  }
): () => void {
  const channel = supabase
    .channel(`sync_queue:${queueId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sync_queue',
        filter: `id=eq.${queueId}`,
      },
      (payload) => {
        const row = payload.new as SyncQueueRow;
        if (row.status === 'completed') {
          callbacks.onCompleted?.(row.result);
        } else if (row.status === 'failed') {
          callbacks.onFailed?.(row.error_message);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
