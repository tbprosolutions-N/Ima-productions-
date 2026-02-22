import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Calendar,
  Users,
  UserCircle,
  DollarSign,
  FileText,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { useAgency } from '@/contexts/AgencyContext';
import { prefetchRoute, prefetchDataForRoute } from '@/lib/prefetch';
import { useLocale } from '@/contexts/LocaleContext';
import { getAgencyLogo, getCompanyName } from '@/lib/settingsStore';
import { Button } from './ui/Button';

interface NavItemDef {
  to: string;
  Icon: LucideIcon;
  label: string;
  roles?: string[];
}

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

/** Mobile drawer width: slides in from right; max 70vw */
const SIDEBAR_WIDTH_MOBILE = 256;

const SidebarInner: React.FC<SidebarProps> = ({ mobileOpen = false, onClose }) => {
  const { user, signOut } = useAuth();
  const { role } = useRole();
  const { t } = useLocale();
  const { currentAgency } = useAgency();
  const queryClient = useQueryClient();
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [logo, setLogo] = useState<string | null>(currentAgency ? getAgencyLogo(currentAgency.id) : null);
  const [companyName, setCompanyNameState] = useState<string>(() =>
    currentAgency ? getCompanyName(currentAgency.id) || currentAgency.name : t('app.name')
  );

  useEffect(() => {
    if (!currentAgency) return;
    setLogo(getAgencyLogo(currentAgency.id));
    setCompanyNameState(getCompanyName(currentAgency.id) || currentAgency.name || t('app.name'));
  }, [currentAgency?.id]);

  useEffect(() => {
    const handler = () => {
      if (!currentAgency) return;
      setLogo(getAgencyLogo(currentAgency.id));
      setCompanyNameState(getCompanyName(currentAgency.id) || currentAgency.name || t('app.name'));
    };
    window.addEventListener('storage', handler);
    window.addEventListener('ima:logo', handler as any);
    window.addEventListener('ima:company', handler as any);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('ima:logo', handler as any);
      window.removeEventListener('ima:company', handler as any);
    };
  }, [currentAgency?.id]);

  const navItems: NavItemDef[] = useMemo(() => [
    { to: '/dashboard', Icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/events', Icon: Calendar, label: t('nav.events') },
    { to: '/artists', Icon: UserCircle, label: t('nav.artists') },
    { to: '/clients', Icon: Users, label: t('nav.clients') },
    { to: '/finance', Icon: DollarSign, label: t('nav.finance'), roles: ['owner'] },
    { to: '/calendar', Icon: Calendar, label: t('nav.calendar') },
    { to: '/documents', Icon: FileText, label: t('nav.documents') },
    { to: '/settings', Icon: Settings, label: t('nav.settings'), roles: ['owner'] },
  ], [t]);

  const canAccessRoute = useCallback((roles?: string[]) => {
    if (!roles || !user) return true;
    const effectiveRole = role ?? user.role;
    if (!effectiveRole) return true;
    return roles.includes(effectiveRole);
  }, [user, role]);

  const handleNavClick = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handlePrefetch = useCallback((path: string) => {
    prefetchRoute(path);
    prefetchDataForRoute(queryClient, currentAgency?.id, path);
  }, [queryClient, currentAgency?.id]);

  const mobileTransform = isDesktop ? undefined : (mobileOpen ? 'translateX(0)' : `translateX(${SIDEBAR_WIDTH_MOBILE}px)`);
  const asideStyle = isDesktop ? undefined : {
    width: 'min(256px, 70vw)',
    transform: mobileTransform,
    transition: 'transform 0.2s ease',
  };

  return (
    <aside
      className="w-64 max-w-[70vw] md:max-w-none md:w-64 shrink-0 bg-card border-r border-border flex flex-col h-screen
        fixed top-0 right-0 z-50
        md:relative md:right-auto md:left-0 md:translate-x-0"
      style={asideStyle}
    >
      <div className="p-4 sm:p-5 md:p-6 border-b border-border">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl ima-palette-gradient sidebar-logo-shadow ring-1 ring-primary/20 flex items-center justify-center overflow-hidden shrink-0">
            {logo ? (
              <img src={logo} alt="Agency logo" className="w-full h-full object-cover" />
            ) : (
              <img src="/logo.svg" alt="NPC" className="w-full h-full object-contain p-1 sm:p-1.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-bold text-foreground leading-5 break-words" title={companyName}>
              {companyName}
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">ניהול הפקות</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-0.5 sm:space-y-1">
        {navItems.map((item) => {
          if (!canAccessRoute(item.roles)) return null;
          const Icon = item.Icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onMouseEnter={() => handlePrefetch(item.to)}
              onFocus={() => handlePrefetch(item.to)}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `modu-icon-text gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-[var(--modu-radius)] transition-all duration-200 min-h-[40px] sm:min-h-[44px] text-sm sm:text-base ${item.to === '/events' ? 'events-link' : ''} ${
                  isActive ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`w-8 h-8 sm:w-9 sm:h-9 rounded-[var(--modu-radius)] flex items-center justify-center shrink-0 ${!isActive ? 'bg-primary/10 dark:bg-primary/20' : ''}`}>
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </span>
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 sm:p-4 border-t border-border space-y-1 sm:space-y-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => void signOut()}
          className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-500/10 modu-icon-text text-sm sm:text-base min-h-[40px] sm:min-h-[44px]"
        >
          <LogOut className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          {t('auth.logout')}
        </Button>
        {user && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center gap-2 sm:gap-3 px-1 sm:px-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold text-xs sm:text-sm shrink-0">
                {user.full_name.charAt(0)}
              </div>
              <div className="flex-1 overflow-hidden min-w-0">
                <div className="font-medium text-xs sm:text-sm truncate text-foreground">{user.full_name}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
            </div>
          </div>
        )}
        {/* Deploy version marker — confirms live build */}
        <div className="pt-2 text-center">
          <span className="text-[9px] text-muted-foreground/50 select-none tracking-wide">
            v1.1 · P3
          </span>
        </div>
      </div>
    </aside>
  );
};

const Sidebar = React.memo(SidebarInner);
export default Sidebar;
