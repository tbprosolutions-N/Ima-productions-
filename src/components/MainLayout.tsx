import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, RefreshCw, AlertCircle, HelpCircle } from 'lucide-react';
import Sidebar from './Sidebar';
import { Button } from './ui/Button';
import RouteErrorBoundary from './RouteErrorBoundary';
import { appName } from '@/lib/appConfig';
import { onInstallPrompt, triggerInstallPrompt } from '@/lib/pwa';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAgency } from '@/contexts/AgencyContext';

const MainLayoutInner: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const { warning } = useToast();
  const offlineToastShown = useRef(false);
  const { user } = useAuth();
  const { currentAgency, loading: agencyLoading, agencyError, retryAgency } = useAgency();
  const location = useLocation();
  const showNoAgencyBanner = Boolean(user && !agencyLoading && (!currentAgency || agencyError));

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);

  useEffect(() => {
    onInstallPrompt(() => setShowInstallBanner(true));
  }, []);

  useEffect(() => {
    const onOffline = () => {
      if (!offlineToastShown.current) {
        offlineToastShown.current = true;
        warning('אין חיבור לאינטרנט. חלק מהפעולות לא יהיו זמינות.');
      }
    };
    const onOnline = () => { offlineToastShown.current = false; };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    if (!navigator.onLine) onOffline();
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [warning]);

  return (
    <div className="flex flex-row h-screen min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden overflow-y-auto md:overflow-hidden bg-background ima-bg-vertical">
      {/* Mobile header bar: hamburger (right in RTL) + NPC logo */}
      <header className="md:hidden fixed top-0 start-0 end-0 z-[55] h-14 min-h-[44px] px-3 sm:px-4 flex items-center justify-between gap-3 bg-card/95 backdrop-blur border-b border-border shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 -ms-1"
          onClick={toggleSidebar}
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </Button>
        <div className="flex-1 min-w-0 flex justify-center">
          <span className="text-base sm:text-lg font-bold text-foreground tracking-wide truncate">NPC</span>
        </div>
        <div className="w-11 shrink-0" aria-hidden />
      </header>

      <Sidebar mobileOpen={sidebarOpen} onClose={closeSidebar} />

      {/* Main: on mobile full width with header offset; on desktop flex-1 fills remaining */}
      <main className="flex-1 min-w-0 w-full overflow-x-hidden overflow-y-auto">
        <div className="w-full min-w-0 max-w-[100vw] box-border p-4 sm:p-6 md:p-8 lg:p-10 pt-[4.5rem] sm:pt-[4.5rem] md:pt-8 lg:pt-10 2xl:max-w-[1800px] 2xl:mx-auto">
          {showNoAgencyBanner && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-start gap-2 flex-1">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">הפעולות הראשיות לא זמינות</p>
                  <p className="text-sm text-amber-800 mt-0.5">{agencyError || 'לא נטענה סוכנות. ייתכן שהחשבון לא משויך לסוכנות או שיש בעיית חיבור.'}</p>
                  {/* Help tooltip */}
                  <div className="relative inline-flex mt-1.5">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 underline underline-offset-2 focus:outline-none"
                      onClick={() => setShowHelpTooltip(v => !v)}
                      aria-expanded={showHelpTooltip}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      מה אפשר לעשות?
                    </button>
                    {showHelpTooltip && (
                      <div
                        className="absolute top-7 start-0 z-50 w-72 rounded-lg border border-amber-200 bg-white shadow-lg p-3 text-sm text-gray-700"
                        role="tooltip"
                      >
                        <p className="font-semibold text-gray-900 mb-1">הסיבות הנפוצות ופתרונות:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
                          <li>החשבון לא שויך לסוכנות — בקש מ-<strong>Owner</strong> לבדוק ב-<em>הגדרות → משתמשים</em> שהאימייל שלך מוגדר.</li>
                          <li>טעינת הסוכנות נכשלה בגלל בעיית רשת — לחץ &quot;רענן&quot;.</li>
                          <li>פריסה חדשה ב-DB ריק — Owner צריך להתחבר ראשון כדי ליצור את הסוכנות.</li>
                        </ul>
                        <button
                          type="button"
                          className="mt-2 text-xs text-amber-700 hover:underline"
                          onClick={() => setShowHelpTooltip(false)}
                        >
                          סגור
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100" onClick={retryAgency}>
                <RefreshCw className="w-4 h-4 mr-2" />
                רענן
              </Button>
            </div>
          )}
          {showInstallBanner && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-card/90 backdrop-blur p-3 flex items-center justify-between gap-3">
              <span className="text-sm text-foreground text-gray-900 dark:text-gray-100">התקן את {appName} כאפליקציה</span>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px] px-3" onClick={() => setShowInstallBanner(false)}>מאוחר יותר</Button>
                <Button size="sm" className="btn-magenta min-h-[44px] min-w-[44px] px-3" onClick={() => { triggerInstallPrompt(); setShowInstallBanner(false); }}>התקן</Button>
              </div>
            </div>
          )}
          {/* key resets the error boundary on every route change — isolates crashes per page */}
          <RouteErrorBoundary key={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </div>
      </main>

      {/* Mobile sidebar overlay - tap to close drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[40] md:hidden"
          aria-hidden
          onClick={closeSidebar}
        />
      )}
    </div>
  );
};

const MainLayout = React.memo(MainLayoutInner);
export default MainLayout;
