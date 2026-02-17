/**
 * EnvCheck – startup guard for the NPC Management System.
 *
 * Checks all VITE_* variables that are available at build-time.
 * Netlify-side server variables (SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SA_*) cannot be
 * checked here (they are never sent to the browser); they are documented in docs/RUNBOOK.md.
 *
 * Shows a detailed checklist UI when required variables are missing or malformed.
 */

import React from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { getSupabaseEnvDiagnostic } from '@/lib/supabase';

// ── Variable registry ──────────────────────────────────────────────────────

interface EnvVar {
  name: string;
  label: string;
  required: boolean;
  getValue: () => string;
  validate?: (v: string) => boolean;
  hint?: string;
}

const ENV_VARS: EnvVar[] = [
  {
    name: 'VITE_SUPABASE_URL',
    label: 'Supabase URL',
    required: true,
    getValue: () => (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
    validate: (v) => v.startsWith('http') && v.includes('supabase'),
    hint: 'Must start with https:// and contain "supabase". Found in Supabase → Settings → API.',
  },
  {
    name: 'VITE_SUPABASE_ANON_KEY',
    label: 'Supabase Anon Key',
    required: true,
    getValue: () => (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
    validate: (v) => v.length > 50 && v.startsWith('eyJ'),
    hint: 'Must be the long JWT starting with "eyJ". Found in Supabase → Settings → API → anon/public key.',
  },
  {
    name: 'VITE_APP_URL',
    label: 'App Public URL (optional)',
    required: false,
    getValue: () => (import.meta.env.VITE_APP_URL as string | undefined) ?? '',
    hint: 'Production domain, e.g. https://npc-am.com. Used for OAuth redirects.',
  },
  {
    name: 'VITE_APP_NAME',
    label: 'App Name (optional)',
    required: false,
    getValue: () => (import.meta.env.VITE_APP_NAME as string | undefined) ?? '',
  },
];

// ── Netlify-only vars (documented, not checkable in browser) ──────────────

const NETLIFY_VARS = [
  { name: 'SUPABASE_URL',           label: 'Supabase URL (server)',        required: true  },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase Service Role Key', required: true  },
  { name: 'GOOGLE_SA_CLIENT_EMAIL', label: 'Google SA Client Email',       required: true  },
  { name: 'GOOGLE_SA_PRIVATE_KEY',  label: 'Google SA Private Key (PEM)',  required: true  },
  { name: 'MORNING_API_KEY',        label: 'Morning API Key (fallback)',    required: false },
  { name: 'MORNING_API_SECRET',     label: 'Morning API Secret (fallback)',required: false },
];

// ── Status helper ─────────────────────────────────────────────────────────

type VarStatus = 'ok' | 'missing' | 'invalid' | 'optional';

function getStatus(v: EnvVar): VarStatus {
  const val = v.getValue();
  if (!val) return v.required ? 'missing' : 'optional';
  if (v.validate && !v.validate(val)) return 'invalid';
  return 'ok';
}

function StatusIcon({ status }: { status: VarStatus }) {
  if (status === 'ok')      return <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />;
  if (status === 'missing') return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  if (status === 'invalid') return <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
  return <span className="w-4 h-4 flex-shrink-0 text-gray-500 text-xs font-bold">—</span>;
}

function StatusText({ status }: { status: VarStatus }) {
  if (status === 'ok')      return <span className="text-green-400 text-xs font-mono">✓ OK</span>;
  if (status === 'missing') return <span className="text-red-400 text-xs font-mono">✗ MISSING</span>;
  if (status === 'invalid') return <span className="text-yellow-400 text-xs font-mono">⚠ INVALID FORMAT</span>;
  return <span className="text-gray-500 text-xs font-mono">– optional</span>;
}

// ── Main component ────────────────────────────────────────────────────────

const EnvCheck: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { urlSet, keySet, anonKeyLooksLikeJwt } = getSupabaseEnvDiagnostic();

  const statuses = ENV_VARS.map((v) => ({ ...v, status: getStatus(v) }));
  const wrongKeyFormat = keySet && !anonKeyLooksLikeJwt;

  // Happy path
  if (urlSet && keySet && anonKeyLooksLikeJwt) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B0B0B] via-[#1A1A1A] to-[#0B0B0B] flex items-center justify-center p-4" dir="ltr">
      <div className="max-w-2xl w-full bg-[#1A1A1A] border-2 border-yellow-500 rounded-xl shadow-2xl p-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="bg-yellow-500 rounded-full p-3 flex-shrink-0">
            <AlertTriangle className="w-8 h-8 text-black" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">⚙️ Configuration Required</h1>
            <p className="text-yellow-200 text-sm mt-1">
              {wrongKeyFormat
                ? 'Supabase anon key is in the wrong format.'
                : 'Required environment variables are missing.'}
            </p>
          </div>
        </div>

        {/* Frontend Variables Checklist */}
        <div className="bg-[#0B0B0B] border border-yellow-500/30 rounded-lg p-5 space-y-3">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-1">
            Frontend Variables (Netlify → Site configuration → Environment variables)
          </h2>
          {statuses.map((v) => (
            <div key={v.name} className="flex items-start gap-3">
              <StatusIcon status={v.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <code className="text-gray-300 text-sm">{v.name}</code>
                  <StatusText status={v.status} />
                </div>
                {v.hint && v.status !== 'ok' && (
                  <p className="text-gray-500 text-xs mt-0.5">{v.hint}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Server-side vars (informational only) */}
        <div className="bg-[#0B0B0B] border border-gray-700 rounded-lg p-5 space-y-3">
          <h2 className="text-gray-400 font-semibold text-sm uppercase tracking-wider mb-1">
            Server-only Variables (Netlify — not visible to browser)
          </h2>
          <p className="text-gray-500 text-xs">
            These cannot be verified here. Set them in Netlify → Site configuration → Environment variables and redeploy.
          </p>
          {NETLIFY_VARS.map((v) => (
            <div key={v.name} className="flex items-center gap-3">
              <span className="w-4 h-4 flex-shrink-0 text-gray-600 text-xs">?</span>
              <code className="text-gray-400 text-sm flex-1">{v.name}</code>
              <span className={`text-xs ${v.required ? 'text-red-400' : 'text-gray-600'}`}>
                {v.required ? 'required' : 'optional'}
              </span>
            </div>
          ))}
          <p className="text-gray-600 text-xs mt-2">
            See <code className="bg-[#1A1A1A] px-1 rounded">docs/RUNBOOK.md</code> for full setup instructions.
          </p>
        </div>

        {/* How to fix */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-5">
          <h3 className="text-yellow-400 font-semibold mb-3">🛠️ How to Fix</h3>
          <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
            <li>
              Go to <strong>Netlify → Your site → Site configuration → Environment variables</strong>
            </li>
            <li>Add or update the variables listed above (red = missing, yellow = wrong format)</li>
            <li>
              Get your Supabase values from{' '}
              <span className="text-yellow-300">Supabase Dashboard → Settings → API</span>
            </li>
            <li>
              Trigger a new <strong>deploy</strong> (Deploys → Trigger deploy → Deploy site) so Vite
              picks up the new build-time variables
            </li>
            <li>Refresh this page</li>
          </ol>
          <p className="text-gray-500 text-xs mt-3">
            For local development: create a <code className="bg-[#0B0B0B] px-1 rounded">.env</code>{' '}
            file in the project root with <code>VITE_SUPABASE_URL=…</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY=…</code>, then restart the dev server.
          </p>
        </div>

        <div className="text-center text-xs text-gray-600 border-t border-gray-800 pt-4">
          Open browser console (F12) for additional diagnostic details.
        </div>
      </div>
    </div>
  );
};

export default EnvCheck;
