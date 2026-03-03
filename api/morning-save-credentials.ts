/**
 * Vercel API Route: Save Morning (Green Invoice) credentials to integration_secrets.
 * Replaces Netlify function. Requires JWT: Authorization: Bearer <session_token>.
 * Only owner or finance role can save.
 *
 * Body: { agencyId, companyId, apiSecret, baseUrl? }
 * Env (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const authHeader = req.headers.authorization ?? req.headers.Authorization;
  const token =
    typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      detail: 'Missing Authorization: Bearer <token>',
    });
  }

  const body = (req.body || {}) as {
    agencyId?: string;
    companyId?: string;
    apiSecret?: string;
    baseUrl?: string;
  };
  const agencyId = body.agencyId?.trim();
  const companyId = body.companyId?.trim();
  const apiSecret = body.apiSecret?.trim();
  const baseUrl = (body.baseUrl || 'https://api.greeninvoice.co.il/api/v1').trim();

  if (!agencyId || !companyId || !apiSecret) {
    return res.status(400).json({
      error: 'נדרשים: agencyId, companyId, apiSecret',
    });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({
      error: 'Unauthorized',
      detail: authErr?.message || 'Invalid or expired token',
    });
  }

  const { data: appUser } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single();
  const userAgencyId = (appUser as { agency_id?: string } | null)?.agency_id;
  const userRole = (appUser as { role?: string } | null)?.role;
  const canSave =
    userAgencyId === agencyId && (userRole === 'owner' || userRole === 'finance');
  if (!canSave) {
    return res.status(403).json({
      error: 'Forbidden',
      detail: 'Only owner or finance can save Morning credentials',
    });
  }

  const { error: secErr } = await supabase.from('integration_secrets').upsert(
    [
      {
        agency_id: agencyId,
        provider: 'morning',
        secret: { id: companyId, secret: apiSecret, base_url: baseUrl },
      } as Record<string, unknown>,
    ],
    { onConflict: 'agency_id,provider' }
  );
  if (secErr) {
    return res.status(500).json({
      error: 'Failed to save credentials',
      detail: secErr.message,
    });
  }

  const { error: iErr } = await supabase.from('integrations').upsert(
    [
      {
        agency_id: agencyId,
        provider: 'morning',
        status: 'connected',
        config: { base_url: baseUrl },
        connected_at: new Date().toISOString(),
      } as Record<string, unknown>,
    ],
    { onConflict: 'agency_id,provider' }
  );
  if (iErr) {
    console.warn('integrations upsert failed:', iErr);
  }

  return res.status(200).json({ ok: true });
}
