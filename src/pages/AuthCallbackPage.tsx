/**
 * Auth callback page — single entry for /auth/callback. See docs/ROUTES_AND_PAGES.md.
 * Handles Google OAuth PKCE callback.
 * Supabase redirects here with ?code=xxx or with ?error=... on failure.
 * We explicitly exchange the code for a session (critical for PKCE), then AuthContext picks up the session.
 */
import React, { useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, getAuthCallbackRedirectUrl, notifyAuthPopupDone } from '@/lib/supabase';

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, profileError } = useAuth();
  const doneRef = useRef(false);
  const codeExchangedRef = useRef(false);

  // PKCE: exchange code for session as soon as we have a code in the URL (critical for PKCE flow)
  useEffect(() => {
    if (codeExchangedRef.current) return;
    const code = searchParams.get('code');
    if (!code) return;
    codeExchangedRef.current = true;
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ data, error }) => {
        if (error) {
          console.error('[Auth] exchangeCodeForSession failed:', error.message, error);
          return;
        }
        if (data?.session) {
          console.info('[Auth] exchangeCodeForSession OK');
          if (typeof window !== 'undefined' && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      })
      .catch((err) => console.error('[Auth] exchangeCodeForSession threw:', err));
  }, [searchParams]);

  // Supabase/Google may put error in query (?error=...) or in hash (#error=...) when redirect is rejected
  const urlError = useMemo(() => {
    const fromQuery = () => {
      const err = searchParams.get('error');
      const desc = searchParams.get('error_description');
      if (err || desc) return { code: err || '', description: desc || err };
      return null;
    };
    const fromHash = () => {
      if (typeof window === 'undefined' || !window.location.hash) return null;
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const err = params.get('error');
      const desc = params.get('error_description');
      if (err || desc) return { code: err || '', description: desc || err };
      return null;
    };
    return fromQuery() || fromHash();
  }, [searchParams]);

  useEffect(() => {
    if (doneRef.current) return;
    if (user) {
      doneRef.current = true;
      if (typeof window !== 'undefined' && window.opener) {
        notifyAuthPopupDone();
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, navigate]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (doneRef.current) return;
      if (!user && !loading) {
        doneRef.current = true;
        navigate('/login?auth_reason=timeout', { replace: true });
      }
    }, 18000);
    return () => clearTimeout(t);
  }, [user, loading, navigate]);

  // Show profile error state so debug logs are visible (no redirect to login)
  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
        <div className="max-w-md w-full text-center space-y-4 bg-white rounded-xl border border-amber-200 shadow-lg p-6">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center p-2">
            <img src="/logo.svg" alt="NPC" className="w-full h-full object-contain opacity-80" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">טוען פרופיל</h1>
          <p className="text-amber-800 text-sm font-medium">פרופיל משתמש לא זמין — בדוק את הקונסול (F12) לשגיאת Supabase.</p>
          <p className="text-slate-600 text-xs font-mono break-all">{profileError}</p>
          <p className="text-slate-500 text-xs">אין התנתקות אוטומטית — תיקן RLS / pending_invites והרענן.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium"
          >
            רענון
          </button>
        </div>
      </div>
    );
  }

  // If URL already contains an error, show it immediately and offer to go back to login
  useEffect(() => {
    if (!urlError) return;
    console.error('[Auth] Callback URL error:', urlError);
    doneRef.current = true;
  }, [urlError]);

  const redirectUrlHint = getAuthCallbackRedirectUrl();

  if (urlError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
        <div className="max-w-md w-full text-center space-y-4 bg-white rounded-xl border border-red-200 shadow-lg p-6">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center p-2">
            <img src="/logo.svg" alt="NPC" className="w-full h-full object-contain opacity-80" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">שגיאה בהתחברות</h1>
          <p className="text-red-700 text-sm font-medium">{urlError.code}</p>
          {urlError.description && urlError.description !== urlError.code && (
            <p className="text-slate-600 text-sm">{decodeURIComponent(urlError.description)}</p>
          )}
          <div className="text-left bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <p className="font-semibold mb-1">מה לבדוק:</p>
            <p>ב-Supabase Dashboard → Authentication → URL Configuration → Redirect URLs הוסף בדיוק:</p>
            <code className="block mt-1 p-2 bg-white rounded break-all">{redirectUrlHint}</code>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium"
          >
            חזרה לדף הכניסה
          </button>
        </div>
      </div>
    );
  }

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const hasCode = typeof window !== 'undefined' && window.location.search.includes('code=');

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center p-2">
          <img src="/logo.svg" alt="NPC" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">מתחבר...</h1>
        <p className="text-slate-500 text-xs max-w-xs mx-auto">
          אם הכניסה לא מתבצעת, וודא ש-Supabase → Redirect URLs כולל: <span className="font-mono break-all">{redirectUrlHint}</span>
        </p>
        <div className="text-left max-w-xs mx-auto p-2 bg-slate-100 rounded text-[11px] text-slate-600">
          <p><strong>כתובת נוכחית:</strong> <span className="font-mono break-all">{currentOrigin}</span></p>
          {hasCode && <p className="text-green-700 mt-1">✓ התקבל code מ-Supabase — ממתין להשלמת ההתחברות.</p>}
          <p className="mt-1">אם אחרי ~18 שניות אתה חוזר ללוגין: חסר Redirect URL ב-Supabase או חסרה שורת משתמש (הרץ מיגרציית RLS).</p>
        </div>
        <div className="flex justify-center">
          <svg className="animate-spin h-7 w-7 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default AuthCallbackPage;
