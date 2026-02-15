/**
 * Smoke test: quick traverse of core flows.
 * Uses shared fixtures; runs as part of deep QA suite.
 */
import { test, expect } from '@playwright/test';
import { loginDemo, dismissTourIfVisible } from './fixtures';

test.beforeEach(async ({ page }) => {
  // Fail fast on console errors (common cause of “buttons don’t work”).
  page.on('pageerror', (err) => {
    throw err;
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') throw new Error(`Console error: ${msg.text()}`);
  });
});

test('login (demo bypass) reaches dashboard', async ({ page }) => {
  await loginDemo(page);
  await expect(page).toHaveURL(/\/dashboard/);
});

test('traverse core routes without crash', async ({ page }) => {
  await loginDemo(page);

  const routes = ['/dashboard', '/events', '/artists', '/clients', '/finance', '/calendar', '/documents', '/settings', '/health'];

  for (const r of routes) {
    await page.goto(r, { waitUntil: 'domcontentloaded' });
    // Generic “app is alive” assertions:
    await expect(page.locator('body')).toBeVisible();
    // Avoid blank screen
    await expect(page.locator('#root')).toBeVisible();
  }
});

test('events: open and close new event dialog', async ({ page }) => {
  await loginDemo(page);
  await page.goto('/events', { waitUntil: 'networkidle' });
  const skipBtn = page.getByRole('button', { name: 'דלג' });
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
  }
  const btn = page.getByRole('button', { name: /צור אירוע|אירוע חדש|הוסף אירוע/i }).first();
  await btn.click({ timeout: 15000 });
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: /ביטול/i }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('finance: period summary and checklist', async ({ page }) => {
  await loginDemo(page);
  await page.goto('/finance', { waitUntil: 'networkidle' });
  await expect(page.getByText(/פיננסים|סיכום תקופה|רשימת משימות/i).first()).toBeVisible({ timeout: 8000 });
  const reportBtn = page.getByRole('button', { name: /ייצא דוח חודשי/i }).first();
  await reportBtn.click();
  await expect(page.getByRole('dialog').filter({ hasText: /דוח תקופה/i })).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
});

test('events page and settings load', async ({ page }) => {
  await loginDemo(page);
  await page.goto('/events', { waitUntil: 'networkidle' });
  await expect(page.getByText(/אירועים|טבלת/i).first()).toBeVisible({ timeout: 8000 });
  await page.goto('/settings', { waitUntil: 'networkidle' });
  await expect(page.getByText(/הגדרות|מיתוג/i).first()).toBeVisible({ timeout: 5000 });
});
