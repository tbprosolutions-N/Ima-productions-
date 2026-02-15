import { test, expect } from '@playwright/test';
import { loginDemo } from './fixtures';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => {
    throw err;
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') throw new Error(`Console error: ${msg.text()}`);
  });
});

test.describe('Accessibility - login (unauthenticated)', () => {
  test('login form has accessible labels', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const companyLabel = page.getByLabel(/מזהה חברה|Company ID/i);
    await expect(companyLabel).toBeVisible();
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginDemo(page);
  });

  test('main content has landmark structure', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const nav = page.locator('nav');
    const main = page.locator('main');
    await expect(nav).toBeVisible();
    await expect(main).toBeVisible();
  });

  test('focusable elements are keyboard reachable', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const firstLink = page.getByRole('link').first();
    await firstLink.focus();
    const isFocused = await firstLink.evaluate((el) => document.activeElement === el);
    expect(isFocused).toBeTruthy();
  });

  test('dialogs are keyboard dismissible', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'networkidle' });
    const addBtn = page.getByRole('button', { name: /צור אירוע|אירוע חדש|הוסף אירוע|New Event/i }).first();
    await addBtn.click({ timeout: 15000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('page has valid title', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
