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

/** Demo user matching DEMO_AGENCY for localStorage injection (VITE_DEMO_BYPASS) */
const DEMO_USER = {
  id: 'e2e-demo-user',
  email: LOGIN.email,
  full_name: 'Demo User',
  role: 'owner' as const,
  agency_id: 'ima-productions-id',
  permissions: { finance: true, users: true, integrations: true, events_create: true, events_delete: true },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  onboarded: true,
};

/**
 * Login via localStorage injection. Use when LoginPage has no demo form (Google-only).
 * Requires VITE_DEMO_BYPASS=true (e2e server).
 */
export async function loginDemo(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  const formVisible = await page.getByLabel(/מזהה חברה|Company ID/i).isVisible().catch(() => false);
  if (formVisible) {
    await page.getByLabel(/מזהה חברה|Company ID/i).fill(LOGIN.companyId);
    await page.getByLabel(/דוא|email|אימייל/i).fill(LOGIN.email);
    await page.getByLabel(/סיסמה|password/i).fill(LOGIN.password);
    await page.locator('button[type="submit"]').click();
  } else {
    await page.evaluate((user) => {
      localStorage.setItem('demo_authenticated', 'true');
      localStorage.setItem('demo_user', JSON.stringify(user));
      localStorage.setItem('ima:last_company_id', 'IMA001');
    }, DEMO_USER);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  }
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
