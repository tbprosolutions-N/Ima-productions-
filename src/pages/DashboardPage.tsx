import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles, Calendar, DollarSign, FileText, TrendingUp, ClipboardList,
  Plus, Bell, Activity, AlertTriangle, CheckCircle, Clock, Users, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useAuth } from '@/contexts/AuthContext';
import { useAgency } from '@/contexts/AgencyContext';
import { supabase } from '@/lib/supabase';
import { demoGetEvents, demoGetClients, demoGetArtists, isDemoMode } from '@/lib/demoStore';
import { getFinanceExpenses } from '@/lib/financeStore';
import { getActivity, type ActivityEntry } from '@/lib/activityLog';
import type { Event, Artist, Client } from '@/types';

/* ─── Dashboard Stats Hook ─── */
function useDashboardStats(agencyId: string | undefined) {
  const [events, setEvents] = useState<Event[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsCount, setClientsCount] = useState(0);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    if (isDemoMode()) {
      const ev = demoGetEvents(agencyId);
      const cl = demoGetClients(agencyId);
      const ar = demoGetArtists(agencyId);
      const expenses = getFinanceExpenses(agencyId);
      if (!cancelled) {
        setEvents(ev);
        setClients(cl);
        setArtists(ar);
        setClientsCount(cl.length);
        setExpensesTotal(expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0));
      }
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const [evRes, clientsRes, artistsRes, expRes] = await Promise.all([
          supabase.from('events').select('*').eq('agency_id', agencyId).order('event_date', { ascending: false }).limit(500),
          supabase.from('clients').select('*').eq('agency_id', agencyId).order('name', { ascending: true }),
          supabase.from('artists').select('*').eq('agency_id', agencyId).order('name', { ascending: true }),
          supabase.from('finance_expenses').select('amount').eq('agency_id', agencyId),
        ]);

        if (cancelled) return;
        const evList = (evRes.data || []) as Event[];
        const clList = (clientsRes.data || []) as Client[];
        const arList = (artistsRes.data || []) as Artist[];
        setEvents(evList);
        setClients(clList);
        setArtists(arList);
        setClientsCount(clList.length);
        const expTotal = ((expRes.data || []) as { amount: number }[]).reduce((s, x) => s + (Number(x?.amount) || 0), 0);
        setExpensesTotal(expTotal);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [agencyId]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const nextMonthFrom = nextMonthStart.toISOString().slice(0, 10);
    const nextMonthTo = nextMonthEnd.toISOString().slice(0, 10);
    const eventsNextMonth = events.filter(e => {
      const d = (e.event_date || '').toString().slice(0, 10);
      return d >= nextMonthFrom && d <= nextMonthTo;
    });
    const activeEvents = events.filter(e => {
      const d = (e.event_date || '').toString().slice(0, 10);
      return d >= today && e.status !== 'cancelled';
    });
    const pendingEvents = events.filter(e => e.status === 'pending' || e.status === 'approved');
    const collectedEvents = events.filter(e => e.status === 'paid');
    const expectedIncome = events.filter(e => e.status !== 'cancelled').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const collectedTotal = collectedEvents.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const pendingTotal = pendingEvents.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const nextMonthIncome = eventsNextMonth.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const activeTotal = activeEvents.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    return {
      eventsNextMonthCount: eventsNextMonth.length,
      eventsNextMonthIncome: nextMonthIncome,
      activeEventsCount: activeEvents.length,
      activeEventsTotal: activeTotal,
      expensesTotal,
      pendingCount: pendingEvents.length,
      pendingTotal,
      collectedTotal,
      expectedIncome,
      clientsCount,
    };
  }, [events, expensesTotal, clientsCount]);

  return { stats, events, artists, clients, loading };
}

/* ─── Notification Generator ─── */
interface Notification {
  id: string;
  type: 'warning' | 'info' | 'success';
  message: string;
  icon: React.ReactNode;
}

