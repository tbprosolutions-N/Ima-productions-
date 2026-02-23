#!/usr/bin/env node
/**
 * verify-sync-integrity
 * DEPRECATED: sync_queue table was removed. Backup is now on-demand via
 * Settings → Backup → Export to Sheets (export-to-sheets Edge Function).
 *
 * Usage: node scripts/verify-sync-integrity.mjs
 */

async function main() {
  console.log('sync_queue was removed. Backup is now on-demand via Settings → Backup → Export to Sheets.');
  console.log('No verification run.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
