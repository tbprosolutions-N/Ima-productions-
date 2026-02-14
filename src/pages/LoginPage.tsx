import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { signIn, supabase } from '@/lib/supabase';
import { useLocale } from '@/contexts/LocaleContext';
import { getCompanyName } from '@/lib/settingsStore';
import { withTimeout } from '@/lib/utils';

const LoginPage: React.FC = () => {
  const { t } = useLocale();
  const companyName = getCompanyName('ima-productions-id') || 'NPC';
  const demoBypassEnabled =
    import.meta.env.DEV && String(import.meta.env.VITE_DEMO_BYPASS || '').toLowerCase() === 'true';
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [diag, setDiag] = useState<string>('');
  const [showSqlFix, setShowSqlFix] = useState(false);
  const [showDbNewUserFix, setShowDbNewUserFix] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [authDiag, setAuthDiag] = useState<string>('');

  const authStorageDiag = useMemo(() => {
    let localStorageOk = false;
    let keyPresent = false;
    let keySize = 0;
    try {
      const k = '__ima_ls_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      localStorageOk = true;
    } catch {
      localStorageOk = false;
    }
    try {
      const v = window.localStorage.getItem('ima_os_auth') || '';
      keyPresent = !!v;
      keySize = v.length;
    } catch {
      keyPresent = false;
      keySize = 0;
    }
    return { localStorageOk, keyPresent, keySize };
  }, []);

  const ensureUserProfileSql = useMemo(
    () => `-- NPC: login self-heal (run once in Supabase SQL Editor)
-- Fixes: "Could not find the function public.ensure_user_profile(company_code) in the schema cache"

CREATE OR REPLACE FUNCTION public.ensure_user_profile(company_code TEXT DEFAULT NULL)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  au RECORD;
  resolved_agency_id UUID;
  resolved_email TEXT;
  resolved_full_name TEXT;
  resolved_role TEXT;
  result_row public.users%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = uid) THEN
    SELECT * INTO result_row FROM public.users u WHERE u.id = uid;
    RETURN result_row;
  END IF;

  SELECT * INTO au FROM auth.users WHERE id = uid;
  resolved_email := COALESCE(au.email, '');
  resolved_full_name := COALESCE(
    au.raw_user_meta_data->>'full_name',
    NULLIF(split_part(resolved_email, '@', 1), ''),
    'New User'
  );

  IF company_code IS NOT NULL AND length(trim(company_code)) > 0 THEN
    SELECT id INTO resolved_agency_id
    FROM public.agencies
    WHERE company_id = trim(company_code)
    LIMIT 1;
  END IF;

  IF resolved_agency_id IS NULL THEN
    SELECT id INTO resolved_agency_id
    FROM public.agencies
    WHERE type = 'ima'
    LIMIT 1;
  END IF;

  IF resolved_agency_id IS NULL THEN
    RAISE EXCEPTION 'No agency found to provision user';
  END IF;

  resolved_role := 'producer';
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.agency_id = resolved_agency_id AND u.role = 'owner'
  ) THEN
    resolved_role := 'owner';
  END IF;

  INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
  VALUES (uid, resolved_email, resolved_full_name, resolved_role, resolved_agency_id, FALSE)
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile(TEXT) TO authenticated;

-- Force PostgREST to reload schema cache so the RPC is discoverable immediately:
NOTIFY pgrst, 'reload schema';
`,
    []
  );

  // Fix for "Database error saving new user" — run once in Supabase SQL Editor
  const dbNewUserFixSql = useMemo(
    () => `-- Fix: "Database error saving new user" (trigger needs default agency)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  resolved_agency_id UUID;
BEGIN
  SELECT id INTO resolved_agency_id
  FROM public.agencies
  WHERE type = 'ima' OR company_id = 'NPC001'
  LIMIT 1;

  IF resolved_agency_id IS NULL THEN
    INSERT INTO public.agencies (name, type, company_id, settings)
    VALUES (
      'NPC',
      'ima',
      'NPC001',
      '{"currency":"ILS","timezone":"Asia/Jerusalem"}'::jsonb
    )
    RETURNING id INTO resolved_agency_id;
  END IF;

  INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'producer'),
    resolved_agency_id,
    FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`,
    []
  );

  const supabaseSqlEditorUrl = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL || '';
    const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
    return m ? `https://supabase.com/dashboard/project/${m[1]}/sql/new` : 'https://supabase.com/dashboard';
  }, []);

  const ensureProfileBeforeRedirect = async () => {
    const company_code = (companyId || '').trim() || null;
    const isProduction = typeof window !== 'undefined' && window.location?.hostname !== 'localhost';
    const sessionMs = isProduction ? 12000 : 8000;
    const profileMs = isProduction ? 12000 : 8000;

    const { data: sessionData, error: sessionErr } = await withTimeout(
      supabase.auth.getSession(),
      sessionMs,
      'Get session'
    );
    if (sessionErr) throw new Error(`Session error: ${sessionErr.message}`);
    const authUser = sessionData.session?.user;
    if (!authUser) throw new Error('No session after login (session not persisted). Add this site to Supabase Auth → Redirect URLs.');

    // Try fetch profile
    const { data: profile, error: profileErr } = await withTimeout(
      supabase.from('users').select('id, role, agency_id, onboarded').eq('id', authUser.id).maybeSingle(),
      profileMs,
      'Fetch profile'
    );

    if (!profileErr && profile) return profile;

    // Self-heal via RPC (if installed)
    const { error: rpcErr } = await withTimeout(
      supabase.rpc('ensure_user_profile', { company_code }),
      profileMs,
      'Provision profile'
    );
    if (rpcErr) {
      const msg = rpcErr.message || 'Unknown RPC error';
      const schemaCacheMissing =
        msg.toLowerCase().includes('schema cache') || msg.toLowerCase().includes('could not find the function');
      if (schemaCacheMissing) setShowSqlFix(true);
      throw new Error(
        `Profile provisioning failed: ${msg}. ` +
          `Fix: run the SQL below in Supabase SQL Editor (creates ensure_user_profile + reload schema).`
      );
    }

    const { data: profile2, error: profile2Err } = await withTimeout(
      supabase.from('users').select('id, role, agency_id, onboarded').eq('id', authUser.id).maybeSingle(),
      8000,
      'Re-fetch profile'
    );

    if (profile2Err || !profile2) {
      throw new Error(`Profile still missing after provisioning: ${profile2Err?.message || 'no row'}`);
    }

    return profile2;
  };

  const clearAuthAndReload = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    try {
      const keys = Object.keys(window.localStorage);
      for (const k of keys) {
        if (k === 'ima_os_auth' || k.startsWith('sb-') || k.startsWith('supabase.')) {
          window.localStorage.removeItem(k);
        }
      }
      window.localStorage.removeItem('demo_authenticated');
      window.localStorage.removeItem('demo_user');
      window.localStorage.removeItem('ima:last_company_id');
      window.localStorage.removeItem('currentAgencyId');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const handleLogin = async () => {
setError(null);
      setSuccess(null);
      setDiag('');
      setAuthDiag('');
      setShowSqlFix(false);
      setShowDbNewUserFix(false);
      setSqlCopied(false);
    setIsLoading(true);

    try {
      // Remember company code for post-login provisioning (if profile row is missing)
      try {
        localStorage.setItem('ima:last_company_id', (companyId || '').trim());
      } catch {
        // ignore storage errors
      }

      // DEMO BYPASS: in dev, exact email + NPC001 → instant demo (no Supabase)
      const isDemoCreds =
        email.trim().toLowerCase() === 'modu.general@gmail.com' &&
        ((companyId || '').trim().toUpperCase() === 'NPC001' || (companyId || '').trim().toUpperCase() === 'IMA001');
      if (import.meta.env.DEV && isDemoCreds) {
        const now = new Date().toISOString();
        localStorage.setItem('demo_authenticated', 'true');
        localStorage.setItem('demo_user', JSON.stringify({
          id: 'demo-user-id',
          email: 'modu.general@gmail.com',
          full_name: 'Noa Tibi',
          role: 'owner',
          agency_id: 'ima-productions-id',
          onboarded: true,
          created_at: now,
          updated_at: now,
          permissions: { finance: true, users: true, integrations: true, events_create: true, events_delete: true },
        }));
        window.location.assign('/dashboard');
        return;
      }

      // Real auth: require Supabase config so we don't hang
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      if (!supabaseUrl || !supabaseKey) {
        const msg = import.meta.env.DEV
          ? 'חסרות הגדרות Supabase. הוסף VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY ב-.env'
          : 'המערכת בהגדרה. נא ליצור קשר עם מנהל המערכת.';
        throw new Error(msg);
      }

      // Sign in with email + password. Magic links are sent only by owners from Settings → Users.
      if (!companyId || companyId.trim() === '') {
        throw new Error('נא להזין קוד חברה תקין');
      }

      const signInTimeoutMs = typeof window !== 'undefined' && window.location?.hostname !== 'localhost' ? 20000 : 15000;
      const { data, error } = await withTimeout(
        signIn(email, password),
        signInTimeoutMs,
        'Sign in'
      );
      if (error) {
        if (error.message.includes('Invalid login')) {
          throw new Error('פרטי התחברות שגויים. אנא בדוק את האימייל והסיסמה.');
        }
        if (error.message.includes('Email not confirmed')) {
          throw new Error('האימייל טרם אומת. אנא בדוק את תיבת הדואר שלך.');
        }
        if (error.message.includes('network') || error.message.includes('fetch')) {
          throw new Error('שגיאת חיבור. אנא בדוק את החיבור לאינטרנט.');
        }
        if (error.message.includes('400') || error.message.includes('Bad Request')) {
          const msg = import.meta.env.DEV
            ? 'שרת החזיר שגיאה (400). בדוק .env והרץ ensure_user_profile.sql ב-Supabase.'
            : 'שגיאת שרת. נא לנסות שוב או ליצור קשר עם מנהל המערכת.';
          throw new Error(msg);
        }
        throw error;
      }

      // Do not redirect until session + profile are confirmed.
      const sessionUser = data?.session?.user;
      if (sessionUser) setDiag(`Auth OK: ${sessionUser.email || sessionUser.id}`);
      setAuthDiag(
        `localStorage=${authStorageDiag.localStorageOk ? 'OK' : 'BLOCKED'} ` +
          `authKey=${authStorageDiag.keyPresent ? `present(${authStorageDiag.keySize})` : 'missing'}`
      );

      // Proactively ensure profile row exists (reduces timeout on first fetch)
      const company_code = (companyId || '').trim() || null;
      try {
        await withTimeout(
          supabase.rpc('ensure_user_profile', { company_code }),
          10000,
          'Ensure profile'
        );
      } catch {
        // ignore; ensureProfileBeforeRedirect will retry
      }

      const runProvision = async () => ensureProfileBeforeRedirect();
      let profile: any;
      try {
        profile = await runProvision();
      } catch (e: any) {
        const msg = String(e?.message || e);
        const retryable =
          msg.toLowerCase().includes('aborted') ||
          msg.toLowerCase().includes('signal') ||
          msg.toLowerCase().includes('failed to fetch') ||
          msg.toLowerCase().includes('timed out');
        if (retryable) {
          await new Promise((r) => setTimeout(r, 600));
          profile = await runProvision();
        } else {
          throw e;
        }
      }

      setSuccess('התחברת בהצלחה. טוען מערכת…');
      setDiag(`Profile OK: role=${profile.role}, agency=${profile.agency_id}`);

      window.location.assign('/dashboard');
      return;
    } catch (err: unknown) {
      console.error('Login error:', err);
      setSuccess(null);
      const msg = err instanceof Error ? err.message : 'שגיאה בהתחברות. נא לנסות שוב.';
      if (msg.includes('Database error saving new user')) {
        setError('שגיאת מסד נתונים ביצירת משתמש. הרץ את התיקון למטה (פעם אחת ב־Supabase) ונסה שוב.');
        setShowDbNewUserFix(true);
      } else if (msg.includes('timed out')) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const url1 = origin ? `${origin}` : '';
        const url2 = origin ? `${origin}/login` : '';
        const redirectHint = url1 && url2
          ? ` הוסף ב־Supabase Auth → URL Configuration → Redirect URLs: ${url1} ו־${url2}`
          : ' הוסף את כתובת האתר ב־Supabase Auth → URL Configuration → Redirect URLs.';
        setError(`ההתחברות ארכה יותר מדי.${redirectHint} אחר כך לחץ "נקה התחברות (Auth) ונסה שוב" או בדוק חיבור לאינטרנט.`);
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const copySqlFix = async () => {
    try {
      await navigator.clipboard.writeText(ensureUserProfileSql);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    } catch {
      setSqlCopied(false);
    }
  };

  const copyDbNewUserFix = async () => {
    try {
      await navigator.clipboard.writeText(dbNewUserFixSql);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    } catch {
      setSqlCopied(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full max-w-[100vw] flex items-center justify-center auth-page-bg p-4 box-border">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md flex-shrink-0"
      >
        <Card className="border-gray-100 dark:border-gray-800 bg-card text-card-foreground shadow-sm">
          <CardHeader className="space-y-4 text-center p-6 md:p-8">
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mx-auto w-20 h-20 bg-primary rounded-2xl flex items-center justify-center shadow-2xl"
            >
              <Building2 className="w-10 h-10 text-primary-foreground" />
            </motion.div>
            <CardTitle className="text-3xl font-bold text-foreground">
              {t('app.name')}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              מערכת ניהול אירועים מתקדמת לשנת 2026
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleLogin();
              }}
            >
              <div className="space-y-5 p-5 md:p-6 pt-0">
              {/* Demo invite link (copied from Settings) */}
              {(() => {
                try {
                  if (!demoBypassEnabled) return null;
                  const params = new URLSearchParams(window.location.search);
                  if (params.get('demo_invite') !== '1') return null;
                  const invitedEmail = (params.get('email') || '').trim().toLowerCase();
                  if (!invitedEmail) return null;
                  // Demo login via invite (no email delivery required)
                  localStorage.setItem('demo_authenticated', 'true');
                  localStorage.setItem('demo_user', JSON.stringify({
                    id: `demo-${invitedEmail}`,
                    email: invitedEmail,
                    full_name: invitedEmail.split('@')[0] || 'Demo User',
                    role: 'producer',
                    agency_id: 'ima-productions-id',
                    onboarded: true,
                  }));
                  // clean URL then redirect
                  window.history.replaceState({}, '', '/login');
                  window.location.assign('/dashboard');
                  return null;
                } catch {
                  return null;
                }
              })()}

              <div className="space-y-2">
                <Label htmlFor="company" className="text-foreground">
                  {t('auth.companyId')}
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company"
                    type="text"
                    placeholder="NPC001"
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="pl-10 border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">
                  {t('auth.email')}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">
                  {t('auth.password')}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
                    required
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}

              {showDbNewUserFix && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs space-y-2"
                >
                  <div className="font-semibold text-amber-100">תיקון חד־פעמי ב־Supabase</div>
                  <p className="text-amber-200/90">
                    הרץ את ה־SQL הבא ב־Supabase (SQL Editor) ואז נסה שוב להתחבר.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={supabaseSqlEditorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-md bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      פתח Supabase SQL Editor
                    </a>
                    <Button type="button" variant="outline" onClick={copyDbNewUserFix} className="h-8 px-3 text-xs">
                      {sqlCopied ? 'הועתק' : 'העתק SQL'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowDbNewUserFix(false)} className="h-8 px-3 text-xs">
                      הסתר
                    </Button>
                  </div>
                  <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-snug whitespace-pre-wrap">
                    {dbNewUserFixSql}
                  </pre>
                </motion.div>
              )}

              {showSqlFix && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs space-y-2">
                  <div className="font-semibold text-amber-100">Fix required in Supabase (one-time)</div>
                  <div>
                    1) Supabase → SQL Editor → New query → paste SQL → Run
                    <br />
                    2) Refresh this page and login again
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={copySqlFix} className="h-8 px-3 text-xs">
                      {sqlCopied ? 'Copied' : 'Copy SQL Fix'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowSqlFix(false)}
                      className="h-8 px-3 text-xs"
                    >
                      Hide
                    </Button>
                  </div>
                  <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-snug">
{ensureUserProfileSql}
                  </pre>
                </div>
              )}

              {success && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm"
                >
                  {success}
                </motion.div>
              )}

              {diag && (
                <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-primary text-xs">
                  {diag}
                </div>
              )}

              {authDiag && (
                <div className="p-3 bg-slate-500/10 border border-slate-500/30 rounded-lg text-slate-200 text-xs">
                  {authDiag}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={clearAuthAndReload}
                className="w-full text-gray-900 dark:text-gray-100 border-gray-400 dark:border-gray-500 bg-white/80 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700"
                disabled={isLoading}
              >
                נקה התחברות (Auth) ונסה שוב
              </Button>

              {import.meta.env.DEV && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 dark:hover:bg-amber-500/30"
                  disabled={isLoading}
                  onClick={() => {
                    const now = new Date().toISOString();
                    localStorage.setItem('demo_authenticated', 'true');
                    localStorage.setItem('demo_user', JSON.stringify({
                      id: 'demo-user-id',
                      email: 'modu.general@gmail.com',
                      full_name: 'Noa Tibi',
                      role: 'owner',
                      agency_id: 'ima-productions-id',
                      onboarded: true,
                      created_at: now,
                      updated_at: now,
                      permissions: { finance: true, users: true, integrations: true, events_create: true, events_delete: true },
                    }));
                    window.location.assign('/dashboard');
                  }}
                >
                  כניסה בדמו (ללא Supabase) — רק בפיתוח
                </Button>
              )}

              <Button
                type="submit"
                className="w-full btn-magenta text-primary-foreground focus-visible:ring-2 focus-visible:ring-offset-2 hover:opacity-90"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center text-primary-foreground">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    טוען...
                  </span>
                ) : (
                  t('auth.signIn')
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                לקבלת גישה ללא סיסמה — מנהל המערכת יכול לשלוח קישור כניסה במייל מהגדרות → משתמשים.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                בהתחברות למערכת, אני מאשר/ת שקראתי והסכמתי ל
                <a href="#" className="text-primary/80 hover:text-primary mx-1">
                  תנאי השימוש
                </a>
                ול
                <a href="#" className="text-primary/80 hover:text-primary mx-1">
                  מדיניות הפרטיות
                </a>
                בהתאם לתיקון 13 לחוק הגנת הפרטיות, התשמ"א-1981
              </p>
            </div>
            </form>
          </CardContent>
        </Card>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-muted-foreground text-sm mt-4"
        >
          © 2026 {companyName}. All rights reserved.
        </motion.p>
      </motion.div>
    </div>
  );
};

export default LoginPage;
