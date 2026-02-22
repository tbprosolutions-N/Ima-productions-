import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useRole } from './hooks/useRole';
import { ThemeProvider } from './contexts/ThemeContext';
import { LocaleProvider } from './contexts/LocaleContext';
import { AgencyProvider } from './contexts/AgencyContext';
import { ToastProvider } from './contexts/ToastContext';
import MainLayout from './components/MainLayout';
import SetupWizard from './components/SetupWizard';
import PageLoader from './components/PageLoader';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const ArtistsPage = lazy(() => import('./pages/ArtistsPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SystemHealthPage = lazy(() => import('./pages/SystemHealthPage'));

const AuthRescueScreen: React.FC = () => {
  const { retryConnection } = useAuth();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">חיבור נכשל</h1>
        <p className="text-slate-600 text-sm">
          לא הצלחנו להתחבר לשרת. נסה &quot;נסה שוב&quot; או מעבר לדף ההתחברות.
        </p>
        <p className="text-slate-500 text-xs">
          בחלון פרטי/אינקוגניטו — לחץ &quot;מעבר לדף התחברות&quot; והתחבר באמצעות Google.
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

const perfLog = (msg: string, ...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(`[perf] Nav: ${msg}`, ...args);
};

const AppRoutes: React.FC = () => {
  const { user, loading, authConnectionFailed } = useAuth();
  const { role: dbRole } = useRole();
  const effectiveRole = dbRole ?? user?.role;
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  React.useEffect(() => {
    perfLog('route', location.pathname);
  }, [location.pathname]);

  if (authConnectionFailed && !user && !loading && !isLoginPage) {
    return <AuthRescueScreen />;
  }

  // Await AuthContext's getSession() before rendering — no band-aid forceReady
  if (loading && !isLoginPage) {
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
            user && effectiveRole === 'owner' ? (
              <Suspense fallback={<PageLoader label="טוען פיננסים…" />}>
                <FinancePage />
              </Suspense>
            ) : user ? (
              <Navigate to="/dashboard" replace />
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
        <Route path="settings/users" element={<Navigate to="/settings?tab=users" replace />} />
        <Route
          path="settings"
          element={
            effectiveRole === 'owner' ? (
              <Suspense fallback={<PageLoader label="טוען הגדרות…" />}>
                <SettingsPage />
              </Suspense>
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route path="sync" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}

export default App;
