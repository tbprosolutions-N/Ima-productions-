/**
 * Task 2: Service Integration Test
 * Tests Supabase connection and Resend (via send-email Edge Function).
 * Run: node tests/debug-services.mjs
 *
 * Requires .env with: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Optional: TEST_EMAIL for Resend test (e.g. your admin email)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    console.warn('No .env found; using process.env only');
    return;
  }
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const TEST_EMAIL = (process.env.TEST_EMAIL || process.env.ADMIN_EMAIL || '').trim();

const results = { supabase: null, resend: null };

async function testSupabase() {
  console.log('\n--- 1. Supabase Connection ---');
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    results.supabase = { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', code: null };
    console.log('FAIL: Missing env vars');
    return;
  }
  try {
    const client = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data, error } = await client.from('artists').select('id,name').limit(1).maybeSingle();
    if (error) {
      const code = error.code || error.status || (error.message?.match(/\b(\d{3})\b/)?.[1]);
      results.supabase = { ok: false, error: error.message, code: code || 'unknown' };
      console.log('FAIL:', error.message, '| Code:', code);
      if (SERVICE_ROLE.startsWith('sb_secret_')) {
        console.log('  → Tip: SUPABASE_SERVICE_ROLE_KEY should be the JWT (starts with eyJ) from Dashboard → Settings → API');
      }
      return;
    }
    results.supabase = { ok: true, row: data };
    console.log('OK: Fetched 1 row from artists:', data ? `${data.name} (${data.id?.slice(0, 8)}...)` : '(empty table)');
  } catch (err) {
    const msg = err?.message || String(err);
    const code = err?.status || err?.code || (msg.match(/\b(401|403|404|500)\b/)?.[1]);
    results.supabase = { ok: false, error: msg, code: code || 'unknown' };
    console.log('FAIL:', msg, '| Code:', code);
  }
}

async function testResend() {
  console.log('\n--- 2. Resend (send-email Edge Function) ---');
  if (!SUPABASE_URL || !ANON_KEY) {
    results.resend = { ok: false, error: 'Missing SUPABASE_URL or ANON_KEY for function invoke', code: null };
    console.log('FAIL: Missing env vars');
    return;
  }
  const to = TEST_EMAIL || 'test@example.com';
  if (!TEST_EMAIL) {
    console.log('Note: TEST_EMAIL not set; using test@example.com (Resend may reject)');
  }
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/send-email`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        to: [to],
        subject: '[NPC Debug] Service test',
        html: '<p>If you receive this, Resend + send-email are working.</p>',
        from: 'NPC Collective <noreply@npc-am.com>',
      }),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text?.slice(0, 200) };
    }
    if (res.ok && !data.error) {
      results.resend = { ok: true, status: res.status };
      console.log('OK: send-email returned', res.status);
    } else {
      results.resend = { ok: false, error: data?.error || text || `HTTP ${res.status}`, code: String(res.status) };
      console.log('FAIL:', res.status, data?.error || text?.slice(0, 150));
    }
  } catch (err) {
    const msg = err?.message || String(err);
    const code = err?.code || (msg.includes('CORS') ? 'CORS' : null);
    results.resend = { ok: false, error: msg, code: code || 'network' };
    console.log('FAIL:', msg);
  }
}

async function main() {
  console.log('=== NPC Debug Services ===');
  console.log('SUPABASE_URL:', SUPABASE_URL ? `${SUPABASE_URL.slice(0, 40)}...` : '(missing)');
  console.log('SERVICE_ROLE:', SERVICE_ROLE ? `${SERVICE_ROLE.slice(0, 20)}...` : '(missing)');
  console.log('ANON_KEY:', ANON_KEY ? 'set' : '(missing)');

  await testSupabase();
  await testResend();

  console.log('\n=== Summary ===');
  console.log('Supabase:', results.supabase?.ok ? 'PASS' : 'FAIL', results.supabase?.error || '');
  console.log('Resend:', results.resend?.ok ? 'PASS' : 'FAIL', results.resend?.error || '');
  process.exit(results.supabase?.ok ? 0 : 1);
}

main();
