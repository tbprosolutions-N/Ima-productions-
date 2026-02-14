#!/usr/bin/env node
/**
 * One-time setup for invoice Vision extraction.
 * Run from project root. Requires: Supabase CLI linked, Anthropic API key.
 *
 * Usage:
 *   node scripts/setup-invoice-vision.js
 *   # Or with key in env:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/setup-invoice-vision.js
 *
 * What it does:
 *   1. Sets Supabase secret ANTHROPIC_API_KEY (from env or prompt).
 *   2. Deploys the extract-invoice-vision Edge Function.
 */

import { execSync } from 'child_process';
import readline from 'readline';

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    key = await new Promise((resolve) => {
      rl.question('Paste your Anthropic API key (sk-ant-...): ', (answer) => {
        rl.close();
        resolve((answer || '').trim());
      });
    });
  }
  if (!key || !key.startsWith('sk-ant-')) {
    console.error('Missing or invalid ANTHROPIC_API_KEY. Get one at https://console.anthropic.com/');
    process.exit(1);
  }

  console.log('Setting Supabase secret ANTHROPIC_API_KEY...');
  if (!run(`npx supabase secrets set ANTHROPIC_API_KEY=${key}`)) {
    console.error('Failed. Ensure you are linked: npx supabase link --project-ref oerqkyzfsdygmmsonrgz');
    process.exit(1);
  }
  console.log('Deploying extract-invoice-vision...');
  if (!run('npx supabase functions deploy extract-invoice-vision')) {
    console.error('Deploy failed. Try: npx supabase login');
    process.exit(1);
  }
  console.log('Done. Image invoice uploads will use Vision when the key is set.');
}

main();
