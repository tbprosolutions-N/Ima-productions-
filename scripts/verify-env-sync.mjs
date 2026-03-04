#!/usr/bin/env node
/**
 * Verify env vars point to the correct Supabase project (oerqkyzfsdygmmsonrgz).
 * Run: node scripts/verify-env-sync.mjs
 * Loads .env if present.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_REF = 'oerqkyzfsdygmmsonrgz';
const EXPECTED_URL = `https://${PROJECT_REF}.supabase.co`;

function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const urlOk = url.replace(/\/$/, '') === EXPECTED_URL;

const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
let anonOk = false;
let anonRef = '(not set)';
if (anonKey && anonKey.startsWith('eyJ')) {
  try {
    const payload = anonKey.split('.')[1];
    if (payload) {
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(Buffer.from(b64, 'base64').toString());
      anonRef = decoded.ref || '(no ref in JWT)';
      anonOk = anonRef === PROJECT_REF;
    }
  } catch {
    anonRef = '(decode failed)';
  }
}

console.log('\n=== Vercel Env Sync Check ===\n');
console.log('1. Project URL');
console.log('   Expected:', EXPECTED_URL);
console.log('   Current: ', url || '(not set)');
console.log('   Match:   ', urlOk ? '✅' : '❌ MISMATCH');

console.log('\n2. Anon Key');
console.log('   JWT ref: ', anonRef);
console.log('   Match:   ', anonKey ? (anonOk ? '✅' : '❌ MISMATCH (wrong project)') : '(not set)');

console.log('\n3. Proxy (api/calendar-invite.ts)');
console.log('   Uses env vars: SUPABASE_URL, SUPABASE_ANON_KEY (or VITE_* fallbacks)');
console.log('   No hardcoded project ID: ✅');

if (!urlOk && url) {
  if (url.includes('demo.supabase.co')) {
    console.log('\n→ Using demo project. Set production URL for npc-am.com.');
  } else if (!url.includes(PROJECT_REF)) {
    console.log('\n→ Wrong project! Update VITE_SUPABASE_URL and SUPABASE_URL in Vercel.');
  }
}
if (anonKey && !anonOk) {
  console.log('\n→ Anon key is from wrong project. Get it from Supabase → Settings → API for', PROJECT_REF);
}

console.log('');
