import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Calendar,
  Users,
  UserCircle,
  DollarSign,
  FileText,
  Settings,
  Activity,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { useTheme } from '@/contexts/ThemeContext';
import { prefetchRoute } from '@/lib/prefetch';
import { useLocale } from '@/contexts/LocaleContext';
import { useAgency } from '@/contexts/AgencyContext';
import { getAgencyLogo, getCompanyName } from '@/lib/settingsStore';
import { Button } from './ui/Button';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  roles?: string[];
}

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

const SIDEBAR_WIDTH = 280;

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onClose }) => {
  const { user, signOut } = useAuth();
  const { role } = useRole(); // Role from DB so owner always sees Settings, Finance, Sync
  const { theme, toggleTheme } = useTheme();
  const { t } = useLocale();
  const { currentAgency } = useAgency();
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

  const navItems: NavItem[] = [
    {
      to: '/dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
      label: t('nav.dashboard'),
    },
    {
      to: '/events',
      icon: <Calendar className="w-5 h-5" />,
      label: t('nav.events'),
    },
    {
      to: '/artists',
      icon: <UserCircle className="w-5 h-5" />,
      label: t('nav.artists'),
    },
    {
      to: '/clients',
      icon: <Users className="w-5 h-5" />,
      label: t('nav.clients'),
    },
    {
      to: '/finance',
      icon: <DollarSign className="w-5 h-5" />,
      label: t('nav.finance'),
      roles: ['finance', 'manager', 'owner'],
    },
    {
      to: '/calendar',
      icon: <Calendar className="w-5 h-5" />,
      label: t('nav.calendar'),
    },
    {
      to: '/documents',
      icon: <FileText className="w-5 h-5" />,
      label: t('nav.documents'),
    },
    {
      to: '/settings',
      icon: <Settings className="w-5 h-5" />,
      label: t('nav.settings'),
    },
    {
      to: '/sync',
      icon: <Activity className="w-5 h-5" />,
      label: 'Sync Monitor',
      roles: ['owner'],
    },
  ];

  const canAccessRoute = (roles?: string[]) => {
    if (!roles || !user) return true;
    // Use role from DB (useRole) so owner always sees admin nav
    const effectiveRole = role ?? user.role;
    if (!effectiveRole) return true;

    if (roles.includes('finance')) {
      if (user.permissions?.finance === true) return true;
      if (user.permissions?.finance === false) return false;
    }
    return roles.includes(effectiveRole);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ x: isDesktop ? 0 : (mobileOpen ? 0 : -SIDEBAR_WIDTH) }}
      transition={{ type: 'tween', duration: 0.2 }}
      className={`w-64 shrink-0 bg-card border-r border-border flex flex-col h-screen
        fixed top-0 left-0 z-50
        md:relative md:left-auto md:z-auto md:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl ima-palette-gradient sidebar-logo-shadow ring-1 ring-primary/20 flex items-center justify-center overflow-hidden">
            {logo ? (
              <img
                src={logo}
                alt="Agency logo"
                className="w-full h-full object-cover"
              />
            ) : (
              <img src="/logo.svg?v=2" alt="NPC" className="w-full h-full object-contain p-1.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-foreground leading-5 break-words" title={companyName}>
              {companyName}
            </div>
            <div className="text-xs text-muted-foreground">ניהול הפקות</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navItems.map((item) => {
          if (!canAccessRoute(item.roles)) return null;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onMouseEnter={() => prefetchRoute(item.to)}
              onFocus={() => prefetchRoute(item.to)}
              onClick={() => onClose?.()}
              className={({ isActive }) =>
                `modu-icon-text gap-3 px-4 py-3 rounded-[var(--modu-radius)] transition-all duration-200 min-h-[44px] ${item.to === '/events' ? 'events-link' : ''} ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-lg'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`w-9 h-9 rounded-[var(--modu-radius)] flex items-center justify-center shrink-0 ${!isActive ? 'bg-primary/10 dark:bg-primary/20' : ''}`}>
                    {item.icon}
                  </span>
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border space-y-2">
        <Button
          variant="ghost"
          onClick={toggleTheme}
          className="w-full justify-start modu-icon-text"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 shrink-0" />
          ) : (
            <Moon className="w-5 h-5 shrink-0" />
          )}
          {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => void signOut()}
          className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-500/10 modu-icon-text"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {t('auth.logout')}
        </Button>

        {user && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold">
                {user.full_name.charAt(0)}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="font-medium text-sm truncate text-foreground">{user.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
};

export default Sidebar;
