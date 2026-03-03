#!/usr/bin/env node
/**
 * @deprecated Netlify deployment deprecated. Frontend now on Vercel.
 * Deploy = git push origin master (triggers Cloudflare Pages build).
 * This script is kept for reference only.
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
