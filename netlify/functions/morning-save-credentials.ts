/**
 * Netlify Function: Save Morning (Green Invoice) credentials to integration_secrets.
 * Requires JWT: Authorization: Bearer <session_token>. Only owner or finance role can save.
 *
 * Body: { agencyId, companyId, apiSecret, baseUrl? }
 * Stores in integration_secrets(provider='morning').secret: { id: companyId, secret: apiSecret, base_url }
 */

export const handler = async (event: { httpMethod: string; body?: string | null; headers?: Record<string, string | string[] | undefined> }) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Supabase not configured' }),
    };
  }

  const authHeader = event.headers?.['authorization'] ?? event.headers?.['Authorization'];
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token) {
    return {
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized', detail: 'Missing Authorization: Bearer <token>' }),
    };
  }

  let body: { agencyId?: string; companyId?: string; apiSecret?: string; baseUrl?: string };
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch {
    return { statusCode: 400, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const agencyId = body.agencyId?.trim();
  const companyId = body.companyId?.trim();
  const apiSecret = body.apiSecret?.trim();
  const baseUrl = (body.baseUrl || 'https://api.greeninvoice.co.il/api/v1').trim();

  if (!agencyId || !companyId || !apiSecret) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'נדרשים: agencyId, companyId, apiSecret' }),
    };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return {
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized', detail: authErr?.message || 'Invalid or expired token' }),
    };
  }

  const { data: appUser } = await supabase.from('users').select('agency_id, role').eq('id', user.id).single();
  const userAgencyId = (appUser as { agency_id?: string } | null)?.agency_id;
  const userRole = (appUser as { role?: string } | null)?.role;
  const canSave = userAgencyId === agencyId && (userRole === 'owner' || userRole === 'finance');
  if (!canSave) {
    return {
      statusCode: 403,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Forbidden', detail: 'Only owner or finance can save Morning credentials' }),
    };
  }

  const { error: secErr } = await supabase.from('integration_secrets').upsert(
    [
      {
        agency_id: agencyId,
        provider: 'morning',
        secret: { id: companyId, secret: apiSecret, base_url: baseUrl },
      } as any,
    ],
    { onConflict: 'agency_id,provider' },
  );
  if (secErr) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to save credentials', detail: secErr.message }),
    };
  }

  const { error: iErr } = await supabase.from('integrations').upsert(
    [
      {
        agency_id: agencyId,
        provider: 'morning',
        status: 'connected',
        config: { base_url: baseUrl },
        connected_at: new Date().toISOString(),
      } as any,
    ],
    { onConflict: 'agency_id,provider' },
  );
  if (iErr) {
    console.warn('integrations upsert failed:', iErr);
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
};
