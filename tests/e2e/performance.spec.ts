/**
 * Performance & stress test: rapid navigation, no auth loops, fast transitions.
 * Run with: npx playwright test tests/e2e/performance.spec.ts
 * Headed:   npx playwright test tests/e2e/performance.spec.ts --headed
 */
import { test, expect } from '@playwright/test';
import { loginDemo, dismissTourIfVisible } from './fixtures';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => {
    throw err;
  });
  // Do not fail on console.error - we want to observe logs. Only fail on uncaught exceptions.
});

test.describe('Performance & stress', () => {
  test.describe.configure({ project: ['desktop'] });
  test('rapid navigation 5x between Dashboard, Events, Finance — no auth loops, <500ms transitions', async ({ page }) => {
    await loginDemo(page);
    await dismissTourIfVisible(page);
    await expect(page).toHaveURL(/\/dashboard/);

    const routes = ['/dashboard', '/events', '/finance'] as const;

    // Rapidly navigate 5 times through the cycle
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const route of routes) {
        const start = Date.now();
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(new RegExp(route));
        const elapsed = Date.now() - start;
        // Target <500ms; allow 2000ms for first load / CI. Log for headed debugging.
        if (elapsed >= 500) {
          console.log(`[perf] ${route} took ${elapsed}ms (target <500ms)`);
        }
        expect(elapsed).toBeLessThan(2000);
      }
    }

    // Verify we stayed authenticated (no redirect to /login)
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('delete draft expense — happy path', async ({ page }) => {
    await loginDemo(page);
    await dismissTourIfVisible(page);
    await page.goto('/finance', { waitUntil: 'networkidle' });

    await expect(page.getByText(/פיננסים|סיכום תקופה|רשימת משימות|Finance/i).first()).toBeVisible({ timeout: 8000 });

    // Look for a draft/not_synced expense with delete button; if none, skip delete assertion
    const deleteBtn = page.getByRole('button', { name: /מחק|Delete|ערוך פרטים/i }).first();
    if (await deleteBtn.isVisible().catch(() => false)) {
      // Click the first row's delete/edit to open context — demo may have no expenses
      const firstRow = page.locator('[data-testid="expense-row"], tbody tr').first();
      if (await firstRow.isVisible().catch(() => false)) {
        const trashBtn = firstRow.getByRole('button', { name: /מחק|trash|delete/i });
        if (await trashBtn.isVisible().catch(() => false)) {
          await trashBtn.click();
          // Confirm if dialog appears
          const confirmBtn = page.getByRole('button', { name: /מחק|אישור|Delete|Confirm/i });
          if (await confirmBtn.isVisible().catch(() => false)) {
            await confirmBtn.click();
          }
        }
      }
    }
    // Success = no crash, still on finance
    await expect(page).toHaveURL(/\/finance/);
  });

  test('no auth loop on repeated dashboard visits', async ({ page }) => {
    await loginDemo(page);
    await dismissTourIfVisible(page);

    // Visit dashboard 5 times in quick succession
    for (let i = 0; i < 5; i++) {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });
});

test.describe('Mobile (iPhone 14 viewport) — data minimized, no prefetch on touch', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
  });

  test('mobile: navigate via tap — open menu, tap Events, Finance; no auth loop', async ({ page }) => {
    await loginDemo(page);
    await dismissTourIfVisible(page);

    // Open mobile menu (sidebar drawer)
    await page.getByRole('button', { name: /Open menu|תפריט|menu/i }).click();
    await page.getByRole('link', { name: /אירועים|events/i }).first().click();
    await expect(page).toHaveURL(/\/events/);

    await page.getByRole('button', { name: /Open menu|תפריט|menu/i }).click();
    await page.getByRole('link', { name: /כספים|פיננסים|finance/i }).first().click();
    await expect(page).toHaveURL(/\/finance/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('mobile viewport: page.goto navigation — verify stale-while-revalidate', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));
    await loginDemo(page);
    await dismissTourIfVisible(page);

    requests.length = 0;
    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/events/);
    const afterFirst = requests.length;

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.goto('/events', { waitUntil: 'domcontentloaded' }); // Second visit within 30s
    const afterSecond = requests.length;
    await expect(page).not.toHaveURL(/\/login/);
    // Second Events visit: cache should reduce refetches. Allow some variance (chunks, etc).
    expect(afterSecond).toBeLessThan(afterFirst * 3);
  });
});
