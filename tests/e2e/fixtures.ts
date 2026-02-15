/**
 * Shared fixtures and helpers for E2E tests.
 * Uses demo bypass (VITE_DEMO_BYPASS=true) so tests run without Supabase.
 */

import { Page } from '@playwright/test';

export const LOGIN = {
  companyId: 'IMA001',
  email: 'modu.general@gmail.com',
  password: 'demo',
};

/** Demo credentials that trigger demo bypass in dev (NPC001 or IMA001) */
export const DEMO_CREDENTIALS = [
  { companyId: 'IMA001', email: 'modu.general@gmail.com', password: 'demo' },
  { companyId: 'NPC001', email: 'modu.general@gmail.com', password: 'demo' },
];

export async function loginDemo(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/מזהה חברה/i).fill(LOGIN.companyId);
  await page.getByLabel(/דוא/i).fill(LOGIN.email);
  await page.getByLabel(/סיסמה/i).fill(LOGIN.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

export async function dismissTourIfVisible(page: Page) {
  const skipBtn = page.getByRole('button', { name: 'דלג' });
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
  }
}

export const CORE_ROUTES = [
  '/dashboard',
  '/events',
  '/artists',
  '/clients',
  '/finance',
  '/calendar',
  '/documents',
  '/settings',
  '/health',
] as const;
