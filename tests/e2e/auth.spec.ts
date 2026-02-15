import { test, expect } from '@playwright/test';
import { loginDemo, LOGIN } from './fixtures';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => {
    throw err;
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') throw new Error(`Console error: ${msg.text()}`);
  });
});

test.describe('Auth flow', () => {
  test('unauthenticated user redirects to /login', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });

  test('login with demo credentials reaches dashboard', async ({ page }) => {
    await loginDemo(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('login form validates required fields', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('protected route redirects to login then works after login', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
    await loginDemo(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/events/);
  });

  test('unknown route redirects to dashboard when authenticated', async ({ page }) => {
    await loginDemo(page);
    await page.goto('/nonexistent-page', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    await loginDemo(page);
    await expect(page).toHaveURL(/\/dashboard/);
    const logoutBtn = page.getByRole('button', { name: /יציאה|Logout/i });
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });
});
