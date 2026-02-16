import { supabase } from '@/lib/supabase';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionErrors';

export type GoogleConnectRequested = {
  drive?: boolean;
  calendar?: boolean;
  gmail?: boolean;
  sheets?: boolean;
};

export async function startGoogleOAuth(args: {
  agencyId: string;
  requested: GoogleConnectRequested;
  returnTo?: string;
}): Promise<{ authUrl: string }> {
  const { data, error } = await supabase.functions.invoke('google-oauth-start', {
    body: {
      agencyId: args.agencyId,
      requested: args.requested,
      returnTo: args.returnTo || `${window.location.origin}/settings?tab=integrations`,
    },
  });
  if (error) {
    const msg = await getEdgeFunctionErrorMessage(error, 'Google OAuth failed');
    throw new Error(msg);
  }
  if (!data?.authUrl) throw new Error('Missing authUrl from server');
  return { authUrl: String(data.authUrl) };
}

