import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { getSupabaseEnvDiagnostic } from '@/lib/supabase';

const EnvCheck: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { urlSet, keySet, anonKeyLooksLikeJwt } = getSupabaseEnvDiagnostic();
  const wrongAnonKeyFormat = keySet && !anonKeyLooksLikeJwt;

  if (!urlSet || !keySet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0B0B0B] via-[#1A1A1A] to-[#0B0B0B] flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-[#1A1A1A] border-2 border-yellow-500 rounded-lg shadow-2xl p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-yellow-500 rounded-full p-3">
              <AlertTriangle className="w-8 h-8 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                ⚠️ Configuration Missing
              </h1>
              <p className="text-yellow-200">
                Environment variables not found
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-[#0B0B0B] border border-yellow-500/30 rounded p-4">
              <h2 className="text-white font-semibold mb-3">Missing Variables:</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">VITE_SUPABASE_URL:</span>
                  <span className={urlSet ? 'text-green-400' : 'text-red-400'}>
                    {urlSet ? '✅ OK' : '❌ MISSING'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">VITE_SUPABASE_ANON_KEY:</span>
                  <span className={keySet ? 'text-green-400' : 'text-red-400'}>
                    {keySet ? '✅ OK' : '❌ MISSING'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-4">
              <h3 className="text-yellow-400 font-semibold mb-2">🛠️ How to Fix:</h3>
              <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                <li>Create a <code className="bg-[#0B0B0B] px-2 py-1 rounded">.env</code> file in the project root</li>
                <li>Add the following lines:</li>
                <pre className="bg-[#0B0B0B] p-3 rounded mt-2 text-xs overflow-x-auto">
{`VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here`}
                </pre>
                <li>Restart the development server</li>
                <li>Refresh this page</li>
              </ol>
            </div>

            <div className="text-center text-sm text-gray-400 pt-4 border-t border-gray-700">
              Check the console (F12) for more details
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (wrongAnonKeyFormat) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0B0B0B] via-[#1A1A1A] to-[#0B0B0B] flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-[#1A1A1A] border-2 border-amber-500 rounded-lg shadow-2xl p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-amber-500 rounded-full p-3">
              <AlertTriangle className="w-8 h-8 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Wrong Supabase anon key format
              </h1>
              <p className="text-amber-200">
                VITE_SUPABASE_ANON_KEY must be the JWT from Supabase (starts with eyJ...)
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-gray-300 text-sm">
              In Supabase Dashboard → Settings → API, copy the <strong>anon</strong> / <strong>public</strong> key (long JWT).
              Do not use <code className="bg-[#0B0B0B] px-1 rounded">sb_publishable_...</code> or other keys.
            </p>
            <p className="text-gray-400 text-xs">
              In production (Netlify): set VITE_SUPABASE_ANON_KEY to that JWT in Environment variables, then redeploy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default EnvCheck;
