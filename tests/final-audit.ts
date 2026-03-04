/**
 * NPC Emergency Audit — Task 4: Live Transaction Test ("Smoking Gun")
 *
 * 1. Login via Supabase Auth
 * 2. Fetch list of artists
 * 3. Create a "Ghost Event" and trigger calendar-invite
 * 4. Report exact error code for any failure
 *
 * Run: npx tsx tests/final-audit.ts
 * Or:  node --loader ts-node/esm tests/final-audit.ts
 * Requires: .env with SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and test credentials
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        const val = m[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const APP_URL = process.env.VITE_APP_URL || 'https://npc-am.com';

// Test credentials — override via env: AUDIT_EMAIL, AUDIT_PASSWORD
const TEST_EMAIL = process.env.AUDIT_EMAIL || 'modu.general@gmail.com';
const TEST_PASSWORD = process.env.AUDIT_PASSWORD || '';

async function main() {
  console.log('\n=== NPC Final Audit: Live Transaction Test ===\n');

  if (!SUPABASE_URL || !ANON_KEY) {
    console.error('❌ Missing SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

  // Step 1: Login
  console.log('Step 1: Login via Supabase Auth');
  if (!TEST_PASSWORD) {
    console.log('  ⚠️  AUDIT_PASSWORD not set — skipping login. Set for full test.');
  } else {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });
      if (error) {
        console.log(`  ❌ Login failed: ${error.message} (code: ${error.status})`);
        process.exit(1);
      }
      console.log(`  ✅ Logged in: ${data.user?.email}`);
    } catch (e: unknown) {
      console.log(`  ❌ ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // Get session for API call
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.log('  ⚠️  No session — calendar-invite will fail with 401.');
  }

  // Step 2: Fetch artists (use service role for audit if no session)
  console.log('\nStep 2: Fetch artists');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = serviceKey
    ? createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
    : supabase;

  try {
    const { data: artists, error } = await client.from('artists').select('id, name').limit(5);
    if (error) {
      console.log(`  ❌ Fetch failed: ${error.message} (code: ${error.code})`);
    } else {
      console.log(`  ✅ Artists: ${(artists?.length ?? 0)} rows`);
    }
  } catch (e: unknown) {
    console.log(`  ❌ ${(e as Error).message}`);
  }

  // Step 3 & 4: Create Ghost Event + calendar-invite
  console.log('\nStep 3–4: Create Ghost Event + calendar-invite');

  // Need agency_id — fetch from users if we have session, else from agencies table
  let agencyId = process.env.AUDIT_AGENCY_ID || '';
  if (!agencyId && session?.user) {
    const { data: userRow } = await client
      .from('users')
      .select('agency_id')
      .eq('id', session.user.id)
      .single();
    agencyId = (userRow as { agency_id?: string } | null)?.agency_id || '';
  }
  let producerId = session?.user?.id || '';
  if (!agencyId && serviceKey) {
    const { data: agencies } = await client.from('agencies').select('id').limit(1);
    agencyId = (agencies?.[0] as { id?: string } | undefined)?.id || '';
  }
  if (agencyId && serviceKey && !producerId) {
    const { data: userRow } = await client.from('users').select('id').eq('agency_id', agencyId).limit(1).single();
    producerId = (userRow as { id?: string } | null)?.id || agencyId;
  }
  if (!agencyId) {
    console.log('  ⚠️  No agency_id — cannot create event. Set AUDIT_AGENCY_ID or ensure agencies table has data.');
  }

  if (agencyId && producerId) {
    try {
      const { data: inserted, error: insertErr } = await client
        .from('events')
        .insert({
          agency_id: agencyId,
          producer_id: producerId,
          event_date: new Date().toISOString().slice(0, 10),
          weekday: 'Sunday',
          business_name: 'Ghost Audit Event',
          invoice_name: 'Ghost Audit',
          amount: 0,
          status: 'draft',
          doc_type: 'tax_invoice',
        })
        .select('id')
        .single();

      if (insertErr) {
        console.log(`  ❌ Event insert failed: ${insertErr.message} (code: ${insertErr.code})`);
      } else {
        const eventId = (inserted as { id?: string } | null)?.id;
        console.log(`  ✅ Ghost event created: ${eventId}`);

        // Trigger calendar-invite
        const apiUrl = `${APP_URL}/api/calendar-invite`;
        console.log(`\n  Calling ${apiUrl}...`);
        const token = session?.access_token || 'no-token';

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ event_id: eventId, send_invites: false }),
        });

        const text = await res.text();
        let body: { ok?: boolean; error?: string } = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          body = { error: text };
        }

        console.log(`  calendar-invite response: ${res.status}`);
        if (body.error) console.log(`  Error: ${body.error}`);

        if (res.status === 401) {
          console.log('  → 401: Missing or invalid JWT. Check Vercel env + Auth redirect URLs.');
        } else if (res.status === 502) {
          console.log('  → 502: Vercel API route or Supabase Edge Function misconfigured.');
        } else if (res.ok && body.ok) {
          console.log('  ✅ Send Invitation flow OK');
        }
      }
    } catch (e: unknown) {
      console.log(`  ❌ ${(e as Error).message}`);
    }
  }

  console.log('\n=== Audit complete ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
