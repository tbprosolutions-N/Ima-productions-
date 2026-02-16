#!/usr/bin/env node
/**
 * Deploy dist/ to Netlify production.
 * If NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN are set, runs non-interactively.
 * Otherwise runs netlify deploy (may prompt to link or log in).
 */
import { spawn } from 'child_process';

const siteId = process.env.NETLIFY_SITE_ID;
const auth = process.env.NETLIFY_AUTH_TOKEN;
const args = ['deploy', '--prod', '--dir=dist', '--functions=netlify/functions'];
if (siteId) args.push('--site', siteId);
if (auth) args.push('--auth', auth);

const child = spawn('npx', ['netlify', ...args], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
});
child.on('exit', (code) => process.exit(code ?? 0));
