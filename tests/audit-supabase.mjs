#!/usr/bin/env node
/**
 * NPC Emergency Audit — Task 1 & 2
 * Supabase Data & Schema Integrity + Edge Functions & Secrets
 *
 * Run: node tests/audit-supabase.mjs
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env or environment
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
    // .env not found, use process.env only
  }
}

loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set in .env or environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function task1() {
  console.log('\n=== Task 1: Supabase Data & Schema Integrity ===\n');

  const tables = ['artists', 'clients', 'events', 'documents'];
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`  ${table}: ❌ ERROR — ${error.message} (code: ${error.code})`);
      } else {
        const cnt = count ?? 0;
        console.log(`  ${table}: ${cnt === 0 ? '⚠️  EMPTY' : `✅ ${cnt} row(s)`}`);
      }
    } catch (e) {
      console.log(`  ${table}: ❌ ${e.message}`);
    }
  }

  // RLS check: service_role bypasses RLS, so if we can read, RLS allows service_role.
  // For authenticated users we'd need to test with a real JWT.
  console.log('\n  RLS: service_role bypasses RLS. Policies apply to anon/authenticated only.');
  console.log('  → Verify in Supabase Dashboard: Table Editor → Table → RLS policies.');
}

async function task2() {
  console.log('\n=== Task 2: Edge Functions & Secrets Audit ===\n');

  // Use anon key for Edge Function invocation (same as Vercel proxy); service_role can return 401
  const INVOKE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || SERVICE_ROLE;

  // Ping send-email
  console.log('  send-email:');
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INVOKE_KEY}`,
      },
      body: JSON.stringify({
        to: ['audit-test@example.com'],
        subject: 'NPC Audit Ping',
        html: '<p>Test</p>',
      }),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text };
    }
    if (data.error === 'RESEND_API_KEY not configured') {
      console.log('    ❌ RESEND_API_KEY not available inside Edge Function');
    } else if (data.error?.includes('from') || data.error?.includes('RESEND_FROM')) {
      console.log('    ⚠️  RESEND_FROM may be missing (or Resend rejected)');
    } else if (res.ok) {
      console.log('    ✅ Invocation OK (200)');
    } else {
      console.log(`    Response ${res.status}: ${JSON.stringify(data)}`);
    }
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
  }

  // Ping calendar-invite (needs event_id + access_token; will fail without valid event)
  console.log('\n  calendar-invite:');
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/calendar-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INVOKE_KEY}`,
      },
      body: JSON.stringify({
        event_id: '00000000-0000-0000-0000-000000000000',
        send_invites: false,
        access_token: 'invalid-token-for-audit',
      }),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text };
    }
    if (data.error === 'Server not configured') {
      console.log('    ❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not in Edge Function env');
    } else if (data.error?.includes('Google OAuth')) {
      console.log('    ⚠️  Google OAuth secrets missing (expected for calendar)');
    } else if (data.error?.includes('Unauthorized') || data.error?.includes('JWT')) {
      console.log('    ⚠️  Auth check working (invalid token rejected)');
    } else {
      console.log(`    Response ${res.status}: ${JSON.stringify(data).slice(0, 120)}`);
    }
  } catch (e) {
    console.log(`    ❌ ${e.message}`);
  }

  console.log('\n  Secret verification: Run `npx supabase secrets list --project-ref oerqkyzfsdygmmsonrgz`');
  console.log('  Required: RESEND_API_KEY, RESEND_FROM, SUPABASE_URL (auto), SUPABASE_SERVICE_ROLE_KEY (auto)');
}

async function main() {
  console.log('NPC Production Integrity Audit');
  console.log(`Supabase URL: ${SUPABASE_URL?.slice(0, 40)}...`);
  await task1();
  await task2();
  console.log('\n=== Done ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
