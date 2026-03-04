/**
 * Vercel API Route: Proxy for Supabase calendar-invite Edge Function.
 * Solves CORS by calling Supabase server-side (same-origin from client perspective).
 *
 * Client: POST /api/calendar-invite with body { event_id, send_invites } and Authorization: Bearer <user_jwt>
 * Env (Vercel): SUPABASE_URL, VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

function json(res: VercelResponse, status: number, data: { ok?: boolean; error?: string }) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).json(data);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
      return res.status(204).end();
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' });
    }

    const auth = req.headers.authorization;
    const token = auth?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return json(res, 401, { error: 'Missing authorization' });
    }

    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

    if (!SUPABASE_URL || !ANON_KEY) {
      return json(res, 502, { error: 'Server not configured. Set SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.' });
    }

    let body: { event_id?: string; send_invites?: boolean } = {};
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body as object) || {};
    } catch {
      return json(res, 400, { error: 'Invalid JSON body' });
    }

    const eventId = typeof body.event_id === 'string' ? body.event_id.trim() : '';
    if (!eventId) {
      return json(res, 400, { error: 'Missing event_id' });
    }

    const url = `${SUPABASE_URL}/functions/v1/calendar-invite`;
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

    let data: { ok?: boolean; error?: string };
    const text = await response.text();
    try {
      data = text ? (JSON.parse(text) as { ok?: boolean; error?: string }) : {};
    } catch {
      data = { error: text?.slice(0, 200) || `HTTP ${response.status}` };
    }

    return json(res, response.status, data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[calendar-invite proxy]', msg);
    return json(res, 502, { error: msg });
  }
}
