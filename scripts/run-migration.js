#!/usr/bin/env node
/**
 * Run the expense OCR fields migration.
 * - If SUPABASE_ACCESS_TOKEN is set: links project (from .env URL) and runs db push.
 * - Otherwise: copies migration SQL to clipboard (Windows) and prints instructions.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationPath = join(root, 'supabase', 'migrations', '20260203000000_add_expense_ocr_fields.sql');

const sql = readFileSync(migrationPath, 'utf8');

let projectRef = '';
try {
  const envPath = join(root, '.env');
  const env = readFileSync(envPath, 'utf8');
  const m = env.match(/VITE_SUPABASE_URL=https?:\/\/([^.]+)\.supabase\.co/);
  if (m) projectRef = m[1].trim();
} catch {
  // no .env
}

const token = process.env.SUPABASE_ACCESS_TOKEN;

if (token && projectRef) {
  console.log('SUPABASE_ACCESS_TOKEN set — linking and pushing migration...');
  try {
    execSync(`npx supabase link --project-ref ${projectRef}`, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    });
    execSync('npx supabase db push', { cwd: root, stdio: 'inherit', env: process.env });
    console.log('Migration applied successfully.');
    process.exit(0);
  } catch (e) {
    console.error('Push failed:', e.message || e);
    process.exit(1);
  }
}

// No token: copy SQL to clipboard and show instructions
const sqlEditorUrl = projectRef
  ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
  : 'https://supabase.com/dashboard → your project → SQL Editor → New query';

let copied = false;
if (process.platform === 'win32') {
  try {
    const tmp = join(root, '.migration-tmp.sql');
    writeFileSync(tmp, sql, 'utf8');
    const quoted = tmp.replace(/'/g, "''");
    execSync(`Get-Content -Raw -LiteralPath '${quoted}' | Set-Clipboard`, { shell: 'powershell', cwd: root });
    unlinkSync(tmp);
    copied = true;
  } catch {
    // ignore
  }
} else {
  try {
    execSync('pbcopy', { input: sql, encoding: 'utf8', cwd: root });
    copied = true;
  } catch {
    // ignore
  }
}

if (copied) console.log('Migration SQL copied to clipboard.');
else console.log('Could not copy to clipboard. Use the SQL below.');

console.log('\n--- Run this migration in Supabase SQL Editor ---');
console.log('1. Open:', sqlEditorUrl);
console.log('2. Paste (Ctrl+V) and click Run.\n');
console.log('--- SQL (paste if clipboard failed) ---\n');
console.log(sql);
