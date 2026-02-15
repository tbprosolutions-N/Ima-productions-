import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import { Button } from './ui/Button';
import { appName } from '@/lib/appConfig';
import { onInstallPrompt, triggerInstallPrompt } from '@/lib/pwa';

const MainLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    onInstallPrompt(() => {
      setShowInstallBanner(true);
    });
  }, []);

  return (
    <div className="flex flex-row h-screen min-h-[100dvh] w-full max-w-[100vw] overflow-hidden bg-background ima-bg-vertical">
      {/* Mobile menu button - above overlay when sidebar open */}
      <div className="fixed top-4 left-4 z-[60] md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-12 w-12 min-h-[44px] min-w-[44px] bg-card/95 backdrop-blur border-border"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main: on mobile full width (sidebar is fixed overlay); on desktop flex-1 fills remaining space */}
      <main className="flex-1 min-w-0 w-full overflow-x-hidden overflow-y-auto">
        <div className="w-full min-w-0 p-6 md:p-8 lg:p-10 pt-16 md:pt-8 lg:pt-10 box-border 2xl:max-w-[1800px] 2xl:mx-auto">
          {showInstallBanner && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-card/90 backdrop-blur p-3 flex items-center justify-between gap-3">
              <span className="text-sm text-foreground text-gray-900 dark:text-gray-100">התקן את {appName} כאפליקציה</span>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px] px-3" onClick={() => setShowInstallBanner(false)}>מאוחר יותר</Button>
                <Button size="sm" className="btn-magenta min-h-[44px] min-w-[44px] px-3" onClick={() => { triggerInstallPrompt(); setShowInstallBanner(false); }}>התקן</Button>
              </div>
            </div>
          )}
          <Outlet />
        </div>
      </main>

      {/* Mobile sidebar overlay - below sidebar so sidebar stays on top */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[40] md:hidden"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default MainLayout;
