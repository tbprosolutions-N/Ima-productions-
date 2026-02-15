import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { getSupabaseEnvDiagnostic } from './lib/supabase';
import { ThemeProvider } from './contexts/ThemeContext';
import { LocaleProvider } from './contexts/LocaleContext';
import { AgencyProvider } from './contexts/AgencyContext';
import { ToastProvider } from './contexts/ToastContext';
import MainLayout from './components/MainLayout';
import SetupWizard from './components/SetupWizard';
import PageLoader from './components/PageLoader';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const ArtistsPage = lazy(() => import('./pages/ArtistsPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const QATestPage = lazy(() => import('./pages/QATestPage'));
const SyncMonitorPage = lazy(() => import('./pages/SyncMonitorPage'));
const SystemHealthPage = lazy(() => import('./pages/SystemHealthPage'));

const AuthRescueScreen: React.FC = () => {
  const { retryConnection } = useAuth();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://npc-am.com';
  const diag = typeof window !== 'undefined' ? getSupabaseEnvDiagnostic() : null;
  const wrongAnonKey = diag?.keySet && !diag?.anonKeyLooksLikeJwt;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">חיבור נכשל</h1>
        <p className="text-slate-600 text-sm">
          לא הצלחנו להתחבר לשרת. נסה &quot;נסה שוב&quot; או מעבר לדף ההתחברות ושליחת קישור כניסה למייל.
        </p>
        {wrongAnonKey && (
          <div className="text-right text-sm p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
            <p className="font-semibold mb-1">מפתח Supabase שגוי (Netlify)</p>
            <p className="text-xs">
              ב-Netlify הגדר את <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> למפתח ה-JWT מ-Supabase: Dashboard → Settings → API → &quot;anon&quot; &quot;public&quot; (מחרוזת ארוכה שמתחילה ב-eyJ). אל תשתמש ב-sb_publishable_...
            </p>
          </div>
        )}
        <p className="text-slate-500 text-xs">
          בחלון פרטי/אינקוגניטו — לחץ &quot;מעבר לדף התחברות&quot; והזן דוא&quot;ל לקבלת קישור כניסה.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={retryConnection}
            className="w-full py-3 px-6 rounded-lg bg-slate-900 text-white font-medium shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
          >
            נסה שוב להתחבר
          </button>
          <a
            href="/login"
            className="w-full py-3 px-6 rounded-lg border-2 border-slate-300 text-slate-900 font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 inline-block"
          >
            מעבר לדף התחברות
          </a>
        </div>
        <div className="text-right text-xs text-slate-500 border-t border-slate-200 pt-4 mt-4">
          <p className="font-medium text-slate-700 mb-1">אם הבעיה נמשכת — Supabase URL Configuration:</p>
          <p className="break-all">Site URL: {origin}</p>
          <p className="break-all mt-1">Redirect URLs: {origin}, {origin}/login</p>
        </div>
      </div>
    </div>
  );
};

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, authConnectionFailed } = useAuth();

  if (authConnectionFailed && !user && !loading) {
    return <AuthRescueScreen />;
  }

  if (loading) {
    return <PageLoader label="טוען…" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Demo Mode: Skip onboarding check for stability
  if (!user.onboarded && window.location.pathname !== '/dashboard') {
    return <SetupWizard onComplete={() => {}} />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { user, loading, authConnectionFailed } = useAuth();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  // SAFETY: absolute hard-cap on the loading spinner at the route level.
  // If AuthContext's loading=true sticks beyond 8s, force-render routes.
  const [forceReady, setForceReady] = React.useState(false);
  React.useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      console.warn('[NPC AppRoutes] Loading exceeded 8s — forcing ready state');
      setForceReady(true);
    }, 8000);
    return () => clearTimeout(t);
  }, [loading]);

  if (authConnectionFailed && !user && !loading && !isLoginPage) {
    return <AuthRescueScreen />;
  }

  // 2026 standard: never block /login with full-screen loader — show login UI immediately for fast time-to-interactive
  if (loading && !forceReady && !isLoginPage) {
    return <PageLoader label="טוען…" />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Suspense fallback={<PageLoader label="טוען מסך התחברות…" />}>
            {user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
          </Suspense>
        }
      />
      <Route
        path="/health"
        element={
          import.meta.env.DEV ? (
            <Suspense fallback={<PageLoader label="טוען בדיקת מערכת…" />}>
              <SystemHealthPage />
            </Suspense>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <Suspense fallback={<PageLoader label="טוען דשבורד…" />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="events"
          element={
            <Suspense fallback={<PageLoader label="טוען אירועים…" />}>
              <EventsPage />
            </Suspense>
          }
        />
        <Route
          path="artists"
          element={
            <Suspense fallback={<PageLoader label="טוען אמנים…" />}>
              <ArtistsPage />
            </Suspense>
          }
        />
        <Route
          path="clients"
          element={
            <Suspense fallback={<PageLoader label="טוען לקוחות…" />}>
              <ClientsPage />
            </Suspense>
          }
        />
        <Route
          path="finance"
          element={
            user ? (
              user.permissions?.finance === false ? (
                <Navigate to="/dashboard" replace />
              ) : user.permissions?.finance === true || ['finance', 'manager', 'owner'].includes(user.role) ? (
                <Suspense fallback={<PageLoader label="טוען פיננסים…" />}>
                  <FinancePage />
                </Suspense>
              ) : (
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="calendar"
          element={
            <Suspense fallback={<PageLoader label="טוען יומן…" />}>
              <CalendarPage />
            </Suspense>
          }
        />
        <Route
          path="documents"
          element={
            <Suspense fallback={<PageLoader label="טוען מסמכים…" />}>
              <DocumentsPage />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageLoader label="טוען הגדרות…" />}>
              <SettingsPage />
            </Suspense>
          }
        />
        <Route
          path="qa"
          element={
            import.meta.env.DEV ? (
              <Suspense fallback={<PageLoader label="טוען QA…" />}>
                <QATestPage />
              </Suspense>
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="sync"
          element={
            user?.role === 'owner' ? (
              <Suspense fallback={<PageLoader label="טוען סנכרונים…" />}>
                <SyncMonitorPage />
              </Suspense>
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LocaleProvider>
          <ToastProvider>
            <AuthProvider>
              <AgencyProvider>
                <AppRoutes />
              </AgencyProvider>
            </AuthProvider>
          </ToastProvider>
        </LocaleProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
