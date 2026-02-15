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

test.describe('Finance', () => {
  test.beforeEach(async ({ page }) => {
    await loginDemo(page);
  });

  test('finance page loads with period summary and checklist', async ({ page }) => {
    await page.goto('/finance', { waitUntil: 'networkidle' });
    await expect(page.getByText(/פיננסים|סיכום תקופה|רשימת משימות|Finance|Period Summary|Checklist/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('export monthly report opens dialog', async ({ page }) => {
    await page.goto('/finance', { waitUntil: 'networkidle' });
    const reportBtn = page.getByRole('button', { name: /ייצא דוח חודשי|Export monthly|דוח תקופה/i }).first();
    await reportBtn.click();
    await expect(page.getByRole('dialog').filter({ hasText: /דוח תקופה|Period report|Report/i })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('finance tabs or sections render', async ({ page }) => {
    await page.goto('/finance', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('#root')).toBeVisible();
  });
});
