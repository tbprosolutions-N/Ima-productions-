import { spawn } from 'node:child_process';

// Starts Vite with demo bypass enabled for deterministic E2E runs.
// This avoids depending on Supabase auth latency and missing DB bootstrap.

const env = { ...process.env, VITE_DEMO_BYPASS: 'true' };

const command = process.platform === 'win32'
  ? 'cmd.exe'
  : 'sh';
const args = process.platform === 'win32'
  ? ['/c', 'npx vite --host --port 4173 --strictPort']
  : ['-c', 'npx vite --host --port 4173 --strictPort'];

const child = spawn(command, args, { stdio: 'inherit', env });

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', () => process.exit(1));

