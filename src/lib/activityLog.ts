import { supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demoStore';

export type ActivityAction =
  | 'logo_updated'
  | 'company_name_updated'
  | 'user_invited'
  | 'doc_sent'
  | 'event_created'
  | 'event_updated'
  | 'event_deleted'
  | 'morning_sync_event'
  | 'expense_uploaded'
  | 'expense_updated'
  | 'expense_deleted'
  | 'morning_sync_expenses';

export type ActivityEntry = {
  id: string;
  agency_id: string;
  created_at: string;
  actor_name: string;
  actor_email?: string;
  action: ActivityAction;
  message: string;
  meta?: Record<string, any>;
};

function key(agencyId: string) {
  return `ima_activity_${agencyId}`;
}

export function getActivity(agencyId: string): ActivityEntry[] {
  // Production: activity is stored server-side in audit_logs (Dashboard fetches it).
  if (!isDemoMode()) return [];
  try {
    const raw = localStorage.getItem(key(agencyId));
    const parsed = raw ? (JSON.parse(raw) as ActivityEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addActivity(
  agencyId: string,
  entry: Omit<ActivityEntry, 'id' | 'created_at' | 'agency_id'>
): ActivityEntry {
  const existing = getActivity(agencyId);
  const full: ActivityEntry = {
    id: globalThis.crypto?.randomUUID?.() ?? `act-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
    agency_id: agencyId,
    ...entry,
  };
  // Demo: keep local activity.
  if (isDemoMode()) {
    localStorage.setItem(key(agencyId), JSON.stringify([full, ...existing].slice(0, 200)));
  } else {
    // Production: write to server (best-effort, non-blocking).
    supabase
      .from('audit_logs')
      .insert([
        {
          agency_id: agencyId,
          actor_id: null,
          actor_name: full.actor_name,
          actor_email: full.actor_email ?? null,
          action: full.action,
          message: full.message,
          meta: full.meta ?? {},
          created_at: full.created_at,
        } as any,
      ])
      .then(({ error }) => {
        if (error) console.error(error);
      });
  }
  window.dispatchEvent(new CustomEvent('ima:activity', { detail: { agencyId } }));
  return full;
}

