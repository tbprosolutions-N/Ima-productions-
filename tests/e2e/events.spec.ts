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

test.describe('Events', () => {
  test.beforeEach(async ({ page }) => {
    await loginDemo(page);
  });

  test('events page loads and shows table or empty state', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });
    await dismissTourIfVisible(page);
    await expect(page.getByText(/אירועים|טבלת|Events/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('open and close new event dialog', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });
    await dismissTourIfVisible(page);
    const btn = page.getByRole('button', { name: /צור אירוע|אירוע חדש|הוסף אירוע|New Event/i }).first();
    await btn.click({ timeout: 15000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /ביטול|Cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('event dialog has required form fields', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });
    await dismissTourIfVisible(page);
    const btn = page.getByRole('button', { name: /צור אירוע|אירוע חדש|הוסף אירוע|New Event/i }).first();
    await btn.click({ timeout: 15000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/תאריך|date|event date/i).first()).toBeVisible();
    await page.getByRole('button', { name: /ביטול|Cancel/i }).click();
  });

  test('events page search/filter input exists', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });
    await dismissTourIfVisible(page);
    const searchInput = page.getByPlaceholder(/חפש|Search/i).or(page.locator('input[type="search"]')).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });
});