function generateNotifications(events: Event[], artists: Artist[]): Notification[] {
  const notifications: Notification[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // Check for artist double-bookings (same artist, same day)
  const artistDateMap = new Map<string, Event[]>();
  events.forEach(ev => {
    if (!ev.artist_id || ev.status === 'cancelled') return;
    const key = `${ev.artist_id}_${(ev.event_date || '').toString().slice(0, 10)}`;
    if (!artistDateMap.has(key)) artistDateMap.set(key, []);
    artistDateMap.get(key)!.push(ev);
  });
  artistDateMap.forEach((evs, key) => {
    if (evs.length >= 2) {
      const artistId = key.split('_')[0];
      const date = key.split('_')[1];
      const artist = artists.find(a => a.id === artistId);
      notifications.push({
        id: `double-${key}`,
        type: 'warning',
        message: `${artist?.name || 'אמן'} מופיע ${evs.length} פעמים ב-${date}. ודא שאין חפיפה בשעות.`,
        icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
      });
    }
  });

  // Upcoming events in the next 7 days
  const upcoming = events.filter(e => {
    const d = (e.event_date || '').toString().slice(0, 10);
    return d >= today && d <= nextWeek && e.status !== 'cancelled';
  });
  if (upcoming.length > 0) {
    notifications.push({
      id: 'upcoming-week',
      type: 'info',
      message: `${upcoming.length} אירועים בשבוע הקרוב`,
      icon: <Calendar className="w-4 h-4 text-blue-500" />,
    });
  }

  // Pending invoices that need attention
  const pendingOld = events.filter(e => {
    const d = (e.event_date || '').toString().slice(0, 10);
    return d < today && (e.status === 'pending' || e.status === 'approved');
  });
  if (pendingOld.length > 0) {
    notifications.push({
      id: 'pending-overdue',
      type: 'warning',
      message: `${pendingOld.length} חשבוניות ממתינות שעבר תאריך האירוע שלהן`,
      icon: <Clock className="w-4 h-4 text-amber-500" />,
    });
  }

  // Events without assigned artist
  const noArtist = events.filter(e => {
    const d = (e.event_date || '').toString().slice(0, 10);
    return d >= today && !e.artist_id && e.status !== 'cancelled';
  });
  if (noArtist.length > 0) {
    notifications.push({
      id: 'no-artist',
      type: 'info',
      message: `${noArtist.length} אירועים עתידיים ללא אמן משובץ`,
      icon: <Users className="w-4 h-4 text-blue-500" />,
    });
  }

  if (notifications.length === 0) {
    notifications.push({
      id: 'all-good',
      type: 'success',
      message: 'הכול תקין! אין התראות חדשות.',
      icon: <CheckCircle className="w-4 h-4 text-green-500" />,
    });
  }

  return notifications;
}

/* ─── Quick New Event Dialog ─── */
const QuickNewEventDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  clients: Client[];
  artists: Artist[];
  onCreated: () => void;
}> = ({ open, onOpenChange, agencyId, clients, artists, onCreated }) => {
  const [form, setForm] = useState({
    business_name: '',
    event_date: new Date().toISOString().slice(0, 10),
    amount: '',
    client_id: '',
    artist_id: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.business_name.trim()) return;
    setSaving(true);
    try {
      const eventDate = new Date(form.event_date);
      const weekdays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
      const payload = {
        agency_id: agencyId,
        producer_id: agencyId,
        business_name: form.business_name.trim(),
        invoice_name: form.business_name.trim(),
        event_date: form.event_date,
        weekday: weekdays[eventDate.getDay()],
        amount: Number(form.amount) || 0,
        doc_type: 'tax_invoice' as const,
        status: 'draft' as const,
        client_id: form.client_id || undefined,
        artist_id: form.artist_id || undefined,
        notes: form.notes || undefined,
      };

      if (isDemoMode()) {
        const { demoSetEvents, demoGetEvents } = await import('@/lib/demoStore');
        const existing = demoGetEvents(agencyId);
        const newEvent = {
          ...payload,
          id: globalThis.crypto?.randomUUID?.() ?? `ev-${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        demoSetEvents(agencyId, [newEvent, ...existing]);
      } else {
        const { error } = await supabase.from('events').insert(payload);
        if (error) throw error;
      }

      onCreated();
      onOpenChange(false);
      setForm({ business_name: '', event_date: new Date().toISOString().slice(0, 10), amount: '', client_id: '', artist_id: '', notes: '' });
    } catch (err: any) {
      console.error('Quick event creation failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>אירוע חדש (מהיר)</DialogTitle>
          <DialogDescription>צור אירוע חדש ישירות מהדשבורד</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>שם עסק / אירוע *</Label>
              <Input value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label>תאריך</Label>
              <Input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>סכום (₪)</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>לקוח</Label>
              <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>אמן</Label>
              <Select value={form.artist_id} onValueChange={v => setForm(f => ({ ...f, artist_id: v }))}>
                <SelectTrigger><SelectValue placeholder="בחר אמן" /></SelectTrigger>
                <SelectContent>
                  {artists.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>הערות</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="הערות אופציונליות" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button type="submit" className="btn-magenta" disabled={saving}>
              {saving ? 'יוצר...' : 'צור אירוע'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/* ─── Activity Log Section ─── */
const ActivityLogSection: React.FC<{ agencyId: string }> = ({ agencyId }) => {
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;

    const load = async () => {
      if (isDemoMode()) {
        setActivityLog(getActivity(agencyId));
        setLoadingLog(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('agency_id', agencyId)
          .order('created_at', { ascending: false })
          .limit(20);
        if (!cancelled) {
          if (error) {
            console.warn('Activity log load error:', error.message);
            setActivityLog([]);
          } else {
            setActivityLog((data || []).map((r: any) => ({
              id: r.id,
              agency_id: r.agency_id,
              created_at: r.created_at,
              actor_name: r.actor_name || 'מערכת',
              actor_email: r.actor_email,
              action: r.action,
              message: r.message || r.action,
              meta: r.meta,
            })));
          }
        }
      } catch {
        if (!cancelled) setActivityLog([]);
      } finally {
        if (!cancelled) setLoadingLog(false);
      }
    };

    load();

    // Listen for new activity
    const handler = () => load();
    window.addEventListener('ima:activity', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('ima:activity', handler);
    };
  }, [agencyId]);

  const actionLabels: Record<string, string> = {
    logo_updated: 'עדכון לוגו',
    company_name_updated: 'עדכון שם חברה',
    user_invited: 'הזמנת משתמש',
    doc_sent: 'שליחת מסמך',
    event_created: 'יצירת אירוע',
    event_updated: 'עדכון אירוע',
    event_deleted: 'מחיקת אירוע',
    morning_sync_event: 'סנכרון Morning',
    expense_uploaded: 'העלאת הוצאה',
    expense_updated: 'עדכון הוצאה',
    expense_deleted: 'מחיקת הוצאה',
    morning_sync_expenses: 'סנכרון הוצאות Morning',
  };

  return (
    <Card className="border-gray-100 dark:border-gray-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          יומן פעילות
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {loadingLog ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-r-transparent" />
          </div>
        ) : activityLog.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">אין פעילות אחרונה</p>
        ) : (
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {activityLog.slice(0, 15).map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.message || actionLabels[entry.action] || entry.action}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entry.actor_name} &middot; {new Date(entry.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ─── Main Dashboard ─── */
const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentAgency } = useAgency();
  const { stats, events, artists, clients, loading } = useDashboardStats(currentAgency?.id);
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'משתמש';
  const canSeeMoney = user?.role !== 'producer';
  const [quickEventOpen, setQuickEventOpen] = useState(false);
  const agencyId = currentAgency?.id || '';

  // Notifications
  const notifications = useMemo(() => generateNotifications(events, artists), [events, artists]);

  const fmt = (n: number) => {
    if (n >= 1000000) return `₪ ${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `₪ ${(n / 1000).toFixed(1)}K`;
    return `₪ ${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const kpiCards = useMemo(() => [
    {
      title: 'אירועים בחודש הבא',
      value: canSeeMoney ? fmt(stats.eventsNextMonthIncome) : '•••',
      count: `${stats.eventsNextMonthCount} אירועים`,
      icon: Calendar,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'אירועים פעילים',
      value: canSeeMoney ? fmt(stats.activeEventsTotal) : '•••',
      count: `${stats.activeEventsCount} פעילים`,
      icon: Sparkles,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      title: 'סה"כ הוצאות',
      value: canSeeMoney ? fmt(stats.expensesTotal) : '•••',
      count: 'החודש',
      icon: DollarSign,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      title: 'חשבוניות ממתינות',
      value: canSeeMoney ? fmt(stats.pendingTotal) : '•••',
      count: `${stats.pendingCount} ממתינות`,
      icon: FileText,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      title: 'סה"כ גבייה',
      value: canSeeMoney ? fmt(stats.collectedTotal) : '•••',
      count: 'כל הזמנים',
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: 'הכנסה צפויה',
      value: canSeeMoney ? fmt(stats.expectedIncome) : '•••',
      count: 'לא כולל מבוטלים',
      icon: ClipboardList,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
  ], [stats, canSeeMoney]);

  const handleQuickEventCreated = useCallback(() => {
    // Refresh page data
    window.location.reload();
  }, []);

  // Upcoming events table (next 10)
  const upcomingEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return events
      .filter(e => (e.event_date || '').toString().slice(0, 10) >= today && e.status !== 'cancelled')
      .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''))
      .slice(0, 10);
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            שלום, {displayName}
          </h1>
          <p className="text-muted-foreground text-sm">
            {currentAgency?.name || 'NPC'} &middot; {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Button
          type="button"
          className="btn-magenta shrink-0 gap-2"
          onClick={() => setQuickEventOpen(true)}
        >
          <Plus className="w-4 h-4" />
          אירוע חדש
        </Button>
      </motion.div>

      {/* KPI Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-r-transparent" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {kpiCards.map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <Card className="h-full border-gray-100 dark:border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground leading-tight">{card.title}</span>
                      <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                        <card.icon className={`w-4 h-4 ${card.color}`} />
                      </div>
                    </div>
                    <p className="text-xl font-bold text-foreground leading-none">{card.value}</p>
                    <p className="text-xs text-muted-foreground">{card.count}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Notifications + Activity Log Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Notifications */}
            <Card className="border-gray-100 dark:border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  התראות
                  {notifications.filter(n => n.type === 'warning').length > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {notifications.filter(n => n.type === 'warning').length}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        n.type === 'warning' ? 'border-amber-200 bg-amber-50/50' :
                        n.type === 'success' ? 'border-green-200 bg-green-50/50' :
                        'border-blue-200 bg-blue-50/50'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">{n.icon}</div>
                      <p className="text-sm text-foreground">{n.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Activity Log */}
            <ActivityLogSection agencyId={agencyId} />
          </div>

          {/* Upcoming Events Table */}
          <Card className="border-gray-100 dark:border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  אירועים קרובים
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-sm gap-1"
                  onClick={() => navigate('/events')}
                >
                  כל האירועים
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {upcomingEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">אין אירועים קרובים</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 dark:border-gray-200 bg-muted/30">
                      <tr>
                        <th className="h-9 px-3 text-right font-medium text-muted-foreground text-xs">תאריך</th>
                        <th className="h-9 px-3 text-right font-medium text-muted-foreground text-xs">שם</th>
                        <th className="h-9 px-3 text-right font-medium text-muted-foreground text-xs">אמן</th>
                        <th className="h-9 px-3 text-right font-medium text-muted-foreground text-xs">סטטוס</th>
                        {canSeeMoney && <th className="h-9 px-3 text-right font-medium text-muted-foreground text-xs">סכום</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingEvents.map(ev => {
                        const artist = artists.find(a => a.id === ev.artist_id);
                        const statusLabels: Record<string, string> = {
                          draft: 'טיוטה',
                          pending: 'ממתין',
                          approved: 'מאושר',
                          paid: 'שולם',
                          cancelled: 'מבוטל',
                        };
                        const statusColors: Record<string, string> = {
                          draft: 'bg-gray-100 text-gray-700',
                          pending: 'bg-amber-100 text-amber-700',
                          approved: 'bg-blue-100 text-blue-700',
                          paid: 'bg-green-100 text-green-700',
                          cancelled: 'bg-red-100 text-red-700',
                        };
                        return (
                          <tr key={ev.id} className="border-b border-gray-50 dark:border-gray-100 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => navigate(`/events?edit=${ev.id}`)}>
                            <td className="p-3 text-xs whitespace-nowrap">{new Date(ev.event_date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}</td>
                            <td className="p-3 font-medium text-sm">{ev.business_name}</td>
                            <td className="p-3 text-muted-foreground text-xs">{artist?.name || '—'}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[ev.status] || 'bg-gray-100'}`}>
                                {statusLabels[ev.status] || ev.status}
                              </span>
                            </td>
                            {canSeeMoney && <td className="p-3 text-sm font-medium">{fmt(Number(ev.amount) || 0)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions Footer */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'אירועים', path: '/events', icon: Calendar },
              { label: 'אמנים', path: '/artists', icon: Users },
              { label: 'פיננסים', path: '/finance', icon: DollarSign },
              { label: 'יומן', path: '/calendar', icon: ClipboardList },
            ].map(item => (
              <Button
                key={item.path}
                type="button"
                variant="outline"
                className="h-12 gap-2 border-gray-200 dark:border-gray-200 hover:bg-muted/50"
                onClick={() => navigate(item.path)}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Button>
            ))}
          </div>
        </>
      )}

      {/* Quick New Event Dialog */}
      <QuickNewEventDialog
        open={quickEventOpen}
        onOpenChange={setQuickEventOpen}
        agencyId={agencyId}
        clients={clients}
        artists={artists}
        onCreated={handleQuickEventCreated}
      />
    </div>
  );
};

export default DashboardPage;
