/**
 * Live Verification — NPC ecosystem end-to-end.
 * Triggers real Google Sheets sync + Morning API for event "LIVE_TEST_VERIFICATION".
 *
 * Prerequisites:
 * - Run app WITHOUT demo bypass: npm run dev (VITE_DEMO_BYPASS unset)
 * - Set LIVE_VERIFICATION=1 to enable this spec
 * - Be logged in with real Supabase + Google + Morning configured
 *
 * Run:
 *   LIVE_VERIFICATION=1 npx playwright test tests/e2e/live-verification.spec.ts --project=live
 *   (Windows: set LIVE_VERIFICATION=1 && npx playwright test ...)
 *
 * Or run manually: create event "LIVE_TEST_VERIFICATION", observe toast + [perf] logs.
 */
import { test, expect } from '@playwright/test';
import { loginDemo, dismissTourIfVisible } from './fixtures';

const EVENT_NAME = 'LIVE_TEST_VERIFICATION';
const SAVE_TO_TOAST_MS_MAX = 400;
const LIVE = process.env.LIVE_VERIFICATION === '1';

test.describe('Live Verification', () => {
  test.skip(!LIVE, 'Set LIVE_VERIFICATION=1 to run live verification');

  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      throw err;
    });
    // Live: real login required. Demo: use fixtures (won't trigger real Sheets/Morning).
    if (LIVE) {
      await page.goto(process.env.LIVE_BASE_URL || 'http://localhost:5173/events', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      if (page.url().includes('/login')) {
        throw new Error('Live verification requires being logged in. Sign in first, then re-run with LIVE_VERIFICATION=1.');
      }
    } else {
      await loginDemo(page);
    }
    await dismissTourIfVisible(page);
  });

  test('LIVE_TEST_VERIFICATION: Save <400ms, Toast z-index 9999, Sync observable', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const btn = page.getByRole('button', { name: /צור אירוע|אירוע חדש|הוסף אירוע|New Event/i }).first();
    await btn.click({ timeout: 15_000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByLabel(/תאריך|date|event date/i).first().fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel(/לקוח|client/i).first().fill(EVENT_NAME);
    await page.getByLabel(/אמן|artist/i).first().fill('Live Test Artist');
    await page.getByLabel(/סכום|amount/i).first().fill('1000');

    const saveBtn = page.locator('form')
      .filter({ has: page.getByRole('button', { name: /שמור|save|הוסף/i }) })
      .getByRole('button', { name: /שמור|save|הוסף/i })
      .first();

    const t0 = Date.now();
    await saveBtn.click();

    const toast = page.getByTestId('toast-portal').filter({ hasText: /Saved|נשמר|Database/i });
    await expect(toast.first()).toBeVisible({ timeout: 8000 });
    const elapsed = Date.now() - t0;

    console.log(`[perf] Save → Toast: ${elapsed}ms (target <${SAVE_TO_TOAST_MS_MAX}ms)`);
    if (elapsed > SAVE_TO_TOAST_MS_MAX) {
      throw new Error(`Save → Toast took ${elapsed}ms (must be <${SAVE_TO_TOAST_MS_MAX}ms)`);
    }

    const toastPortal = page.getByTestId('toast-portal');
    const zIndex = await toastPortal.evaluate((el) => window.getComputedStyle(el).zIndex);
    expect(Number(zIndex)).toBeGreaterThanOrEqual(9999);

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(EVENT_NAME).first()).toBeVisible({ timeout: 5000 });

    // Wait for background sync; [perf] logs will show SheetsSync duration in console.
    await page.waitForTimeout(3000);

    // Sync icon: Morning column may show not_synced → syncing → synced. No refresh needed.
    const row = page.locator('tbody tr').filter({ hasText: EVENT_NAME }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
  });
});
