#!/usr/bin/env node
/**
 * Apply the "Database error saving new user" fix migration.
 * Copies migration SQL to clipboard and prints Supabase SQL Editor link.
 * Run the pasted SQL in the dashboard to fix magic-link signup.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationPath = join(root, 'supabase', 'migrations', '20260204000000_fix_handle_new_user_agency.sql');
const sql = readFileSync(migrationPath, 'utf8');

let projectRef = '';
try {
  const envPath = join(root, '.env');
  const env = readFileSync(envPath, 'utf8');
  const m = env.match(/VITE_SUPABASE_URL=https?:\/\/([^.]+)\.supabase\.co/);
  if (m) projectRef = m[1].trim();
} catch {}

const sqlEditorUrl = projectRef
  ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
  : 'https://supabase.com/dashboard';

let copied = false;
if (process.platform === 'win32') {
  try {
    const tmp = join(root, '.migration-login-tmp.sql');
    writeFileSync(tmp, sql, 'utf8');
    const quoted = tmp.replace(/'/g, "''");
    execSync(`Get-Content -Raw -LiteralPath '${quoted}' | Set-Clipboard`, { shell: 'powershell', cwd: root });
    unlinkSync(tmp);
    copied = true;
  } catch {}
}

if (copied) console.log('Login-fix migration SQL copied to clipboard.');
else console.log('Could not copy to clipboard. Use the SQL below.');

console.log('\n1. Open Supabase SQL Editor:', sqlEditorUrl);
console.log('2. Paste (Ctrl+V) and click Run.');
console.log('3. Then try magic link signup again.\n');
if (!copied) {
  console.log('--- SQL ---\n');
  console.log(sql);
}
