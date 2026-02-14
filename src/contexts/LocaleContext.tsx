import React, { createContext, useContext, useEffect, useState } from 'react';

type Locale = 'he' | 'en';
type Direction = 'rtl' | 'ltr';

interface LocaleContextType {
  locale: Locale;
  direction: Direction;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const translations: Record<Locale, Record<string, string>> = {
  he: {
    'app.name': 'NPC',
    'auth.login': 'כניסה',
    'auth.logout': 'יציאה',
    'auth.email': 'דוא"ל',
    'auth.password': 'סיסמה',
    'auth.companyId': 'מזהה חברה',
    'auth.magicLink': 'קישור קסם',
    'auth.sendMagicLink': 'שלח קישור קסם',
    'auth.signIn': 'התחבר',
    'auth.forgotPassword': 'שכחת סיסמה?',
    'nav.dashboard': 'לוח בקרה',
    'nav.events': 'אירועים',
    'nav.artists': 'אמנים',
    'nav.clients': 'לקוחות',
    'nav.finance': 'כספים',
    'nav.calendar': 'יומן',
    'nav.documents': 'מסמכים',
    'nav.settings': 'הגדרות',
    'dashboard.kpi.totalRevenue': 'הכנסות כוללות',
    'dashboard.kpi.eventsThisMonth': 'אירועים החודש',
    'dashboard.kpi.pendingPayments': 'תשלומים ממתינים',
    'dashboard.kpi.activeClients': 'לקוחות פעילים',
    'events.new': 'אירוע חדש',
    'events.edit': 'ערוך אירוע',
    'events.delete': 'מחק אירוע',
    'events.export': 'ייצא לדוח',
    'common.save': 'שמור',
    'common.cancel': 'ביטול',
    'common.delete': 'מחק',
    'common.edit': 'ערוך',
    'common.search': 'חפש',
    'common.filter': 'סנן',
    'common.export': 'ייצא',
    'common.loading': 'טוען...',
    'common.error': 'שגיאה',
    'common.success': 'הצלחה',
  },
  en: {
    'app.name': 'NPC',
    'auth.login': 'Login',
    'auth.logout': 'Logout',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.companyId': 'Company ID',
    'auth.magicLink': 'Magic Link',
    'auth.sendMagicLink': 'Send Magic Link',
    'auth.signIn': 'Sign In',
    'auth.forgotPassword': 'Forgot Password?',
    'nav.dashboard': 'Dashboard',
    'nav.events': 'Events',
    'nav.artists': 'Artists',
    'nav.clients': 'Clients',
    'nav.finance': 'Finance',
    'nav.calendar': 'Calendar',
    'nav.documents': 'Documents',
    'nav.settings': 'Settings',
    'dashboard.kpi.totalRevenue': 'Total Revenue',
    'dashboard.kpi.eventsThisMonth': 'Events This Month',
    'dashboard.kpi.pendingPayments': 'Pending Payments',
    'dashboard.kpi.activeClients': 'Active Clients',
    'events.new': 'New Event',
    'events.edit': 'Edit Event',
    'events.delete': 'Delete Event',
    'events.export': 'Export to Report',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.export': 'Export',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
  },
};

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem('locale') as Locale;
    return stored || 'he';
  });

  const direction: Direction = locale === 'he' ? 'rtl' : 'ltr';

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('lang', locale);
    html.setAttribute('dir', direction);
    localStorage.setItem('locale', locale);
  }, [locale, direction]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
  };

  const t = (key: string): string => {
    return translations[locale][key] || key;
  };

  return (
    <LocaleContext.Provider value={{ locale, direction, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
};

export const useLocale = () => {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
};
