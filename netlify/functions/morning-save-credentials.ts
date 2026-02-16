/**
 * Netlify Function: Save Morning (Green Invoice) credentials to integration_secrets.
 * Called from Settings → Backup tab. Uses service role; in production you may want to verify
 * the requesting user is the agency owner (e.g. via Authorization header / Supabase JWT).
 *
 * Body: { agencyId, companyId, apiSecret, baseUrl? }
 * Stores in integration_secrets(provider='morning').secret: { id: companyId, secret: apiSecret, base_url }
 */

export const handler = async (event: { httpMethod: string; body?: string | null }) => {
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
