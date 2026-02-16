import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, User, Bell, Lock, Palette, Globe, Users as UsersIcon, Upload, KeyRound, ClipboardCheck, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLocale } from '@/contexts/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { useAgency } from '@/contexts/AgencyContext';
import {
  getCompanyName,
  getManagedUsers,
  setManagedUsers,
  setCompanyName,
  type ManagedUser,
} from '@/lib/settingsStore';
import { supabase } from '@/lib/supabase';
import { updateFaviconForPalette } from '@/lib/favicon';
import type { IntegrationConnection } from '@/types';
import { demoGetEvents, demoGetClients, demoGetArtists, isDemoMode } from '@/lib/demoStore';
import { getFinanceExpenses } from '@/lib/financeStore';
import jsPDF from 'jspdf';

const SettingsPage: React.FC = () => {
  const { user, updateProfile, updateCurrentUser } = useAuth();
  const { currentAgency } = useAgency();
  const { theme, toggleTheme } = useTheme();
  const { locale: _locale, setLocale: _setLocale } = useLocale();
  const toast = useToast();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get('tab') || 'general') as 'general' | 'users' | 'backup' | 'training';
  const validTabs = ['general', 'users', 'backup', 'training'] as const;
  const [tab, setTabState] = useState<typeof validTabs[number]>(validTabs.includes(tabFromUrl) ? tabFromUrl : 'general');

  const setTab = useCallback((id: typeof validTabs[number]) => {
    setTabState(id);
    setSearchParams({ tab: id }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (validTabs.includes(tabFromUrl) && tabFromUrl !== tab) setTabState(tabFromUrl);
  }, [tabFromUrl]);

  const agencyId = currentAgency?.id ?? 'ima-productions-id';

  // 2FA (Supabase Auth MFA)
  type MfaFactor = { id: string; friendly_name?: string; factor_type: string; status: string };
  const [mfaFactors, setMfaFactors] = useState<MfaFactor[] | null>(null);
  const [mfaEnrollData, setMfaEnrollData] = useState<{ factorId: string; qrCode: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const loadMfaFactors = useCallback(async () => {
    if (isDemo()) return;
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setMfaFactors((data?.totp || []) as MfaFactor[]);
    } catch {
      setMfaFactors([]);
    }
  }, []);

  useEffect(() => {
    if (tab === 'general' && !isDemo()) loadMfaFactors();
  }, [tab, loadMfaFactors]);

  const startMfaEnroll = async () => {
    setMfaLoading(true);
    setMfaEnrollData(null);
    setMfaCode('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'NPC',
      });
      if (error) throw error;
      const qr = (data as any)?.totp?.qr_code;
      const id = (data as any)?.id;
      if (id && qr) setMfaEnrollData({ factorId: id, qrCode: qr });
      else toast.error('לא התקבל קוד QR');
    } catch (e: any) {
      toast.error(e?.message || 'הפעלת 2FA נכשלה');
    } finally {
      setMfaLoading(false);
    }
  };

  const verifyMfaEnroll = async () => {
    if (!mfaEnrollData?.factorId || !mfaCode.trim()) {
      toast.error('הזן את הקוד מהאפליקציה');
      return;
    }
    setMfaLoading(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaEnrollData.factorId,
        code: mfaCode.trim(),
      });
      if (error) throw error;
      toast.success('אימות דו־שלבי הופעל בהצלחה ✅');
      setMfaEnrollData(null);
      setMfaCode('');
      loadMfaFactors();
    } catch (e: any) {
      toast.error(e?.message || 'אימות נכשל — בדוק את הקוד');
    } finally {
      setMfaLoading(false);
    }
  };

  const unenrollMfa = async (factorId: string) => {
    if (!confirm('להסיר אימות דו־שלבי?')) return;
    setMfaLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success('2FA הוסר');
      loadMfaFactors();
    } catch (e: any) {
      toast.error(e?.message || 'הסרת 2FA נכשלה');
    } finally {
      setMfaLoading(false);
    }
  };

  // Branding
  const [companyName, setCompanyNameState] = useState('');

  // Users management (demo-first)
  const [managedUsers, setManagedUsersState] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUser, setNewUser] = useState<{
    full_name: string;
    email: string;
    role: ManagedUser['role'];
    permissions: NonNullable<ManagedUser['permissions']>;
  }>({
    full_name: '',
    email: '',
    role: 'producer',
    permissions: { finance: false, users: false, integrations: false, events_create: true, events_delete: false },
  });

  // Backup: sheets spreadsheet ID (from integrations table, if any)
  const [sheetsSpreadsheetId, setSheetsSpreadsheetId] = useState<string | null>(null);

  // Data backup link (e.g., Google Drive / Sheets)
  const [backupUrl, setBackupUrl] = useState('');

  // Color palette (accent) – like Chrome theme; explicit Save
  const [pendingAccentPalette, setPendingAccentPalette] = useState<string>(() => localStorage.getItem('ima_palette') || 'bw');
  const saveAccentPalette = () => {
    localStorage.setItem('ima_palette', pendingAccentPalette);
    document.documentElement.dataset.palette = pendingAccentPalette;
    updateFaviconForPalette(pendingAccentPalette);
    toast.success('צבע הדגש נשמר ✅');
  };

  const isDemo = () => isDemoMode();
  const canManageUsers = user?.role === 'owner' || user?.role === 'manager';
  const canEditPermissionLevels = user?.role === 'owner';

  // Tutorial (per-user)
  const tourDisabledKey = user?.id ? `ima_tour_disabled_${user.id}` : '';
  const tourDoneKey = user?.id ? `ima_tour_done_${user.id}` : '';
  const [tutorialAuto, setTutorialAuto] = useState(true);

  // Notifications (local-only for demo stability)
  const notifKey = `ima_notif_${agencyId}`;
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifEvents, setNotifEvents] = useState(true);
  const [notifFinance, setNotifFinance] = useState(true);

  useEffect(() => {
    // Backup: load sheets spreadsheet ID from integrations table if available.
    if (!isDemo() && currentAgency?.id) {
      (async () => {
        try {
          const { data } = await supabase
            .from('integrations')
            .select('*')
            .eq('agency_id', currentAgency.id);
          const list = (data as IntegrationConnection[]) || [];
          const sheetsConn = list.find((x: any) => x.provider === 'sheets');
          setSheetsSpreadsheetId((sheetsConn as any)?.config?.spreadsheet_id ?? null);
        } catch (e) {
          console.warn('Integrations load failed', e);
        }
      })();
    }
    setCompanyNameState(getCompanyName(agencyId) || currentAgency?.name || '');
    try {
      const raw = localStorage.getItem(`ima_backup_url_${agencyId}`);
      if (raw) setBackupUrl(raw);
    } catch {
      // ignore
    }

    // tutorial preference
    if (tourDisabledKey) {
      setTutorialAuto(localStorage.getItem(tourDisabledKey) !== 'true');
    }

    try {
      const raw = localStorage.getItem(notifKey);
      if (raw) {
        const p = JSON.parse(raw) as { email?: boolean; events?: boolean; finance?: boolean };
        setNotifEmail(p.email ?? true);
        setNotifEvents(p.events ?? true);
        setNotifFinance(p.finance ?? true);
      }
    } catch {
      // ignore
    }
  }, [agencyId]);

  // When opening Backup tab, refetch integrations so "Open backup sheet" appears after first sync
  useEffect(() => {
    if (tab !== 'backup' || isDemo() || !currentAgency?.id) return;
    (async () => {
      try {
        const { data } = await supabase.from('integrations').select('*').eq('agency_id', currentAgency.id);
        const list = (data as any[]) || [];
        const sheetsConn = list.find((x: any) => x.provider === 'sheets');
        setSheetsSpreadsheetId((sheetsConn as any)?.config?.spreadsheet_id ?? null);
      } catch {
        // ignore
      }
    })();
  }, [tab, currentAgency?.id]);

  const loadUsers = async () => {
    try {
      setUsersLoading(true);
      if (isDemo()) {
        const existing = getManagedUsers(agencyId);
        if (existing.length === 0 && user) {
          const seeded: ManagedUser[] = [
            {
              id: user.id,
              full_name: user.full_name,
              email: user.email,
              role: user.role,
              status: 'active' as const,
              created_at: new Date().toISOString(),
            },
          ];
          setManagedUsers(agencyId, seeded);
          setManagedUsersState(seeded);
        } else {
          setManagedUsersState(existing);
        }
        return;
      }

      // Fetch users (signed in) and pending_invites (added, not yet signed in)
      const [usersRes, pendingRes] = await Promise.all([
        supabase
          .from('users')
          .select('id,full_name,email,role,created_at')
          .eq('agency_id', agencyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('pending_invites')
          .select('id,email,full_name,role,created_at')
          .eq('agency_id', agencyId)
          .order('created_at', { ascending: false }),
      ]);
      if (usersRes.error) throw usersRes.error;
      const fromUsers: ManagedUser[] = (usersRes.data || []).map((u: any) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        role: u.role,
        status: 'active' as const,
        created_at: u.created_at,
      }));
      const userEmails = new Set(fromUsers.map((u) => u.email.toLowerCase()));
      const fromPending: ManagedUser[] = (pendingRes.data || [])
        .filter((p: any) => !userEmails.has((p.email || '').toLowerCase()))
        .map((p: any) => ({
          id: p.id,
          full_name: p.full_name || p.email?.split('@')[0] || '—',
          email: p.email,
          role: p.role,
          status: 'pending' as const,
          created_at: p.created_at,
        }));
      const merged = [...fromUsers, ...fromPending].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setManagedUsersState(merged);
    } catch (e) {
      console.error(e);
      toast.error('שגיאה בטעינת משתמשים');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'users') {
      loadUsers();
    }
  }, [tab, agencyId]);

  const persistNotif = (next: { email: boolean; events: boolean; finance: boolean }) => {
    localStorage.setItem(notifKey, JSON.stringify(next));
  };

  const saveBackupUrl = () => {
    const url = backupUrl.trim();
    if (!url) {
      toast.error('נא להזין קישור');
      return;
    }
    if (user?.role !== 'owner') {
      toast.error('רק Owner יכול לערוך קישור גיבוי');
      return;
    }
    try {
      localStorage.setItem(`ima_backup_url_${agencyId}`, url);
      toast.success('קישור גיבוי נשמר ✅');
    } catch (e) {
      console.error(e);
      toast.error('שמירה מקומית נכשלה');
    }
  };

  const handleSaveProfile = async () => {
    try {
      await updateProfile({ full_name: fullName });
      persistNotif({ email: notifEmail, events: notifEvents, finance: notifFinance });
      toast.success('הפרופיל עודכן ✅');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'שגיאה בעדכון פרופיל');
    }
  };

  const saveCompanyName = () => {
    const name = companyName.trim();
    if (!name) {
      toast.error('נא להזין שם חברה');
      return;
    }
    if (user?.role !== 'owner') {
      toast.error('רק Owner יכול לערוך שם חברה');
      return;
    }
    // Demo: localStorage only
    if (isDemo()) {
      setCompanyName(agencyId, name);
      toast.success('שם החברה עודכן ✅');
      return;
    }
    // Production: update agencies table (source of truth)
    (async () => {
      try {
        if (!currentAgency?.id) throw new Error('אין סוכנות פעילה');
        const { error } = await supabase.from('agencies').update({ name }).eq('id', currentAgency.id);
        if (error) throw error;
        // Keep UI consistent (Sidebar reads local settings too)
        setCompanyName(agencyId, name);
        toast.success('שם החברה עודכן ✅');
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || 'עדכון שם חברה נכשל');
      }
    })();
  };

  const resetTutorial = () => {
    if (tourDoneKey) localStorage.removeItem(tourDoneKey);
    if (tourDisabledKey) localStorage.removeItem(tourDisabledKey);
    setTutorialAuto(true);
    toast.success('ההדרכה אופסה והופעלה מחדש ✅');
  };

  const addUser = async () => {
    if (!newUser.full_name.trim() || !newUser.email.trim()) {
      toast.error('נא למלא שם ואימייל');
      return;
    }
    try {
      // Demo: persist locally for UI management
      if (isDemo()) {
        const next: ManagedUser = {
          id: globalThis.crypto?.randomUUID?.() ?? `u-${Date.now()}`,
          full_name: newUser.full_name.trim(),
          email: newUser.email.trim().toLowerCase(),
          role: newUser.role,
          status: 'active' as const,
          created_at: new Date().toISOString(),
          permissions: newUser.permissions,
        };
        const updated = [next, ...managedUsers];
        setManagedUsers(agencyId, updated);
        setManagedUsersState(updated);
        setNewUser({
          full_name: '',
          email: '',
          role: 'producer',
          permissions: { finance: false, users: false, integrations: false, events_create: true, events_delete: false },
        });
        toast.success('דמו: משתמש נוסף ✅');
        return;
      }

      if (!currentAgency?.id) throw new Error('אין סוכנות פעילה');
      // Production: add to pending_invites via RPC. User signs in with Google on first login.
      const { data: rpcData, error: rpcError } = await supabase.rpc('add_invited_user', {
        p_email: newUser.email.trim().toLowerCase(),
        p_full_name: newUser.full_name.trim(),
        p_role: newUser.role,
        p_agency_id: currentAgency.id,
        p_permissions: newUser.permissions || {},
      });
      if (rpcError) throw rpcError;
      const res = rpcData as { ok?: boolean; error?: string } | null;
      if (!res?.ok) {
        toast.error(res?.error || 'הוספת משתמש נכשלה');
        return;
      }
      toast.success('המשתמש נוסף. המשתמש יתחבר באמצעות Google בכניסה הראשונה.');
      setNewUser({
        full_name: '',
        email: '',
        role: 'producer',
        permissions: { finance: false, users: false, integrations: false, events_create: true, events_delete: false },
      });
      loadUsers();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'הוספת משתמש נכשלה');
    }
  };

  const updateUserRole = (id: string, role: ManagedUser['role']) => {
    if (!isDemo()) return;
    const updated = managedUsers.map(u => (u.id === id ? { ...u, role } : u));
    setManagedUsers(agencyId, updated);
    setManagedUsersState(updated);
    if (id === user?.id) {
      updateCurrentUser({ role }).catch(() => {});
    }
    toast.success('תפקיד עודכן ✅');
  };

  const toggleUserStatus = (id: string) => {
    if (!isDemo()) return;
    const updated: ManagedUser[] = managedUsers.map(u =>
      u.id === id
        ? { ...u, status: (u.status === 'active' ? 'disabled' : 'active') as ManagedUser['status'] }
        : u
    );
    setManagedUsers(agencyId, updated);
    setManagedUsersState(updated);
    toast.success('סטטוס עודכן ✅');
  };

  const tabButton = (id: typeof tab, label: string, Icon: any) => (
    <Button
      type="button"
      variant={tab === id ? 'default' : 'outline'}
      size="sm"
      className={`modu-icon-text gap-2 ${tab === id ? 'btn-magenta' : 'border-primary/30'}`}
      onClick={() => setTab(id)}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </Button>
  );

  const roleLabel = (role: ManagedUser['role']) =>
    role === 'owner' ? 'בעלים' : role === 'manager' ? 'מנהל' : role === 'finance' ? 'כספים' : 'מפיק';

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="modu-icon-text gap-2 mb-6"
      >
        <div className="modu-icon-wrap w-10 h-10 [&>svg]:w-5 [&>svg]:h-5">
          <SettingsIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">הגדרות</h1>
          <p className="text-muted-foreground text-sm mt-0.5">נהל את העדפות החשבון והמערכת שלך</p>
        </div>
      </motion.div>

      {/* Unified Sheet: Tabbed layout */}
      <Card className="modu-elevation-2 overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {tabButton('general', 'כללי', SettingsIcon)}
            {canManageUsers ? tabButton('users', 'משתמשים', UsersIcon) : null}
            {user?.role === 'owner' ? tabButton('backup', 'גיבוי נתונים', Globe) : null}
            {tabButton('training', 'הדרכה ומידע', KeyRound)}
          </div>
        </div>
        <div className="p-6">
      {tab === 'general' && (
        <div className="modu-grid-12 grid-cols-1 lg:grid-cols-12">
          {/* Profile */}
          <div className="lg:col-span-6">
          <Card className="border-border modu-elevation-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                פרופיל
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-foreground">שם מלא</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="border-primary/30" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">אימייל</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border-primary/30" disabled />
                <p className="text-xs text-muted-foreground">לא ניתן לשנות את כתובת האימייל</p>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">תפקיד</Label>
                <div className="px-3 py-2 bg-primary/10 border border-primary/30 rounded-md">
                  <span className="text-primary font-semibold">{user?.role ? roleLabel(user.role as any) : '-'}</span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">הדרכה אוטומטית</div>
                    <div className="text-xs text-muted-foreground">הצג/הסתר את ההדרכה בכל כניסה (לפי משתמש).</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={tutorialAuto}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setTutorialAuto(next);
                      if (tourDisabledKey) {
                        localStorage.setItem(tourDisabledKey, next ? 'false' : 'true');
                      }
                      toast.success(next ? 'הדרכה אוטומטית הופעלה ✅' : 'הדרכה אוטומטית הושבתה ✅');
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  טיפ לדמו: אפשר להשבית כדי שלא תופיע באמצע הצגה.
                </div>
              </div>

              <Button onClick={handleSaveProfile} className="w-full btn-magenta">שמור</Button>
            </CardContent>
          </Card>
          </div>

          {/* Appearance */}
          <div className="lg:col-span-6">
          <Card className="border-border modu-elevation-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                מראה ותצוגה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">ערכת צבעים</Label>
                <div className="flex gap-2">
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    onClick={() => { if (theme !== 'dark') toggleTheme(); toast.success('עברת למצב כהה'); }}
                    className={theme === 'dark' ? 'btn-magenta flex-1' : 'flex-1'}
                    type="button"
                  >
                    כהה
                  </Button>
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    onClick={() => { if (theme !== 'light') toggleTheme(); toast.success('עברת למצב בהיר'); }}
                    className={theme === 'light' ? 'btn-magenta flex-1' : 'flex-1'}
                    type="button"
                  >
                    בהיר
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">צבע דגש (כמו Chrome)</Label>
                <div className="flex gap-2 items-center">
                  <Select value={pendingAccentPalette} onValueChange={setPendingAccentPalette}>
                    <SelectTrigger className="border-primary/30 flex-1">
                      <SelectValue placeholder="בחר צבע" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bw">שחור‑לבן (ברירת מחדל)</SelectItem>
                      <SelectItem value="magenta">מג׳נטה</SelectItem>
                      <SelectItem value="blue">כחול</SelectItem>
                      <SelectItem value="green">ירוק</SelectItem>
                      <SelectItem value="purple">סגול</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" className="btn-magenta shrink-0" onClick={saveAccentPalette}>
                    שמור צבע
                  </Button>
                </div>
              </div>

              {/* Language option removed — interface is Hebrew only */}
            </CardContent>
          </Card>
          </div>

          {/* Branding — compact card to fit content only */}
          <div className="lg:col-span-6">
          <Card className="border-border modu-elevation-1 w-full max-w-xl">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="w-5 h-5 text-primary" />
                מיתוג
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-2">
                <Label className="text-foreground">שם חברה (מחליף “NPC”)</Label>
                <div className="flex gap-2">
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyNameState(e.target.value)}
                    className="border-primary/30"
                    placeholder="לדוגמה: NPC"
                    disabled={user?.role !== 'owner'}
                  />
                  <Button type="button" className="btn-magenta shrink-0" onClick={saveCompanyName} disabled={user?.role !== 'owner'}>
                    שמור
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>

          {/* Notifications + Security (kept) */}
          <div className="lg:col-span-6">
          <Card className="border-border modu-elevation-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                התראות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-foreground font-medium">התראות במייל</p>
                    <p className="text-xs text-muted-foreground">מיועד לשינויים מערכתיים וקישורי התחברות.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifEmail}
                    onChange={(e) => {
                      setNotifEmail(e.target.checked);
                      toast.info('עודכן (יישמר בלחיצה על “שמור”)');
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-foreground font-medium">התראות אירועים</p>
                    <p className="text-xs text-muted-foreground">יצירה/עדכון/ביטול אירוע, תזכורות לפני אירוע.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifEvents}
                    onChange={(e) => {
                      setNotifEvents(e.target.checked);
                      toast.info('עודכן (יישמר בלחיצה על “שמור”)');
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-foreground font-medium">התראות כספים</p>
                    <p className="text-xs text-muted-foreground">חשבוניות/קבלות, תשלומים, העלאת הוצאות, סנכרון Morning.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifFinance}
                    onChange={(e) => {
                      setNotifFinance(e.target.checked);
                      toast.info('עודכן (יישמר בלחיצה על “שמור”)');
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                </div>
                <Button type="button" className="btn-magenta w-full mt-2" onClick={() => { persistNotif({ email: notifEmail, events: notifEvents, finance: notifFinance }); toast.success('הגדרות ההתראות נשמרו ✅'); }}>
                  שמור הגדרות התראות
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                כאן ניתן לשלוט בסוגי ההתראות. שליחה בפועל למייל/Push תתווסף כאשר נחבר Backend מלא.
              </div>
            </CardContent>
          </Card>

          {/* Help / Guides */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                מדריך לפי תפקיד + הדרכה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="font-semibold text-foreground mb-1">מה רואים במערכת לפי הרשאה</div>
                {user?.role === 'producer' ? (
                  <ul className="text-muted-foreground list-disc pr-5 space-y-1">
                    <li>גישה: דשבורד, אירועים, יומן, אמנים, לקוחות, מסמכים</li>
                    <li>מוגבל: אין לשונית “כספים”, לא מוצגים סכומים רגישים</li>
                    <li>מוגבל: אין ניהול משתמשים/אינטגרציות</li>
                  </ul>
                ) : user?.role === 'finance' ? (
                  <ul className="text-muted-foreground list-disc pr-5 space-y-1">
                    <li>גישה: כספים (הוצאות, צ׳ק-ליסט, דוחות)</li>
                    <li>גישה: אירועים/מסמכים כדי להשלים מסמכים ותשלומים</li>
                    <li>מוגבל: ניהול משתמשים (אלא אם מנהל/בעלים)</li>
                  </ul>
                ) : user?.role === 'manager' ? (
                  <ul className="text-muted-foreground list-disc pr-5 space-y-1">
                    <li>גישה מלאה לניהול מערכת, כולל משתמשים</li>
                    <li>גישה לאינטגרציות והגדרות ארגון</li>
                  </ul>
                ) : (
                  <ul className="text-muted-foreground list-disc pr-5 space-y-1">
                    <li>גישה מלאה לכל הלשוניות והתוכן</li>
                    <li>ניהול משתמשים, אינטגרציות, מיתוג, דוחות</li>
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="font-semibold text-foreground">מדריך כתוב לפי תפקיד (מלא)</div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="text-sm font-semibold text-primary mb-2">בעלים (Owner)</div>
                    <ul className="list-disc pr-5 space-y-1">
                      <li>הגדרת מיתוג (שם חברה/לוגו) וחוויית משתמש.</li>
                      <li>ניהול משתמשים והרשאות, שליחת לינקי התחברות.</li>
                      <li>חיבור אינטגרציות (Morning/Drive/Calendar) והגדרת מפתחות.</li>
                      <li>שליטה מלאה בכספים, דוחות, והיסטוריית פעילות.</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="text-sm font-semibold text-primary mb-2">מנהל (Manager)</div>
                    <ul className="list-disc pr-5 space-y-1">
                      <li>גישה מלאה לניהול תפעולי (אירועים, לקוחות, אמנים, מסמכים).</li>
                      <li>ניהול משתמשים, תפקידים, ושיוך עבודה.</li>
                      <li>גישה לאינטגרציות ברמת ארגון.</li>
                      <li>גישה לדוחות/תובנות לפי מדיניות הארגון.</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="text-sm font-semibold text-primary mb-2">כספים (Finance)</div>
                    <ul className="list-disc pr-5 space-y-1">
                      <li>העלאת הוצאות (קבצים), עריכת נתונים, סנכרון Morning.</li>
                      <li>דוחות יצוא (Excel/Sheets) ובקרה חודשית.</li>
                      <li>גישה לאירועים/מסמכים לצורך חיוב/תיעוד.</li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="text-sm font-semibold text-primary mb-2">מפיק (Producer)</div>
                    <ul className="list-disc pr-5 space-y-1">
                      <li>יצירה וניהול אירועים, יומן, אמנים/לקוחות, ומסמכים.</li>
                      <li>אין גישה לכספים (המערכת מסתירה סכומים/לשוניות רגישות).</li>
                      <li>אין ניהול משתמשים/אינטגרציות.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={resetTutorial}>
                  הפעל הדרכה מחדש
                </Button>
                <Button
                  type="button"
                  className="btn-magenta"
                  onClick={() => {
                    resetTutorial();
                    window.location.assign('/dashboard?tour=1');
                  }}
                >
                  פתח הדרכה בדשבורד
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                אבטחה
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                ניהול סיסמה, אימות דו־שלבי והגדרות גישה לחשבון.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
                <div className="text-sm font-semibold text-foreground">חשבון והתחברות</div>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-2 py-2 border-b border-border/60">
                    <span className="text-muted-foreground">אימייל</span>
                    <span className="text-foreground font-mono text-xs">{user?.email || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-2 border-b border-border/60">
                    <span className="text-muted-foreground">שם מלא</span>
                    <span className="text-foreground">{user?.full_name || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-2">
                    <span className="text-muted-foreground">תפקיד</span>
                    <span className="text-foreground">{user?.role === 'owner' ? 'בעלים' : user?.role === 'manager' ? 'מנהל' : user?.role === 'finance' ? 'כספים' : 'מפיק'}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
                <div className="text-sm font-semibold text-foreground">אבטחת חשבון</div>
                <div className="flex flex-col gap-2">
                  <Button type="button" className="w-full justify-start" variant="outline" onClick={() => toast.info('שינוי סיסמה - בקרוב (דמו)')}>
                    <KeyRound className="w-4 h-4 ml-2" />
                    שנה סיסמה
                  </Button>
                  <p className="text-xs text-muted-foreground">עדכון סיסמת ההתחברות לחשבון.</p>
                  {isDemo() ? (
                    <>
                      <Button type="button" className="w-full justify-start" variant="outline" onClick={() => toast.info('אימות דו־שלבי - זמין בפרודקשן')}>
                        <Lock className="w-4 h-4 ml-2" />
                        אימות דו־שלבי (2FA)
                      </Button>
                      <p className="text-xs text-muted-foreground">בדמו לא זמין. בפרודקשן: סרוק QR באפליקציה (Google Authenticator וכו׳) והזן קוד.</p>
                    </>
                  ) : mfaEnrollData ? (
                    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="text-sm font-medium text-foreground">סרוק את ה-QR באפליקציית אימות</p>
                      <img src={mfaEnrollData.qrCode} alt="TOTP QR" className="h-32 w-32 rounded border bg-white" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          placeholder="קוד 6 ספרות"
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-28 font-mono"
                          maxLength={6}
                        />
                        <Button type="button" className="btn-magenta" onClick={verifyMfaEnroll} disabled={mfaLoading || mfaCode.length !== 6}>
                          {mfaLoading ? '...' : 'אמת והפעל'}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => { setMfaEnrollData(null); setMfaCode(''); }}>
                          ביטול
                        </Button>
                      </div>
                    </div>
                  ) : (mfaFactors?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-green-600 font-medium flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        אימות דו־שלבי מופעל
                      </p>
                      {mfaFactors?.map((f) => (
                        <div key={f.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
                          <span className="text-sm">{f.friendly_name || f.factor_type || f.id.slice(0, 8)}</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => unenrollMfa(f.id)} disabled={mfaLoading}>
                            הסר
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <Button type="button" className="w-full justify-start" variant="outline" onClick={startMfaEnroll} disabled={mfaLoading}>
                        <Lock className="w-4 h-4 ml-2" />
                        {mfaLoading ? 'טוען...' : 'הפעל אימות דו־שלבי (2FA)'}
                      </Button>
                      <p className="text-xs text-muted-foreground">סרוק QR באפליקציה (Google Authenticator, Authy וכו׳) והזן קוד לאימות.</p>
                    </>
                  )}
                  <Button type="button" className="w-full justify-start" variant="outline" onClick={() => toast.info('SSO / Passkeys - בקרוב (דמו)')}>
                    <Lock className="w-4 h-4 ml-2" />
                    SSO / Passkeys (2026)
                  </Button>
                  <p className="text-xs text-muted-foreground">התחברות ללא סיסמה (תמיכה עתידית).</p>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      {tab === 'users' && (
        !canManageUsers ? (
          <Card className="border-border modu-elevation-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-primary" />
                ניהול משתמשים
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              אין לך הרשאה לניהול משתמשים. רק בעלים/מנהל יכולים לגשת למסך זה.
            </CardContent>
          </Card>
        ) : (
        <div className="space-y-6">
          <Card className="border-border modu-elevation-1">
            <CardHeader>
              <CardTitle className="modu-icon-text gap-2">
                <UsersIcon className="w-5 h-5 text-primary" />
                ניהול משתמשים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canEditPermissionLevels && (
                <div className="text-sm text-muted-foreground">
                  צפייה בלבד: רק <span className="text-foreground font-semibold">בעלים</span> יכול לערוך תפקידים/יכולות (Checkbox).
                </div>
              )}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                <div className="text-sm font-semibold text-foreground">הוספת משתמש</div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <Input placeholder="שם מלא" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
                  <Input placeholder="אימייל" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                  <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="producer">מפיק</SelectItem>
                      <SelectItem value="finance">כספים</SelectItem>
                      <SelectItem value="manager">מנהל</SelectItem>
                      <SelectItem value="owner">בעלים</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" className="btn-magenta" onClick={addUser} disabled={!canManageUsers}>
                    הוסף משתמש
                  </Button>
                </div>
              </div>

              {usersLoading ? (
                <div className="text-sm text-muted-foreground">טוען משתמשים...</div>
              ) : managedUsers.length === 0 ? (
                <div className="text-sm text-muted-foreground">אין משתמשים להצגה.</div>
              ) : (
                <div className="overflow-x-auto lg:overflow-visible rounded-md border table-scroll-wrap">
                  <table className="w-full text-sm min-w-[600px] lg:min-w-0">
                    <thead className="border-b bg-muted/50 dark:bg-gray-800/80">
                      <tr>
                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">שם</th>
                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">אימייל</th>
                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">תפקיד</th>
                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">סטטוס</th>
                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">פעולות</th>
                        <th className="h-10 px-3 text-right font-medium text-muted-foreground">הזמנה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managedUsers.map(u => (
                        <tr key={u.id} className="border-b">
                          <td className="p-3">{u.full_name}</td>
                          <td className="p-3">{u.email}</td>
                          <td className="p-3">
                            {isDemo() ? (
                              <Select value={u.role} onValueChange={(v) => updateUserRole(u.id, v as any)} disabled={!canEditPermissionLevels}>
                                <SelectTrigger className="h-9 w-[140px]" title={!canEditPermissionLevels ? 'רק בעלים יכול לערוך תפקיד' : undefined}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="producer">מפיק</SelectItem>
                                  <SelectItem value="finance">כספים</SelectItem>
                                  <SelectItem value="manager">מנהל</SelectItem>
                                  <SelectItem value="owner">בעלים</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-muted-foreground">{roleLabel(u.role)}</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={
                              u.status === 'active' ? 'text-green-500' :
                              u.status === 'pending' ? 'text-amber-600' : 'text-red-500'
                            }>
                              {u.status === 'active' ? 'פעיל' : u.status === 'pending' ? 'ממתין להתחברות' : 'מושבת'}
                            </span>
                          </td>
                          <td className="p-3">
                            {u.status === 'pending' ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : isDemo() ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!canEditPermissionLevels}
                                title={!canEditPermissionLevels ? 'רק בעלים יכול להשבית/להפעיל משתמש' : undefined}
                                onClick={() => toggleUserStatus(u.id)}
                              >
                                {u.status === 'active' ? 'השבת' : 'הפעל'}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        <td className="p-3">
                          {u.status === 'pending' ? (
                            <span className="text-xs text-amber-600">ממתין להתחברות</span>
                          ) : isDemo() ? (
                            <a href="/login" className="text-sm text-primary hover:underline">דף כניסה</a>
                          ) : (
                            <span className="text-xs text-muted-foreground">התחברות באמצעות Google</span>
                          )}
                        </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        )
      )}

      {tab === 'training' && (
        <div className="space-y-6 max-w-4xl">
          {/* Training Files & Guides */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                חומרי הדרכה ומסמכים
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                קבצים, מדריכים וחומרי לימוד למשתמשי המערכת.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: 'מדריך למשתמש חדש', desc: 'צעדים ראשונים במערכת: הגדרת פרופיל, יצירת אירוע ראשון, חיבור יומן.', action: 'הפעל הדרכה', onClick: () => { resetTutorial(); window.location.assign('/dashboard?tour=1'); } },
                  { title: 'מדריך לפי תפקיד', desc: 'הרשאות ויכולות לפי תפקיד — בעלים, מנהל, כספים, מפיק.', action: 'קרא עוד', onClick: () => setTab('general') },
                  { title: 'גיבוי ויצוא נתונים', desc: 'איך לגבות את כל הנתונים ולייצא דוחות ל-Excel.', action: 'גיבוי נתונים', onClick: () => setTab('backup') },
                ].map((item) => (
                  <div key={item.title} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2 hover:bg-primary/5 transition-colors">
                    <div className="font-semibold text-foreground text-sm">{item.title}</div>
                    <p className="text-xs text-muted-foreground flex-1">{item.desc}</p>
                    <Button type="button" variant="outline" size="sm" className="self-start mt-1" onClick={item.onClick}>
                      {item.action}
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="btn-magenta"
                  onClick={() => {
                    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                    pdf.setFont('helvetica');
                    pdf.setFontSize(14);
                    pdf.setR2L(true);
                    pdf.text('NPC — מדריך משתמש', 200, 20, { align: 'right' });
                    pdf.setFontSize(10);
                    const sections = [
                      { h: 'מדריך לפי תפקיד', lines: ['בעלים: מיתוג, ניהול משתמשים, כספים.', 'מנהל: ניהול תפעולי, משתמשים, דוחות.', 'כספים: הוצאות, Excel/Sheets.', 'מפיק: אירועים, יומן, אמנים, לקוחות (ללא סכומים).'] },
                      { h: 'גיבוי ויצוא', lines: ['הגדרות > גיבוי נתונים.', 'ייצוא ל-Excel מדף פיננסים.'] },
                    ];
                    let y = 30;
                    sections.forEach(s => {
                      if (y > 260) { pdf.addPage(); y = 20; pdf.setR2L(true); }
                      pdf.setFontSize(11);
                      pdf.text(s.h, 200, y, { align: 'right' });
                      y += 8;
                      pdf.setFontSize(10);
                      s.lines.forEach(l => {
                        if (y > 270) { pdf.addPage(); y = 20; pdf.setR2L(true); }
                        pdf.text(l, 200, y, { align: 'right' });
                        y += 6;
                      });
                      y += 6;
                    });
                    pdf.save(`npc-guide-${new Date().toISOString().slice(0, 10)}.pdf`);
                    toast.success('מדריך המשתמש הורד');
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  הורד מדריך משתמש (PDF)
                </Button>
                <Button type="button" variant="outline" onClick={resetTutorial}>
                  אפס והפעל הדרכה מחדש
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* FAQ Section */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                שאלות ותשובות
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                שאלות נפוצות על השימוש במערכת NPC.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { q: 'איך מוסיפים אירוע חדש?', a: 'לחצו על "אירוע חדש" בדשבורד (יפתח טופס מהיר) או עברו לדף אירועים ולחצו "אירוע חדש". מלאו את הפרטים ושמרו.' },
                { q: 'איך מזמינים משתמש חדש למערכת?', a: 'הגדרות → משתמשים → הוספת משתמש. הזינו שם, אימייל ותפקיד. המערכת תשלח קישור התחברות למייל.' },
                { q: 'איך מייצאים אירועים ליומן?', a: 'בדף אירועים או יומן ניתן להוסיף אירועים ל-Google Calendar באמצעות "הוסף ל-Google Calendar".' },
                { q: 'איך מייצאים דוח?', a: 'בדף פיננסים → לחצו "ייצוא". ניתן לייצא ל-Excel או ל-Google Sheets. בחרו טווח תאריכים ולחצו ייצא.' },
                { q: 'מה ההבדל בין התפקידים?', a: 'בעלים: גישה מלאה. מנהל: גישה מלאה חוץ ממיתוג. כספים: כספים ומסמכים. מפיק: אירועים, יומן, אמנים ולקוחות (ללא סכומים).' },
                { q: 'איך מתחברים לחשבוניות?', a: 'המערכת משתמשת ב-Google SSO להתחברות. חשבוניות והוצאות מנוהלים בדף פיננסים.' },
                { q: 'למה אני לא רואה סכומים?', a: 'אם התפקיד שלך הוא מפיק (Producer), סכומים מוסתרים. בקשו מהבעלים לשנות את ההרשאות.' },
                { q: 'איך מגבים את הנתונים?', a: 'הגדרות → גיבוי נתונים. אפשר להעתיק ללוח, להוריד JSON, או לסנכרן עם Google Sheets.' },
                { q: 'איך ממלאים פרטי אמן מלאים?', a: 'אמנים → עריכת אמן. מלאו: Google Calendar Email (לסנכרון יומן), צבע ביומן, פרטי בנק, ח.פ.' },
                { q: 'מה קורה אם שכחתי סיסמה?', a: 'המערכת משתמשת ב-Magic Link — אין סיסמה. קישור כניסה חד-פעמי נשלח למייל בכל התחברות.' },
              ].map((item, i) => (
                <details key={i} className="group rounded-lg border border-border bg-card">
                  <summary className="cursor-pointer p-3 text-sm font-medium text-foreground hover:bg-primary/5 rounded-lg list-none flex items-center justify-between">
                    <span>{item.q}</span>
                    <span className="text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="px-3 pb-3 text-sm text-muted-foreground border-t border-border/60 pt-2">
                    {item.a}
                  </div>
                </details>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'backup' && (
        user?.role !== 'owner' ? (
          <Card className="border-primary/20 max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                גיבוי נתונים
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              רק Owner יכול לנהל קישור גיבוי.
            </CardContent>
          </Card>
        ) : (
          <div className="max-w-2xl space-y-6">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  קישור גיבוי (Google Drive / Sheets)
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  שמור קישור לתיקייה או גיליון ב־Drive; ייצא נתונים להעתקה או הורדה.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isDemo() && sheetsSpreadsheetId && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <Label className="text-foreground">גיליון גיבוי אירועים (Google Sheets)</Label>
                    <p className="text-xs text-muted-foreground">
                      הגיליון נוצר אוטומטית עם יצירת הנתונים הראשונים ומתעדכן בסנכרון.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${sheetsSpreadsheetId}/edit`, '_blank', 'noopener,noreferrer')}
                    >
                      פתח גיליון גיבוי ב־Sheets
                    </Button>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-foreground">קישור לקובץ/תיקיית גיבוי</Label>
                  <Input
                    value={backupUrl}
                    onChange={(e) => setBackupUrl(e.target.value)}
                    placeholder="הדבק/י כאן קישור שיתוף (Drive/Sheets)"
                    className="border-primary/30 w-full"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="btn-magenta" onClick={saveBackupUrl}>
                      שמור
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const url = backupUrl.trim();
                        if (!url) return toast.error('אין קישור לפתיחה');
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      פתח ב־Drive
                    </Button>
                  </div>
                </div>
                <div className="border-t border-border pt-4 mt-4 space-y-3">
                  <Label className="text-foreground">ייצוא גיבוי (אירועים, לקוחות, אמנים, הוצאות)</Label>
                  <p className="text-xs text-muted-foreground">
                    העתק ללוח או הורד JSON והעלה/הדבק ב־Drive.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        try {
                          const events = isDemoMode() ? demoGetEvents(agencyId) : [];
                          const clients = isDemoMode() ? demoGetClients(agencyId) : [];
                          const artists = isDemoMode() ? demoGetArtists(agencyId) : [];
                          const expenses = getFinanceExpenses(agencyId);
                          const payload = {
                            exportedAt: new Date().toISOString(),
                            agencyId,
                            companyName: getCompanyName(agencyId) || currentAgency?.name,
                            events,
                            clients,
                            artists,
                            expenses: expenses.map(e => ({ id: e.id, filename: e.filename, amount: e.amount, vendor: e.vendor, created_at: e.created_at, notes: e.notes })),
                          };
                          const str = JSON.stringify(payload, null, 2);
                          navigator.clipboard.writeText(str);
                          toast.success('גיבוי הועתק ללוח — הדבק בקובץ Drive');
                        } catch (e) {
                          console.error(e);
                          toast.error('העתקה נכשלה');
                        }
                      }}
                    >
                      העתק גיבוי ללוח
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        try {
                          const events = isDemoMode() ? demoGetEvents(agencyId) : [];
                          const clients = isDemoMode() ? demoGetClients(agencyId) : [];
                          const artists = isDemoMode() ? demoGetArtists(agencyId) : [];
                          const expenses = getFinanceExpenses(agencyId);
                          const payload = {
                            exportedAt: new Date().toISOString(),
                            agencyId,
                            companyName: getCompanyName(agencyId) || currentAgency?.name,
                            events,
                            clients,
                            artists,
                            expenses: expenses.map(e => ({ id: e.id, filename: e.filename, amount: e.amount, vendor: e.vendor, created_at: e.created_at, notes: e.notes })),
                          };
                          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = `ima-backup-${agencyId}-${new Date().toISOString().slice(0, 10)}.json`;
                          a.click();
                          URL.revokeObjectURL(a.href);
                          toast.success('קובץ גיבוי הורד');
                        } catch (e) {
                          console.error(e);
                          toast.error('הורדה נכשלה');
                        }
                      }}
                    >
                      הורד גיבוי (JSON)
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  טיפ: שמור כאן את קישור ה־Google Sheet/Drive שמשמש לגיבוי חיצוני.
                </p>
              </CardContent>
            </Card>
          </div>
        )
      )}
        </div>
      </Card>
    </div>
  );
};

export default SettingsPage;

