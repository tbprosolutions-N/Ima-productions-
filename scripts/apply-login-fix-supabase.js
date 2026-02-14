#!/usr/bin/env node
/**
 * Apply the "Database error saving new user" fix in Supabase.
 *
 * Option A – Management API (recommended):
 *   1. Create a Personal Access Token: https://supabase.com/dashboard/account/tokens
 *      (scope: database:write or "Run sql query")
 *   2. In .env add: SUPABASE_ACCESS_TOKEN=your_token_here
 *
 * Option B – Direct database:
 *   In .env add your DB URI from Supabase: Project → Settings → Database → Connection string (URI):
 *   DATABASE_URL=postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
 *
 * Then run: node scripts/apply-login-fix-supabase.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationPath = join(root, 'supabase', 'migrations', '20260204000000_fix_handle_new_user_agency.sql');
const sql = readFileSync(migrationPath, 'utf8');

// Load .env into process.env (no dotenv dependency)
let projectRef = '';
try {
  const envPath = join(root, '.env');
  const env = readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
  const m = (process.env.VITE_SUPABASE_URL || '').match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (m) projectRef = m[1].trim();
} catch {
  // no .env
}

const token = process.env.SUPABASE_ACCESS_TOKEN || '';
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || '';

async function applyViaApi() {
  if (!token || !projectRef) return false;
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('API error:', res.status, res.statusText);
    console.error(data?.message || data?.error || JSON.stringify(data));
    process.exit(1);
  }
  if (data?.error) {
    console.error('Query error:', data.error);
    process.exit(1);
  }
  return true;
}

async function applyViaDb() {
  if (!databaseUrl) return false;
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(sql);
    await client.end();
    return true;
  } catch (e) {
    console.error('Database error:', e.message);
    process.exit(1);
  }
}

const didApi = await applyViaApi();
if (didApi) {
  console.log('Login fix applied successfully (Management API).');
  console.log('Try "Send magic link" again on the login page.');
  process.exit(0);
}

const didDb = await applyViaDb();
if (didDb) {
  console.log('Login fix applied successfully (direct database).');
  console.log('Try "Send magic link" again on the login page.');
  process.exit(0);
}

console.error('Missing credentials. Use one of:');
console.error('  A) SUPABASE_ACCESS_TOKEN in .env (from https://supabase.com/dashboard/account/tokens, scope database:write)');
console.error('  B) DATABASE_URL in .env (from Supabase → Settings → Database → Connection string URI)');
console.error('Then run: node scripts/apply-login-fix-supabase.js');
process.exit(1);
