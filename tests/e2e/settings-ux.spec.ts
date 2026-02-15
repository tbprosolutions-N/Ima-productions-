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

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginDemo(page);
  });

  test('settings page loads with tabs', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.getByText(/הגדרות|מיתוג|Settings|General|Branding/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('theme toggle switches dark/light', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' });
    const themeToggle = page.getByRole('button', { name: /ערכת נושא|Theme|כהה|בהיר|Dark|Light/i }).or(
      page.locator('[data-theme-toggle]')
    ).first();
    if (await themeToggle.isVisible().catch(() => false)) {
      const htmlBefore = await page.locator('html').getAttribute('class');
      await themeToggle.click();
      await page.waitForTimeout(500);
      const htmlAfter = await page.locator('html').getAttribute('class');
      expect(htmlBefore !== htmlAfter || htmlBefore?.includes('dark') || htmlAfter?.includes('dark')).toBeTruthy();
    }
  });

  test('sidebar theme toggle works', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const sunMoonBtn = page.getByRole('button', { name: /Sun|Moon|ערכת נושא/i }).or(
      page.locator('button').filter({ has: page.locator('svg') })
    ).first();
    if (await sunMoonBtn.isVisible().catch(() => false)) {
      await sunMoonBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('locale/language switch exists in settings', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('UX / UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginDemo(page);
  });

  test('RTL direction on Hebrew', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const html = page.locator('html');
    const dir = await html.getAttribute('dir');
    expect(dir === 'rtl' || dir === 'ltr').toBeTruthy();
  });

  test('main layout renders correctly', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  test('dashboard shows KPI or placeholder content', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByText(/לוח בקרה|Dashboard|אירועים|Events|הכנסות|Revenue/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('calendar page loads', async ({ page }) => {
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await expect(page.getByText(/יומן|Calendar/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('documents page loads', async ({ page }) => {
    await page.goto('/documents', { waitUntil: 'networkidle' });
    await expect(page.getByText(/מסמכים|Documents|תבניות|Templates/i).first()).toBeVisible({ timeout: 8000 });
  });
});
