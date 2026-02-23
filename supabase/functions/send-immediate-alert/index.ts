/**
 * Edge Function: send-immediate-alert
 * Triggered by Database Webhook on events INSERT.
 * 1. Sends alert to agency owner (existing).
 * 2. Sends invitation email via Resend to artist and client (when emails exist).
 * Once RESEND domain is active, all emails will deliver successfully.
 *
 * Env: RESEND_API_KEY, RESEND_FROM (e.g. "NPC <alerts@yourdomain.com>")
 * If RESEND_API_KEY is not set, returns 200 without sending (no retry loop).
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

async function sendResendEmail(args: {
  resendKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${args.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: args.from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
      }),
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
      return { ok: false, error: msg };
    }
    return { ok: true, id: (data as { id?: string })?.id };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} Resend send exception:`, errMsg);
    return { ok: false, error: errMsg };
  }
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

  const eventDate = (record.event_date as string) || '';
  const businessName = (record.business_name as string) || '—';
  const invoiceName = (record.invoice_name as string) || '';
  const amount = record.amount != null ? String(record.amount) : '—';
  const status = (record.status as string) || '—';
  const artistId = record?.artist_id as string | undefined;
  const clientId = record?.client_id as string | undefined;

  const from = Deno.env.get('RESEND_FROM')?.trim() || 'NPC Alerts <onboarding@resend.dev>';

  // 1. Owner alert
  const { data: ownerRow } = await supabase
    .from('users')
    .select('email')
    .eq('agency_id', agencyId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();
  const ownerEmail = (ownerRow as { email?: string } | null)?.email?.trim();

  // 2. Artist and client emails for invitation
  let artistEmail = '';
  let clientEmail = '';
  if (artistId || clientId) {
    const [artistRes, clientRes] = await Promise.all([
      artistId ? supabase.from('artists').select('email,calendar_email').eq('id', artistId).eq('agency_id', agencyId).maybeSingle() : { data: null },
      clientId ? supabase.from('clients').select('email').eq('id', clientId).eq('agency_id', agencyId).maybeSingle() : { data: null },
    ]);
    artistEmail = String((artistRes?.data as any)?.calendar_email || (artistRes?.data as any)?.email || '').trim();
    clientEmail = String((clientRes?.data as any)?.email || '').trim();
  }

  const ownerSubject = 'NPC: אירוע חדש — ' + (businessName || 'אירוע');
  const ownerHtml = `
    <p>נוסף אירוע חדש ביומן.</p>
    <ul>
      <li><strong>תאריך:</strong> ${eventDate}</li>
      <li><strong>שם עסק:</strong> ${businessName}</li>
      <li><strong>שם לחשבונית:</strong> ${invoiceName || '—'}</li>
      <li><strong>סכום:</strong> ${amount}</li>
      <li><strong>סטטוס:</strong> ${status}</li>
    </ul>
    <p><small>התראה זו נשלחת אוטומטית עם הוספת אירוע.</small></p>
  `.trim();

  const inviteSubject = 'הזמנה לאירוע — ' + (businessName || 'אירוע');
  const inviteHtml = `
    <p>שלום,</p>
    <p>הוזמנת לאירוע הבא:</p>
    <ul>
      <li><strong>תאריך:</strong> ${eventDate}</li>
      <li><strong>שם עסק:</strong> ${businessName}</li>
      <li><strong>שם לחשבונית:</strong> ${invoiceName || '—'}</li>
      <li><strong>סכום:</strong> ${amount}</li>
      <li><strong>סטטוס:</strong> ${status}</li>
    </ul>
    <p>הזמנה זו נשלחת אוטומטית מ-NPC.</p>
  `.trim();

  const results: { owner?: boolean; artist?: boolean; client?: boolean; errors?: string[] } = {};
  const errors: string[] = [];

  if (ownerEmail) {
    const r = await sendResendEmail({ resendKey, from, to: ownerEmail, subject: ownerSubject, html: ownerHtml });
    results.owner = r.ok;
    if (!r.ok && r.error) errors.push(`owner: ${r.error}`);
    if (r.ok) console.log(`${LOG_PREFIX} Owner alert sent to ${ownerEmail}`);
  }

  if (artistEmail) {
    const r = await sendResendEmail({ resendKey, from, to: artistEmail, subject: inviteSubject, html: inviteHtml });
    results.artist = r.ok;
    if (!r.ok && r.error) errors.push(`artist: ${r.error}`);
    if (r.ok) console.log(`${LOG_PREFIX} Invitation sent to artist ${artistEmail}`);
  }

  if (clientEmail && clientEmail !== artistEmail) {
    const r = await sendResendEmail({ resendKey, from, to: clientEmail, subject: inviteSubject, html: inviteHtml });
    results.client = r.ok;
    if (!r.ok && r.error) errors.push(`client: ${r.error}`);
    if (r.ok) console.log(`${LOG_PREFIX} Invitation sent to client ${clientEmail}`);
  }

  if (errors.length > 0) results.errors = errors;

  return respond(200, { ok: true, sent: results });
});
