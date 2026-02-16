import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { signInWithGoogle } from '@/lib/supabase';
import { useSearchParams } from 'react-router-dom';

function hasAuthHash(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hash;
  return h.includes('access_token=') || h.includes('refresh_token=') || h.includes('type=magiclink');
}

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const LoginPage: React.FC = () => {
  const { loading, user } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unauthorized = searchParams.get('unauthorized') === '1';

  const companyName = 'NPC';

  // Force light mode on login page
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark');
    html.classList.add('light');
    html.style.colorScheme = 'light';
    return () => { html.style.colorScheme = ''; };
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { error: err } = await signInWithGoogle();
      if (err) {
        const msg = err.message || 'שגיאה בהתחברות';
        setError(msg);
        toast.error(msg);
      }
      // On success, signInWithGoogle redirects; loading stays until redirect
    } catch (e: any) {
      const msg = e?.message || 'שגיאה בהתחברות';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const processingAuth = hasAuthHash() && !user;

  const [authTimeout, setAuthTimeout] = useState(false);
  useEffect(() => {
    if (!processingAuth) return;
    const t = setTimeout(() => {
      setAuthTimeout(true);
      if (typeof window !== 'undefined' && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }, 15000);
    return () => clearTimeout(t);
  }, [processingAuth]);
  useEffect(() => {
    if (!processingAuth) setAuthTimeout(false);
  }, [processingAuth]);

  if ((loading || processingAuth) && !authTimeout) {
    return (
      <div className="min-h-screen min-h-[100dvh] w-full max-w-[100vw] flex items-center justify-center bg-[#f8fafc] p-4 box-border">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md flex-shrink-0 text-center"
        >
          <div className="mx-auto w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-md mb-6 p-2">
            <img src="/logo.svg?v=2" alt="NPC" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">ברוך הבא ל-NPC AGENCY MANAGEMENT</h1>
          <p className="text-slate-600 text-sm mb-6">{processingAuth ? 'מתחבר... נא להמתין' : 'בודק סשן...'}</p>
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

  if (authTimeout) {
    return (
      <div className="min-h-screen min-h-[100dvh] w-full max-w-[100vw] flex items-center justify-center bg-[#f8fafc] p-4 box-border">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-4 p-2">
            <img src="/logo.svg?v=2" alt="NPC" className="w-full h-full object-contain opacity-80" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">התחברות נכשלה</h1>
          <p className="text-slate-600 text-sm">
            לא הצלחנו להשלים את החיבור. פנה למנהל ונסה שוב.
          </p>
          <Button onClick={() => setAuthTimeout(false)} className="mt-4">נסה שוב</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full max-w-[100vw] flex items-center justify-center bg-[#f8fafc] p-4 sm:p-6 box-border">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md flex-shrink-0"
      >
        <Card className="border border-slate-200 bg-white text-slate-900 shadow-lg shadow-slate-200/50 rounded-xl overflow-hidden">
          <CardHeader className="space-y-3 text-center p-6 pb-4">
            <div className="mx-auto w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-md p-2">
              <img src="/logo.svg?v=2" alt="NPC" className="w-full h-full object-contain" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              כניסה ל-NPC AGENCY MANAGEMENT
            </CardTitle>
            <CardDescription className="text-slate-600 text-sm">
              התחברות במערכת באמצעות חשבון Google
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 pt-2 space-y-4">
            {unauthorized && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                הדוא״ל שלך לא מאושר במערכת. פנה למנהל לקבלת גישה.
              </div>
            )}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <Button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full min-h-[48px] py-2.5 px-4 rounded-md bg-white border border-[#dadce0] shadow-[0_1px_2px_0_rgba(60,64,67,.3)] text-[#1f1f1f] font-medium hover:bg-[#f8f9fa] hover:shadow-[0_1px_3px_1px_rgba(60,64,67,.15)] transition-shadow flex items-center justify-center gap-3 touch-manipulation"
              style={{ fontFamily: "'Roboto', 'Helvetica Neue', sans-serif" }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  מתחבר...
                </span>
              ) : (
                <span className="inline-flex items-center gap-3">
                  <GoogleIcon />
                  <span className="font-medium">התחברות באמצעות Google</span>
                </span>
              )}
            </Button>

            <p className="text-xs text-slate-500 text-center mt-2">
              לקבלת גישה — מנהל המערכת יכול להוסיף את הדוא״ל שלך מהגדרות → משתמשים
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

        <p className="text-center text-slate-500 text-sm mt-4">© 2026 {companyName}. All rights reserved.</p>
      </motion.div>
    </div>
  );
};

export default LoginPage;
