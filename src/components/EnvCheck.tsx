import React from 'react';
import { AlertTriangle } from 'lucide-react';

const EnvCheck: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
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
                  <span className={supabaseUrl ? 'text-green-400' : 'text-red-400'}>
                    {supabaseUrl ? '✅ OK' : '❌ MISSING'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">VITE_SUPABASE_ANON_KEY:</span>
                  <span className={supabaseKey ? 'text-green-400' : 'text-red-400'}>
                    {supabaseKey ? '✅ OK' : '❌ MISSING'}
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

  return <>{children}</>;
};

export default EnvCheck;
