#!/usr/bin/env node
/**
 * Log in with email/password and show we reached the dashboard.
 * Usage: node scripts/show-login-success.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
try {
  const env = readFileSync(join(root, '.env'), 'utf8');
  env.split('\n').forEach((line) => {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      const eq = t.indexOf('=');
      if (eq > 0) {
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  });
} catch (_) {}

const BASE = process.env.LOGIN_DIAG_BASE || 'http://localhost:5173';
const EMAIL = process.env.LOGIN_EMAIL || 'modu.general@gmail.com';
const PASSWORD = process.env.LOGIN_PASSWORD || 'NpcAm2026!';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('1. Opening login page...');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);

  console.log('2. Filling email and password...');
  await page.getByLabel(/דוא״ל|אימייל|email/i).fill(EMAIL);
  await page.getByLabel(/סיסמה|password/i).fill(PASSWORD);

  console.log('3. Clicking sign in...');
  await page.getByRole('button', { name: /כניסה עם דוא״ל וסיסמה/i }).click();

  console.log('4. Waiting for navigation (up to 12s)...');
  await page.waitForTimeout(12000);

  const url = page.url();
  const onDashboard = url.includes('/dashboard');

  if (onDashboard) {
    console.log('\n✅ SUCCESS — Reached dashboard:', url);
    await page.waitForTimeout(2000);
    const title = await page.title();
    const heading = await page.getByRole('heading').first().textContent().catch(() => '');
    console.log('   Page title:', title);
    console.log('   Heading:', heading?.trim().slice(0, 60) || '(none)');
    await page.screenshot({ path: join(root, 'login-success-dashboard.png'), fullPage: false });
    console.log('   Screenshot saved: login-success-dashboard.png');
  } else {
    console.log('\n❌ Still on:', url);
    const redBox = await page.locator('.bg-red-50, [class*="red-50"]').first().textContent().catch(() => '');
    if (redBox) console.log('   Red error box:', redBox.trim().slice(0, 300));
    await page.screenshot({ path: join(root, 'login-failed.png'), fullPage: true });
    console.log('   Screenshot saved: login-failed.png');
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
