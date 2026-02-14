import { supabase } from '@/lib/supabase';
import type { IntegrationProvider, SyncJob } from '@/types';

export async function queueSyncJob(args: {
  agencyId: string;
  provider: IntegrationProvider;
  kind: string;
  payload?: Record<string, any>;
  createdBy?: string;
}): Promise<SyncJob | null> {
  try {
    const { data, error } = await supabase
      .from('sync_jobs')
      .insert([
        {
          agency_id: args.agencyId,
          provider: args.provider,
          kind: args.kind,
          status: 'pending',
          payload: args.payload || {},
          created_by: args.createdBy || null,
        } as any,
      ])
      .select('*')
      .single();
    if (error) throw error;
    return (data as SyncJob) || null;
  } catch (e) {
    // Never crash UI because a background job couldn't be queued.
    console.warn('queueSyncJob failed', e);
    return null;
  }
}

