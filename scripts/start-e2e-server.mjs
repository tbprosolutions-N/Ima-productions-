import { spawn } from 'node:child_process';

// Starts Vite with demo bypass enabled for deterministic E2E runs.
// This avoids depending on Supabase auth latency and missing DB bootstrap.
// Dummy Supabase env vars prevent "supabaseUrl is required" on app load.

const env = {
  ...process.env,
  VITE_DEMO_BYPASS: 'true',
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://demo.supabase.co',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
};

const command = process.platform === 'win32'
  ? 'cmd.exe'
  : 'sh';
const args = process.platform === 'win32'
  ? ['/c', 'npx vite --host --port 4173 --strictPort']
  : ['-c', 'npx vite --host --port 4173 --strictPort'];

const child = spawn(command, args, { stdio: 'inherit', env });

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', () => process.exit(1));

