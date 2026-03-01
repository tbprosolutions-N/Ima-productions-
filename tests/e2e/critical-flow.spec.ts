/**
 * 2 critical Playwright tests — UI wired to tested logic.
 * Login Flow: user reaches dashboard.
 * Event Creation: New Event → fill form → event appears in list.
 *
 * Run: npx playwright test tests/e2e/critical-flow.spec.ts
 * Uses demo mode (VITE_DEMO_BYPASS) — no Supabase required.
 */
import { test, expect } from '@playwright/test';
import { loginDemo, dismissTourIfVisible } from './fixtures';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => {
    throw err;
  });
});

test.describe('Critical E2E', () => {
  test('Login Flow: user can reach the dashboard', async ({ page }) => {
    await loginDemo(page);
    await dismissTourIfVisible(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /שלום|Hello/i })).toBeVisible({ timeout: 5000 });
  });

  test('Event Creation: New Event → fill form → event appears in list', async ({ page }) => {
    const uniqueClient = `E2E Client ${Date.now()}`;

    await loginDemo(page);
    await dismissTourIfVisible(page);
    await page.goto('/events', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    // Click New Event
    await page.getByRole('button', { name: /אירוע חדש|צור אירוע|New Event/i }).first().click({ timeout: 10_000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Fill form
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel(/תאריך אירוע|event date/i).first().fill(today);
    await page.getByLabel(/לקוח|client/i).first().fill(uniqueClient);
    await page.getByLabel(/אמן|artist/i).first().fill('E2E Artist');
    await page.getByLabel(/סכום לחברה|amount/i).first().fill('5000');

    // Submit
    await page.getByRole('button', { name: /^הוסף$|^Add$/ }).click();

    // Confirm success and dialog closes
    await expect(page.getByText(/נשמר|נוסף|הצלחה|Saved|אירוע נוסף/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

    // Confirm event appears in list
    const row = page.locator('table tbody tr').filter({ hasText: uniqueClient });
    await expect(row.first()).toBeVisible({ timeout: 5000 });
  });
});
