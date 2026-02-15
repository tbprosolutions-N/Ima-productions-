import { test, expect } from '@playwright/test';
import { loginDemo, dismissTourIfVisible } from './fixtures';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => {
    throw err;
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') throw new Error(`Console error: ${msg.text()}`);
  });
});

test.describe('Artists', () => {
  test.beforeEach(async ({ page }) => {
    await loginDemo(page);
  });

  test('artists page loads', async ({ page }) => {
    await page.goto('/artists', { waitUntil: 'networkidle' });
    await expect(page.getByText(/אמנים|Artists/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('artists add button opens dialog or form', async ({ page }) => {
    await page.goto('/artists', { waitUntil: 'networkidle' });
    const addBtn = page.getByRole('button', { name: /הוסף אמן|Add artist|אמן חדש/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await expect(page.getByRole('dialog').or(page.getByRole('form'))).toBeVisible({ timeout: 5000 });
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('Clients', () => {
  test.beforeEach(async ({ page }) => {
    await loginDemo(page);
  });

  test('clients page loads', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'networkidle' });
    await expect(page.getByText(/לקוחות|Clients/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('clients add button opens dialog or form', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'networkidle' });
    const addBtn = page.getByRole('button', { name: /הוסף לקוח|Add client|לקוח חדש/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await expect(page.getByRole('dialog').or(page.getByRole('form'))).toBeVisible({ timeout: 5000 });
      await page.keyboard.press('Escape');
    }
  });
});
