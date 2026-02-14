#!/usr/bin/env node
/**
 * Copy the login-fix migration SQL to the clipboard and open Supabase SQL Editor.
 * Run: node scripts/open-sql-editor-with-migration.js
 * Then in the opened tab: Ctrl+V to paste, click Run.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationPath = join(root, 'supabase', 'migrations', '20260204000000_fix_handle_new_user_agency.sql');
const sql = readFileSync(migrationPath, 'utf8');

let projectRef = '';
try {
  const env = readFileSync(join(root, '.env'), 'utf8');
  const m = env.match(/VITE_SUPABASE_URL=https?:\/\/([^.]+)\.supabase\.co/);
  if (m) projectRef = m[1].trim();
} catch {}

if (!projectRef) {
  console.error('Could not read project ref from .env (VITE_SUPABASE_URL).');
  process.exit(1);
}

const sqlEditorUrl = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;
const tempFile = join(tmpdir(), `supabase-login-fix-${projectRef}.sql`);
writeFileSync(tempFile, sql, 'utf8');

// Windows: cmd /c clip (reads stdin) and start for URL
const isWin = process.platform === 'win32';
if (isWin) {
  const clip = spawnSync('cmd', ['/c', 'clip'], { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
  const start = spawnSync('cmd', ['/c', 'start', '', sqlEditorUrl], { stdio: 'inherit' });
  if (clip.status !== 0) {
    console.error('Clipboard copy failed. Copy the SQL manually from:', migrationPath);
  }
  if (start.status !== 0) {
    console.error('Open this URL in your browser:', sqlEditorUrl);
  }
} else {
  const clip = spawnSync('clip', [], { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });
  const open = spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [sqlEditorUrl], { stdio: 'inherit' });
  if (clip.status !== 0) console.error('Copy SQL from:', migrationPath);
  if (open.status !== 0) console.error('Open:', sqlEditorUrl);
}

try { unlinkSync(tempFile); } catch {}

console.log('SQL is in your clipboard and the Supabase SQL Editor should have opened.');
console.log('Paste (Ctrl+V) and click Run, then try "Send magic link" again on the login page.');
