/**
 * Deep login flow tests: login page, callback page, auth loop prevention, demo consistency.
 * Runs with VITE_DEMO_BYPASS=true (e2e server) so Supabase is not required.
 */
import { test, expect } from '@playwright/test';
import { loginDemo } from './fixtures';

test.describe('Deep login', () => {
  test('login page loads with Google CTA and redirect URL hint', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
    // Google sign-in button (or demo form when bypass shows company/email/password)
    const googleBtn = page.getByRole('button', { name: /התחברות באמצעות Google|Google/i });
    const demoForm = page.getByLabel(/מזהה חברה|Company ID/i);
    await expect(googleBtn.or(demoForm)).toBeVisible({ timeout: 5000 });
    // Redirect URL hint for production debugging (may be 2 code blocks; at least one visible)
    await expect(page.locator('code').filter({ hasText: /auth\/callback|npc-am/ }).first()).toBeVisible({ timeout: 3000 });
  });

  test('unauthenticated /auth/callback shows connecting state then timeout or stays', async ({ page }) => {
    await page.goto('/auth/callback', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await expect(page).toHaveURL(/\/auth\/callback/);
    // Should show "מתחבר" (connecting) or error if URL had ?error=
    await expect(
      page.getByText(/מתחבר|connecting|השלמת ההתחברות/i)
    ).toBeVisible({ timeout: 5000 });
    // After a short wait, we're either still on callback or redirected to login (timeout)
    await page.waitForTimeout(3000);
    const url = page.url();
    const stillCallback = url.includes('/auth/callback');
    const wentToLogin = url.includes('/login');
    expect(stillCallback || wentToLogin).toBe(true);
  });

  test('callback with ?error= shows error UI and back-to-login', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_description=User+cancelled', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/auth\/callback/);
    await expect(page.getByRole('heading', { name: 'שגיאה בהתחברות' })).toBeVisible({ timeout: 5000 });
    const backBtn = page.getByRole('button', { name: /חזרה לדף הכניסה|back to login/i });
    await expect(backBtn).toBeVisible({ timeout: 3000 });
    await backBtn.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('demo login reaches dashboard and no auth loop on repeated visits', async ({ page }) => {
    await loginDemo(page);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    // Visit dashboard again — must not redirect to login
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/dashboard/);
    // Visit events then back to dashboard
    await page.goto('/events', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    await expect(page).toHaveURL(/\/events/);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('after demo login, visiting /auth/callback without code does not break session', async ({ page }) => {
    await loginDemo(page);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await page.goto('/auth/callback', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    // With demo user already set, callback may redirect to dashboard or stay on callback briefly then redirect
    await page.waitForTimeout(4000);
    const url = page.url();
    const onDashboard = url.includes('/dashboard');
    const onCallback = url.includes('/auth/callback');
    const onLogin = url.includes('/login');
    expect(onLogin).toBe(false);
    expect(onDashboard || onCallback).toBe(true);
  });

  test('logout from dashboard returns to login and protected route redirects', async ({ page }) => {
    await loginDemo(page);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    const logoutBtn = page.getByRole('button', { name: /יציאה|Logout/i });
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('no console errors during login page load and demo login', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(1000);
    await loginDemo(page);
    await page.waitForTimeout(2000);
    // Filter out known benign errors (e.g. ResizeObserver in dev)
    const critical = errors.filter(
      (t) =>
        !t.includes('ResizeObserver') &&
        !t.includes('favicon') &&
        !t.includes('404')
    );
    expect(critical.length).toBe(0);
  });
});
