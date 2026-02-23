/**
 * Edge Function: send-immediate-alert
 * Triggered by Database Webhook on events INSERT. Sends a simple email notification
 * to the agency owner so they get the alert even if Sheet sync is pending or fails.
 *
 * Env (optional): RESEND_API_KEY, RESEND_FROM (e.g. "NPC <alerts@yourdomain.com>")
 * If RESEND_API_KEY is not set, the function returns 200 without sending (no retry loop).
 *
 * Setup: Supabase Dashboard → Database → Webhooks → Create hook on table "events", event "Insert",
 * type "Supabase Edge Function", function "send-immediate-alert".
 */

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOG_PREFIX = '[send-immediate-alert]';

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' } });
  }
  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  let payload: { type?: string; table?: string; record?: Record<string, unknown> };
  try {
    const text = await req.text();
    payload = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  if (payload?.table !== 'events' || payload?.type !== 'INSERT' || !payload?.record) {
    return respond(200, { ok: true, skipped: 'Not an events INSERT payload' });
  }

  const record = payload.record as Record<string, unknown>;
  const agencyId = record?.agency_id as string | undefined;
  if (!agencyId) {
    console.warn(`${LOG_PREFIX} No agency_id in record`);
    return respond(200, { ok: true, skipped: 'No agency_id' });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!resendKey) {
    console.warn(`${LOG_PREFIX} RESEND_API_KEY not set; skipping email`);
    return respond(200, { ok: true, skipped: 'Email not configured' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !supabaseKey) {
    console.error(`${LOG_PREFIX} Supabase env missing`);
    return respond(502, { error: 'Server not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data: ownerRow } = await supabase
    .from('users')
    .select('email')
    .eq('agency_id', agencyId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  const toEmail = (ownerRow as { email?: string } | null)?.email?.trim();
  if (!toEmail) {
    console.warn(`${LOG_PREFIX} No owner email for agency ${agencyId}`);
    return respond(200, { ok: true, skipped: 'No owner email' });
  }

  const eventDate = (record.event_date as string) || '';
  const businessName = (record.business_name as string) || '—';
  const invoiceName = (record.invoice_name as string) || '';
  const amount = record.amount != null ? String(record.amount) : '—';
  const status = (record.status as string) || '—';

  const from = Deno.env.get('RESEND_FROM')?.trim() || 'NPC Alerts <onboarding@resend.dev>';
  const subject = 'NPC: אירוע חדש — ' + (businessName || 'אירוע');
  const html = `
    <p>נוסף אירוע חדש ביומן.</p>
    <ul>
      <li><strong>תאריך:</strong> ${eventDate}</li>
      <li><strong>שם עסק:</strong> ${businessName}</li>
      <li><strong>שם לחשבונית:</strong> ${invoiceName || '—'}</li>
      <li><strong>סכום:</strong> ${amount}</li>
      <li><strong>סטטוס:</strong> ${status}</li>
    </ul>
    <p><small>התראה זו נשלחת אוטומטית עם הוספת אירוע. גיבוי לגיליון יבוצע בהמשך.</small></p>
  `.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [toEmail], subject, html }),
    });
    const rawText = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = rawText.length > 0 ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      data = { _raw: rawText.slice(0, 500) };
    }
    if (!res.ok) {
      const msg = (data as { message?: string })?.message ?? (data as { error?: string })?.error ?? rawText.slice(0, 300);
      console.error(`${LOG_PREFIX} Resend API error: status=${res.status}`, JSON.stringify(data));
      return respond(502, {
        error: 'Failed to send email',
        detail: msg,
        resend_status: res.status,
        resend_response: data,
      });
    }
    console.log(`${LOG_PREFIX} Email sent to ${toEmail} for event ${record.id}`);
    return respond(200, { ok: true, id: (data as { id?: string })?.id });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const errStack = e instanceof Error ? e.stack : undefined;
    console.error(`${LOG_PREFIX} Send exception:`, errMsg, errStack);
    return respond(502, { error: 'Failed to send email', detail: errMsg });
  }
});
