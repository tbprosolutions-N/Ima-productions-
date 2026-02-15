import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { signInWithMagicLink, supabase } from '@/lib/supabase';

function hasMagicLinkHash(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hash;
  return h.includes('access_token=') || h.includes('refresh_token=') || h.includes('type=magiclink');
}

const LoginPage: React.FC = () => {
  const { loading, user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  const companyName = 'NPC';

  // Force light mode on login page for consistent palette
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark');
    html.classList.add('light');
    html.style.colorScheme = 'light';
    return () => {
      html.style.colorScheme = '';
    };
  }, []);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLinkSent(false);
    setIsLoading(true);

    try {
      // Clear any existing session before sending magic link — prevents premature redirect to dashboard
      await supabase.auth.signOut();

      const emailTrim = email.trim().toLowerCase();
      if (!emailTrim) {
        throw new Error('נא להזין דוא"ל');
      }
      // Strict email validation – must be complete (user@domain.tld)
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRe.test(emailTrim)) {
        throw new Error('נא להזין כתובת דוא"ל מלאה תקינה (לדוגמה: user@domain.com)');
      }

      if (companyId.trim()) {
        localStorage.setItem('ima:last_company_id', companyId.trim());
      }

      // ── Verify user exists in the system before sending magic link (case-insensitive) ──
      const { data: existingUsers, error: lookupError } = await supabase
        .from('users')
        .select('id, email')
        .ilike('email', emailTrim)
        .limit(1);

      if (lookupError) {
        console.warn('[Login] User lookup failed, proceeding anyway:', lookupError.message);
        // Don't block login if lookup fails – fall through to magic link
      } else if (!existingUsers || existingUsers.length === 0) {
        throw new Error('כתובת הדוא"ל לא נמצאה במערכת. פנה למנהל כדי לקבל גישה.');
      }

      const { error: otpError } = await signInWithMagicLink(emailTrim);

      if (otpError) {
        const msg = String(otpError?.message || '');
        if (msg.includes('rate limit') || msg.includes('too many')) throw new Error('נסה שוב בעוד כמה דקות');
        if (msg.includes('network') || msg.includes('fetch')) throw new Error('שגיאת חיבור. בדוק את האינטרנט.');
        if ((msg.toLowerCase().includes('sending') && msg.toLowerCase().includes('email')) || msg.includes('500')) {
          throw new Error('שליחת המייל נכשלה. מנהל: Supabase → Authentication → SMTP (Host: smtp.gmail.com) ו־URL Configuration (הוסף npc-am.com ו־npc-am.com/login).');
        }
        throw new Error(msg || 'שליחת הקישור נכשלה');
      }

      setLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setIsLoading(false);
    }
  };

  const isDev = import.meta.env.DEV;
  const handleGuestEnter = () => {
    setIsLoading(true);
    try {
      localStorage.setItem('demo_authenticated', 'true');
      localStorage.setItem('demo_user', JSON.stringify({
        id: 'npc-guest-user',
        email: 'user@npc.local',
        full_name: 'NPC User',
        role: 'owner',
        agency_id: 'ima-productions-id',
        onboarded: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        permissions: { finance: true, users: true, integrations: true, events_create: true, events_delete: true },
      }));
      window.location.assign('/dashboard');
    } catch {
      setIsLoading(false);
    }
  };

  // When auth is loading, or we landed with magic-link hash (tokens in URL), show "signing in" until session is ready
  const processingMagicLink = hasMagicLinkHash() && !user;
  if (loading || processingMagicLink) {
    return (
      <div className="min-h-screen min-h-[100dvh] w-full max-w-[100vw] flex items-center justify-center bg-[#f8fafc] p-4 box-border">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md flex-shrink-0 text-center"
        >
          <div className="mx-auto w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-md mb-6">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            ברוך הבא ל-NPC AGENCY MANAGEMENT
          </h1>
          <p className="text-slate-600 text-sm mb-6">
            {processingMagicLink ? 'מתחבר... נא להמתין' : 'בודק סשן...'}
          </p>
          <div className="flex justify-center">
            <svg className="animate-spin h-8 w-8 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        </motion.div>
      </div>
    );
  }

  // Welcome-first: show welcome message, form appears only when user clicks "כניסה"
  if (!showForm) {
    return (
      <div className="min-h-screen min-h-[100dvh] w-full max-w-[100vw] flex items-center justify-center bg-[#f8fafc] p-4 box-border">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md flex-shrink-0 text-center"
        >
          <div className="mx-auto w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200/50 mb-8">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-3 leading-tight">
            ברוך הבא ל-NPC AGENCY MANAGEMENT
          </h1>
          <p className="text-slate-600 text-base mb-8">
            מערכת ניהול אירועים מתקדמת לשנת 2026
          </p>
          <Button
            type="button"
            onClick={() => setShowForm(true)}
            className="py-4 px-10 rounded-xl bg-slate-900 text-white font-semibold text-lg hover:bg-slate-800 shadow-md"
          >
            כניסה
          </Button>
          {isDev && (
            <Button
              type="button"
              variant="outline"
              onClick={handleGuestEnter}
              className="mt-4 w-full py-2 rounded-lg border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              כניסה בדמו (פיתוח)
            </Button>
          )}
          <p className="text-xs text-slate-500 mt-8">
            לקבלת גישה — מנהל המערכת יכול לשלוח קישור כניסה מהגדרות → משתמשים
          </p>
          <p className="text-center text-slate-500 text-sm mt-6">
            © 2026 {companyName}. All rights reserved.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full max-w-[100vw] flex items-center justify-center bg-[#f8fafc] p-4 box-border">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md flex-shrink-0"
      >
        <Card className="border border-slate-200 bg-white text-slate-900 shadow-lg shadow-slate-200/50 rounded-xl overflow-hidden">
          <CardHeader className="space-y-3 text-center p-6 pb-4">
            <div className="mx-auto w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-md">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              כניסה ל-NPC AGENCY MANAGEMENT
            </CardTitle>
            <CardDescription className="text-slate-600 text-sm">
              הזן דוא"ל ונסה לך קישור כניסה — בלי סיסמה
            </CardDescription>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 hover:text-slate-700 underline mt-2"
            >
              ← חזור
            </button>
          </CardHeader>

          <CardContent className="p-6 pt-2">
            {linkSent ? (
              <div className="space-y-4 text-center py-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                  נשלח קישור כניסה ל־{email.trim()}. פתח את המייל ולחץ על הקישור כדי להיכנס.
                </div>
                <p className="text-slate-600 text-sm">
                  לא קיבלת? בדוק תיקיית דואר זבל או נסה שוב.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setLinkSent(false); setEmail(''); }}
                  className="w-full"
                >
                  שלח קישור שוב
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSendLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-900">
                    דוא"ל
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 border-slate-300 bg-white text-slate-900"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyId" className="text-slate-900">
                    קוד חברה (אופציונלי)
                  </Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="companyId"
                      type="text"
                      placeholder="למשל NPC001"
                      value={companyId}
                      onChange={(e) => setCompanyId(e.target.value)}
                      className="pl-10 border-slate-300 bg-white text-slate-900"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      שולח קישור...
                    </span>
                  ) : (
                    'שלח לי קישור כניסה'
                  )}
                </Button>

                {isDev && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGuestEnter}
                    disabled={isLoading}
                    className="w-full py-2 rounded-lg border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    כניסה בדמו (פיתוח)
                  </Button>
                )}
              </form>
            )}

            <p className="text-xs text-slate-500 text-center mt-4">
              לקבלת גישה — מנהל המערכת יכול לשלוח קישור כניסה מהגדרות → משתמשים
            </p>
          </CardContent>

          <div className="px-6 pb-6 pt-0 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center">
              בהתחברות, אני מאשר/ת את{' '}
              <a href="#" className="text-slate-900 font-medium underline hover:text-slate-700">תנאי השימוש</a>
              {' '}ו־<a href="#" className="text-slate-900 font-medium underline hover:text-slate-700">מדיניות הפרטיות</a>
            </p>
          </div>
        </Card>

        <p className="text-center text-slate-500 text-sm mt-4">
          © 2026 {companyName}. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
};

export default LoginPage;
