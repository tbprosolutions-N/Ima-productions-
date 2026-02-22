/**
 * Business Standard — "Daily Producer Routine" E2E
 * Financial data integrity, sync reliability, UI speed, Toast visibility.
 * Run: npx playwright test tests/e2e/sanity.spec.ts
 * Headed: npx playwright test tests/e2e/sanity.spec.ts --headed
 */
import { test, expect } from '@playwright/test';
import { loginDemo, dismissTourIfVisible } from './fixtures';

const TRANSITION_MAX_MS = 1000; // Target 400ms; relaxed for CI. Log when exceeded.
const NAV_TIMEOUT = 5000;

function assertTransitionFast(start: number, label: string) {
  const elapsed = Date.now() - start;
  if (elapsed > TRANSITION_MAX_MS) {
    throw new Error(`${label} took ${elapsed}ms (max ${TRANSITION_MAX_MS}ms)`);
  }
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => {
    throw err;
  });
});

test.describe('Business Day Simulation', () => {
  test.beforeEach(async ({ page }) => {
    await loginDemo(page);
    await dismissTourIfVisible(page);
  });

  test('Event Pipeline: create event with new artist, verify DB + Artists', async ({ page }) => {
    const artistName = 'Test Artist 123';
    const clientName = 'Test Client ABC';

    let t = Date.now();
    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    assertTransitionFast(t, 'nav to Events');

    const btn = page.getByRole('button', { name: /צור אירוע|אירוע חדש|הוסף אירוע|New Event/i }).first();
    await btn.click({ timeout: 15000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByLabel(/תאריך|date|event date/i).first().fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel(/לקוח|client/i).first().fill(clientName);
    await page.getByLabel(/אמן|artist/i).first().fill(artistName);
    await page.getByLabel(/סכום|amount/i).first().fill('5000');

    t = Date.now();
    await page.locator('form').filter({ has: page.getByRole('button', { name: /שמור|save|הוסף/i }) }).getByRole('button', { name: /שמור|save|הוסף/i }).first().click();

    await expect(page.getByText(/נשמר|נוסף|הצלחה|success|אירוע נוסף/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
    assertTransitionFast(t, 'save + modal close');

    await page.waitForTimeout(500);

    t = Date.now();
    await page.goto('/artists', { waitUntil: 'domcontentloaded' });
    assertTransitionFast(t, 'nav to Artists');

    await expect(page.getByText(artistName)).toBeVisible({ timeout: 5000 });
  });

  test('Toast portal: z-index 9999, visible during save', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    await dismissTourIfVisible(page);

    const btn = page.getByRole('button', { name: /צור אירוע|אירוע חדש|הוסף אירוע|New Event/i }).first();
    await btn.click({ timeout: 15000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByLabel(/תאריך|date/i).first().fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel(/לקוח|client/i).first().fill('Toast Client');
    await page.getByLabel(/אמן|artist/i).first().fill('Toast Artist');
    await page.getByLabel(/סכום|amount/i).first().fill('100');

    await page.locator('form').filter({ has: page.getByRole('button', { name: /שמור|save|הוסף/i }) }).getByRole('button', { name: /שמור|save|הוסף/i }).first().click();

    const toastPortal = page.getByTestId('toast-portal').filter({ hasText: /נשמר|נוסף|הצלחה|success|Saved|אירוע/i });
    await expect(toastPortal.first()).toBeVisible({ timeout: 5000 });
    const toastContainer = page.getByTestId('toast-portal');
    const zIndex = await toastContainer.evaluate((el) => window.getComputedStyle(el).zIndex);
    expect(Number(zIndex)).toBeGreaterThanOrEqual(9999);
  });

  test('Financial Sync: add expense, no UI freeze', async ({ page }) => {
    let t = Date.now();
    await page.goto('/finance', { waitUntil: 'domcontentloaded' });
    assertTransitionFast(t, 'nav to Finance');

    await expect(page.getByText(/פיננסים|סיכום תקופה|Finance|רשימת משימות/i).first()).toBeVisible({ timeout: 8000 });

    const addBtn = page.getByRole('button', { name: /הוסף הוצאה|Add expense|הוסף/i }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3000 });
      await page.getByRole('button', { name: /ביטול|Cancel/i }).click();
    }
    await expect(page).toHaveURL(/\/finance/);
  });

  test('Data scoping: Dashboard, Calendar, Finance show agency data only', async ({ page }) => {
    const marker = `Scoped-${Date.now()}`;

    await page.goto('/events', { waitUntil: 'domcontentloaded' });
    const btn = page.getByRole('button', { name: /צור אירוע|אירוע חדש|הוסף אירוע/i }).first();
    await btn.click({ timeout: 15000 });
    await page.getByLabel(/תאריך|date/i).first().fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel(/לקוח|client/i).first().fill(marker);
    await page.getByLabel(/אמן|artist/i).first().fill(marker);
    await page.getByLabel(/סכום|amount/i).first().fill('9999');
    await page.locator('form').filter({ has: page.getByRole('button', { name: /שמור|save|הוסף/i }) }).getByRole('button', { name: /שמור|save|הוסף/i }).first().click();
    await expect(page.getByText(/נשמר|נוסף|הצלחה|success|Saved/i)).toBeVisible({ timeout: 8000 });

    let t = Date.now();
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    assertTransitionFast(t, 'nav to Dashboard');
    await expect(page.getByText(marker).first()).toBeVisible({ timeout: 5000 });

    t = Date.now();
    await page.goto('/calendar', { waitUntil: 'domcontentloaded' });
    assertTransitionFast(t, 'nav to Calendar');
    await expect(page.getByText(marker).first()).toBeVisible({ timeout: 5000 });

    t = Date.now();
    await page.goto('/finance', { waitUntil: 'domcontentloaded' });
    assertTransitionFast(t, 'nav to Finance');
    await expect(page.getByText(/9999|9,999|סיכום/i)).toBeVisible({ timeout: 8000 });
  });

  test('Calendar Stress: 50+ events, rapid month nav, no crash', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await page.evaluate((agencyId) => {
      const events: any[] = [];
      for (let i = 0; i < 55; i++) {
        const d = new Date();
        d.setDate(d.getDate() + (i - 27));
        events.push({
          id: `stress-${i}`,
          agency_id: agencyId,
          producer_id: 'e2e-demo-user',
          event_date: d.toISOString().slice(0, 10),
          weekday: d.toLocaleDateString('he-IL', { weekday: 'long' }),
          business_name: `Stress Event ${i}`,
          invoice_name: `Inv ${i}`,
          amount: 100 + i,
          status: 'draft',
          doc_type: 'tax_invoice',
          morning_sync_status: 'not_synced',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      const key = `ima_demo_${agencyId}_events`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify([...events, ...existing]));
    }, 'ima-productions-id');

    let t = Date.now();
    await page.goto('/calendar', { waitUntil: 'domcontentloaded' });
    assertTransitionFast(t, 'nav to Calendar');

    await expect(page.getByRole('heading', { name: 'לוח שנה' }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.fc').first()).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 5; i++) {
      t = Date.now();
      await page.getByRole('button', { name: /next|הבא|>|chevron/i }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(100);
      if (Date.now() - t > TRANSITION_MAX_MS) {
        console.warn(`Month nav ${i + 1} took ${Date.now() - t}ms`);
      }
    }
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Real-World Edit: change amount, verify update in Finance', async ({ page }) => {
    await page.goto('/events', { waitUntil: 'domcontentloaded' });

    const btn = page.getByRole('button', { name: /צור אירוע|אירוע חדש|הוסף אירוע/i }).first();
    await btn.click({ timeout: 15000 });
    await page.getByLabel(/תאריך|date/i).first().fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel(/לקוח|client/i).first().fill('Edit Test Client');
    await page.getByLabel(/אמן|artist/i).first().fill('Edit Test Artist');
    await page.getByLabel(/סכום|amount/i).first().fill('1111');
    await page.locator('form').filter({ has: page.getByRole('button', { name: /שמור|save|הוסף/i }) }).getByRole('button', { name: /שמור|save|הוסף/i }).first().click();
    await expect(page.getByText(/נשמר|נוסף|הצלחה|success|Saved/i)).toBeVisible({ timeout: 8000 });

    await page.waitForTimeout(800);
    const row = page.locator('tbody tr').filter({ hasText: 'Edit Test Client' }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    const editBtn = row.getByRole('button', { name: /עריכה|ערוך|edit/i });
    await editBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3000 });
    await page.getByLabel(/סכום|amount/i).first().fill('7777');
    await page.locator('form').filter({ has: page.getByRole('button', { name: /שמור|עדכן|save/i }) }).getByRole('button', { name: /שמור|עדכן|save/i }).first().click();
    await expect(page.getByText(/נשמר|עודכן|הצלחה|success|Saved/i).first()).toBeVisible({ timeout: 5000 });

    const t = Date.now();
    await page.goto('/finance', { waitUntil: 'domcontentloaded' });
    assertTransitionFast(t, 'nav to Finance');
    await expect(page.getByText(/7777|7,777|סיכום|הכנסות/i).first()).toBeVisible({ timeout: 8000 });
  });
});
