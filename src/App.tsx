import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

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
  const { user, loading } = useAuth();

  if (loading) {
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
