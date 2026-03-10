#!/usr/bin/env node
/**
 * Login diagnostic: run app, hit login + callback, verify DB.
 * Usage: node scripts/login-diagnostic.mjs
 * Requires: .env with VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional for DB check)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load .env
try {
  const envPath = join(root, '.env');
  const env = readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      const eq = t.indexOf('=');
      if (eq > 0) {
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (_) {}

const BASE = process.env.LOGIN_DIAG_BASE || 'http://localhost:5173';

async function main() {
  console.log('\n=== Login diagnostic (base:', BASE, ')===\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1) Login page
  try {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log('1. Login page URL:', url);
    if (!url.includes('/login')) {
      console.log('   -> Redirected to:', url, '(might be already logged in?)');
    }
    const googleBtn = page.getByRole('button', { name: /Google|התחברות באמצעות Google/i });
    const visible = await googleBtn.isVisible().catch(() => false);
    console.log('2. Google button visible:', visible);
    const redirectHint = await page.locator('code').filter({ hasText: /callback/ }).first().isVisible().catch(() => false);
    console.log('3. Redirect URL hint visible:', redirectHint);
  } catch (e) {
    console.log('1. Login page error:', e.message);
  }

  // 2) Click Google and see where we land (will go to Google or popup)
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const googleBtn = page.getByRole('button', { name: /Google|התחברות באמצעות Google/i });
    await googleBtn.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
    const afterUrl = page.url();
    console.log('4. After clicking Google:', afterUrl);
    if (afterUrl.includes('accounts.google.com')) {
      console.log('   -> OAuth redirect OK; login flow starts correctly.');
    } else if (afterUrl.includes('/auth/callback')) {
      console.log('   -> Landed on callback (unexpected without completing Google).');
    } else if (afterUrl.includes('/login')) {
      console.log('   -> Still on login (popup may have been blocked or error).');
    }
  } catch (e) {
    console.log('4. Click Google error:', e.message);
  }

  // 3) Callback with error param
  try {
    await page.goto(BASE + '/auth/callback?error=access_denied&error_description=test', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const errText = await page.getByText(/שגיאה בהתחברות|access_denied/i).first().isVisible().catch(() => false);
    console.log('5. Callback error page shows error text:', errText);
  } catch (e) {
    console.log('5. Callback error page:', e.message);
  }

  // 4) Callback with no code (simulate timeout path)
  try {
    await page.goto(BASE + '/auth/callback', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const connecting = await page.getByText(/מתחבר|connecting/i).isVisible().catch(() => false);
    console.log('6. Callback (no code) shows connecting:', connecting);
  } catch (e) {
    console.log('6. Callback (no code):', e.message);
  }

  // 6b) Email/password form: fill and submit (uses env LOGIN_EMAIL, LOGIN_PASSWORD if set)
  const loginEmail = process.env.LOGIN_EMAIL || '';
  const loginPassword = process.env.LOGIN_PASSWORD || '';
  if (loginEmail && loginPassword) {
    try {
      await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);
      await page.getByLabel(/דוא״ל|email/i).fill(loginEmail);
      await page.getByLabel(/סיסמה|password/i).fill(loginPassword);
      await page.locator('form').filter({ has: page.getByLabel(/סיסמה/) }).getByRole('button', { name: /כניסה עם דוא״ל|submit/i }).click();
      await page.waitForTimeout(5000);
      const url = page.url();
      const onDashboard = url.includes('/dashboard');
      const errMsg = await page.locator('[class*="red"]').filter({ hasText: /דוא|שגיאה|Invalid/i }).first().textContent().catch(() => '');
      console.log('6b. Email/password login → URL:', url);
      console.log('6b. Reached dashboard:', onDashboard);
      if (errMsg) console.log('6b. Error shown:', errMsg.trim().slice(0, 120));
    } catch (e) {
      console.log('6b. Email/password login error:', e.message);
    }
  } else {
    console.log('6b. Skip email/password (set LOGIN_EMAIL and LOGIN_PASSWORD to test)');
  }

  await browser.close();

  // 5) DB check if service role available
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (supabaseUrl && serviceKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data: users } = await admin.from('users').select('id,email,role').limit(5);
      console.log('7. public.users (first 5):', users?.length ?? 0, 'rows');
      if (users?.length) {
        users.forEach((u) => console.log('   -', u.email, u.role));
      }
      const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 5 });
      console.log('8. auth.users (first 5):', authUsers?.users?.length ?? 0, 'rows');
    } catch (e) {
      console.log('7-8. DB check error:', e.message);
    }
  } else {
    console.log('7-8. Skip DB check (no SUPABASE_SERVICE_ROLE_KEY in .env)');
  }

  console.log('\n=== Done ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
