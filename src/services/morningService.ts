/**
 * Morning (Green Invoice) API via Netlify Function proxy.
 * Never sends API Secret to the client; all auth is server-side.
 * Uses /api/morning (redirected to /.netlify/functions/morning-api via netlify.toml).
 * Requires JWT: pass session.access_token in Authorization header.
 */

import { supabase } from '@/lib/supabase';

const MORNING_API_PATH = '/api/morning';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (session?.access_token) {
    headers['authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export type MorningCreateDocumentResult =
  | { ok: true; docId: string | null; docNumber: string | null; docUrl: string | null }
  | { ok: false; error: string; detail?: string };

export type MorningCheckStatusResult =
  | { ok: true; morning_doc_status: string | null; status?: string }
  | { ok: false; error: string; detail?: string };

/**
 * Fetch latest document status from Morning and update the event in Supabase.
 * Call after creating a document or to refresh payment status.
 */
export async function checkEventDocumentStatus(
  agencyId: string,
  eventId: string
): Promise<MorningCheckStatusResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${base}${MORNING_API_PATH}`;
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'getDocumentStatus',
      agencyId,
      eventId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    detail?: string;
    morning_doc_status?: string | null;
    status?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: data?.error || `HTTP ${res.status}`,
      detail: data?.detail,
    };
  }
  if (data?.ok) {
    return {
      ok: true,
      morning_doc_status: data.morning_doc_status ?? null,
      status: data.status,
    };
  }
  return {
    ok: false,
    error: data?.error || 'Unknown error',
    detail: data?.detail,
  };
}

/**
 * Request creation of a document (invoice/receipt) in Morning for the given event.
 * Calls the Netlify Function which uses server-side credentials.
 */
export async function createEventDocument(
  agencyId: string,
  eventId: string
): Promise<MorningCreateDocumentResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${base}${MORNING_API_PATH}`;
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'createDocument',
      agencyId,
      eventId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    detail?: string;
    docId?: string | null;
    docNumber?: string | null;
    docUrl?: string | null;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: data?.error || `HTTP ${res.status}`,
      detail: data?.detail,
    };
  }
  if (data?.ok) {
    return {
      ok: true,
      docId: data.docId ?? null,
      docNumber: data.docNumber ?? null,
      docUrl: data.docUrl ?? null,
    };
  }
  return {
    ok: false,
    error: data?.error || 'Unknown error',
    detail: data?.detail,
  };
}
