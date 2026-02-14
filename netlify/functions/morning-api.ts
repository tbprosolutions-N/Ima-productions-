/**
 * Netlify Function: Morning (Green Invoice) API proxy.
 * Keeps API Key and Secret server-side; frontend calls this function.
 *
 * Env (set in Netlify UI or .env for local):
 * - MORNING_API_KEY (Green Invoice API Key ID)
 * - MORNING_API_SECRET (Secret; use quotes in .env for special characters)
 * - MORNING_BASE_URL (optional, default https://api.greeninvoice.co.il/api/v1)
 * - MORNING_ENV (optional, e.g. sandbox)
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (to read event/client/artist and update event)
 */

const DEFAULT_BASE_URL = 'https://api.greeninvoice.co.il/api/v1';

async function greenInvoiceRequest(args: {
  baseUrl: string;
  path: string;
  method?: string;
  token?: string;
  body?: unknown;
}) {
  const url = `${args.baseUrl}${args.path}`;
  const res = await fetch(url, {
    method: args.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(args.token ? { authorization: `Bearer ${args.token}` } : {}),
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Morning API error ${res.status}: ${text}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function getToken(baseUrl: string, id: string, secret: string): Promise<string> {
  const out = (await greenInvoiceRequest({
    baseUrl,
    path: '/account/token',
    method: 'POST',
    body: { id, secret },
  })) as { token?: string };
  const token = out?.token ? String(out.token) : '';
  if (!token) throw new Error('Morning token missing (bad id/secret?)');
  return token;
}

function docTypeCode(docType: string): number {
  if (docType === 'receipt') return 400;
  if (docType === 'payment_request') return 320;
  return 320;
}

export const handler = async (event: { httpMethod: string; body?: string | null }) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.MORNING_API_KEY?.trim();
  const apiSecret = process.env.MORNING_API_SECRET?.trim();
  const baseUrl = (process.env.MORNING_BASE_URL || DEFAULT_BASE_URL).trim();
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!apiKey || !apiSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Morning credentials not configured (MORNING_API_KEY, MORNING_API_SECRET)' }),
    };
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Supabase not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' }),
    };
  }

  let body: { action?: string; agencyId?: string; eventId?: string };
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const action = body.action || '';
  const agencyId = body.agencyId?.trim();
  const eventId = body.eventId?.trim();

  if (!agencyId || !eventId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing agencyId or eventId' }),
    };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

  if (action === 'getDocumentStatus') {
    const { data: ev, error: evErr } = await supabase
      .from('events')
      .select('id, morning_document_id, status')
      .eq('agency_id', agencyId)
      .eq('id', eventId)
      .single();
    if (evErr || !ev) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Event not found', detail: (evErr as any)?.message }),
      };
    }
    const docId = (ev as { morning_document_id?: string }).morning_document_id;
    if (!docId) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          morning_doc_status: null,
          status: (ev as { status?: string }).status,
          message: 'No document in Morning yet',
        }),
      };
    }
    let jwt: string;
    try {
      jwt = await getToken(baseUrl, apiKey, apiSecret);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { statusCode: 502, body: JSON.stringify({ error: 'Morning auth failed', detail: msg }) };
    }
    let docData: { status?: number; payment?: unknown[]; url?: { origin?: string } };
    try {
      docData = (await greenInvoiceRequest({
        baseUrl,
        path: `/documents/${encodeURIComponent(docId)}`,
        method: 'GET',
        token: jwt,
      })) as { status?: number; payment?: unknown[]; url?: { origin?: string } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from('events')
        .update({ morning_last_error: msg } as Record<string, unknown>)
        .eq('agency_id', agencyId)
        .eq('id', eventId);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Failed to fetch document status', detail: msg }),
      };
    }
    const hasPayment = Array.isArray(docData?.payment) && docData.payment.length > 0;
    const greenStatus = docData?.status;
    const isPaid = hasPayment || greenStatus === 2 || greenStatus === 400;
    const morningDocStatus = isPaid ? 'paid' : (greenStatus != null ? String(greenStatus) : 'open');
    await supabase
      .from('events')
      .update({
        morning_doc_status: morningDocStatus,
        ...(isPaid ? { status: 'paid' as const } : {}),
        morning_last_error: null,
      } as Record<string, unknown>)
      .eq('agency_id', agencyId)
      .eq('id', eventId);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        morning_doc_status: morningDocStatus,
        status: isPaid ? 'paid' : (ev as { status?: string }).status,
      }),
    };
  }

  if (action !== 'createDocument') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Unknown action. Use createDocument or getDocumentStatus' }),
    };
  }

  let jwt: string;
  try {
    jwt = await getToken(baseUrl, apiKey, apiSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Morning auth failed', detail: msg }),
    };
  }

  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('id', eventId)
    .single();

  if (evErr || !ev) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Event not found', detail: evErr?.message }),
    };
  }

  const clientId = (ev as { client_id?: string }).client_id;
  const artistId = (ev as { artist_id?: string }).artist_id;

  const [{ data: client }, { data: artist }] = await Promise.all([
    clientId
      ? supabase.from('clients').select('*').eq('agency_id', agencyId).eq('id', clientId).maybeSingle()
      : Promise.resolve({ data: null }),
    artistId
      ? supabase.from('artists').select('*').eq('agency_id', agencyId).eq('id', artistId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const currency = 'ILS';
  const lang = 'he';
  const eventDate = new Date((ev as { event_date: string }).event_date).toISOString().slice(0, 10);
  const paymentDate = (ev as { payment_date?: string }).payment_date
    ? new Date((ev as { payment_date: string }).payment_date).toISOString().slice(0, 10)
    : eventDate;
  const amount = Number((ev as { amount?: number }).amount || 0);
  const docType = String((ev as { doc_type?: string }).doc_type || 'tax_invoice');
  const businessName = String((ev as { business_name?: string }).business_name || '');
  const invoiceName = String((ev as { invoice_name?: string }).invoice_name || '');

  const docPayload: Record<string, unknown> = {
    type: docTypeCode(docType),
    description: `NPC · אירוע ${eventDate} · ${businessName}`,
    lang,
    currency,
    client: {
      name: (client as { business_name?: string })?.business_name || invoiceName || businessName || 'לקוח',
      emails: (client as { email?: string })?.email ? [(client as { email: string }).email] : [],
      phone: (client as { phone?: string })?.phone || undefined,
      address: (client as { address?: string })?.address || undefined,
    },
    income: [
      {
        description:
          `אירוע ${eventDate} · ${businessName}` +
          ((artist as { name?: string })?.name ? ` · ${(artist as { name: string }).name}` : ''),
        quantity: 1,
        price: amount,
        currency,
      },
    ],
  };

  if (docType === 'receipt') {
    (docPayload as { payment?: unknown[] }).payment = [
      { price: amount, currency, date: paymentDate, type: 'credit' },
    ];
  }

  let created: { id?: number; number?: string; url?: { origin?: string } };
  try {
    created = (await greenInvoiceRequest({
      baseUrl,
      path: '/documents',
      method: 'POST',
      token: jwt,
      body: docPayload,
    })) as { id?: number; number?: string; url?: { origin?: string } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from('events')
      .update({
        morning_sync_status: 'error',
        morning_last_error: msg,
      } as Record<string, unknown>)
      .eq('agency_id', agencyId)
      .eq('id', eventId);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Document create failed', detail: msg }),
    };
  }

  const docId = created?.id != null ? String(created.id) : null;
  const docNumber = created?.number != null ? String(created.number) : null;
  const docUrl = created?.url?.origin ? String(created.url.origin) : null;

  await supabase
    .from('events')
    .update({
      morning_sync_status: 'synced',
      morning_document_id: docId,
      morning_document_number: docNumber,
      morning_document_url: docUrl,
      morning_last_error: null,
    } as Record<string, unknown>)
    .eq('agency_id', agencyId)
    .eq('id', eventId);

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true, docId, docNumber, docUrl }),
  };
};
