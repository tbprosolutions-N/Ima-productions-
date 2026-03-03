/**
 * Vercel API Route: Proxy for Supabase calendar-invite Edge Function.
 * Solves CORS by calling Supabase server-side (same-origin from client perspective).
 *
 * Client: POST /api/calendar-invite with body { event_id, send_invites } and Authorization: Bearer <user_jwt>
 * Env (Vercel): SUPABASE_URL, VITE_SUPABASE_ANON_KEY (or add SUPABASE_ANON_KEY)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization;
  const token = auth?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  if (!SUPABASE_URL || !ANON_KEY) {
    return res.status(502).json({ error: 'Server not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const eventId = typeof body.event_id === 'string' ? body.event_id.trim() : '';
  if (!eventId) {
    return res.status(400).json({ error: 'Missing event_id' });
  }

  const url = `${SUPABASE_URL}/functions/v1/calendar-invite`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        event_id: eventId,
        send_invites: body.send_invites !== false,
        access_token: token,
      }),
    });

    const data = (await response.json()) as { ok?: boolean; error?: string };
    res.status(response.status).json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[calendar-invite proxy]', msg);
    res.status(502).json({ error: msg });
  }
}
