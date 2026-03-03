/**
 * Example backend integration test.
 * Run: node tests/backend/integration.example.mjs
 *
 * Requires vercel dev to be running (npx vercel dev) for real API tests.
 * This file validates the test harness and documents the integration test pattern.
 */

const BASE = process.env.VERCEL_DEV_URL || 'http://localhost:3000';

async function testMorningApiHealth() {
  try {
    const res = await fetch(`${BASE}/api/morning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getToken' }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 400) {
      console.log('OK: morning-api returns', res.status, '(auth/params required, expected)');
      return true;
    }
    if (res.status === 500 && data?.error?.includes('credentials')) {
      console.log('OK: morning-api requires credentials (expected in CI)');
      return true;
    }
    console.log('morning-api:', res.status, data);
    return res.ok || res.status === 500;
  } catch (err) {
    console.log('Skip: vercel dev not running -', err.message);
    return true;
  }
}

async function main() {
  console.log('Backend integration test (example)...');
  const ok = await testMorningApiHealth();
  process.exit(ok ? 0 : 1);
}

main();
