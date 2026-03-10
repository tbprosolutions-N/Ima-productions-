/**
 * One-time bootstrap: ensure public.users row exists for an auth user (so Google login works).
 * Call this once with your email after signing in with Google once (so auth.users has your row).
 *
 * Env (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BOOTSTRAP_SECRET
 * POST body: { "email": "you@example.com", "secret": "your-BOOTSTRAP_SECRET" }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', hint: 'POST with { email, secret }' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bootstrapSecret = (process.env.BOOTSTRAP_SECRET || '').trim();

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' });
  }
  if (!bootstrapSecret) {
    return res.status(500).json({
      error: 'BOOTSTRAP_SECRET not set in Vercel. Add it in Project → Settings → Environment Variables.',
    });
  }

  const body = (req.body || {}) as { email?: string; secret?: string };
  const email = (body.email || '').trim().toLowerCase();
  const secret = (body.secret || '').trim();

  if (!email) {
    return res.status(400).json({ error: 'Missing email in body. Example: { "email": "you@example.com", "secret": "..." }' });
  }
  if (secret !== bootstrapSecret) {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // 1) Find auth user by email (they must have signed in with Google at least once)
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = (listData?.users || []).find(
      (u: { email?: string }) => (u.email || '').toLowerCase() === email
    );

    if (!authUser) {
      return res.status(400).json({
        error: 'Auth user not found',
        hint: 'Sign in with Google once at https://npc-am.com/login so your account is created; then call this API again.',
      });
    }

    const userId = authUser.id;
    const fullName =
      (authUser.user_metadata?.full_name as string) ||
      (email.split('@')[0] || 'User');

    // 2) Get first agency
    const { data: agencies } = await admin.from('agencies').select('id').limit(1);
    const agencyId = agencies?.[0]?.id;
    if (!agencyId) {
      return res.status(500).json({
        error: 'No agency in database. Run Supabase bootstrap or create an agency first.',
      });
    }

    // 3) Upsert public.users
    const { error: upsertErr } = await admin.from('users').upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        role: 'owner',
        agency_id: agencyId,
        onboarded: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      return res.status(500).json({
        error: 'Failed to create user row',
        detail: upsertErr.message,
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'You can now log in at https://npc-am.com/login with Google.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: 'Bootstrap failed', detail: msg });
  }
}
