import { test, expect } from '@playwright/test';
import { loginDemo, CORE_ROUTES } from './fixtures';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => {
    throw err;
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') throw new Error(`Console error: ${msg.text()}`);
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginDemo(page);
  });

  test('all core routes load without crash', async ({ page }) => {
    for (const route of CORE_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('#root')).toBeVisible();
    }
  });

  test('sidebar links navigate correctly', async ({ page }) => {
    await page.goto('/dashboard');
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();

    await page.getByRole('link', { name: /אירועים|Events/i }).click();
    await expect(page).toHaveURL(/\/events/);

    await page.getByRole('link', { name: /אמנים|Artists/i }).click();
    await expect(page).toHaveURL(/\/artists/);

    await page.getByRole('link', { name: /לקוחות|Clients/i }).click();
    await expect(page).toHaveURL(/\/clients/);

    await page.getByRole('link', { name: /יומן|Calendar/i }).click();
    await expect(page).toHaveURL(/\/calendar/);

    await page.getByRole('link', { name: /מסמכים|Documents/i }).click();
    await expect(page).toHaveURL(/\/documents/);

    await page.getByRole('link', { name: /הגדרות|Settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);

    await page.getByRole('link', { name: /לוח בקרה|Dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('health page loads in dev', async ({ page }) => {
    await page.goto('/health', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('#root')).toBeVisible();
  });
});
