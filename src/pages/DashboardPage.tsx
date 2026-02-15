import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Calendar, DollarSign, FileText, TrendingUp, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useAgency } from '@/contexts/AgencyContext';
import { supabase } from '@/lib/supabase';
import { demoGetEvents, demoGetClients, isDemoMode } from '@/lib/demoStore';
import { getFinanceExpenses } from '@/lib/financeStore';
import type { Event } from '@/types';

function useDashboardStats(agencyId: string | undefined) {
  const [events, setEvents] = useState<Event[]>([]);
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
      const clients = demoGetClients(agencyId);
      const expenses = getFinanceExpenses(agencyId);
      if (!cancelled) {
        setEvents(ev);
        setClientsCount(clients.length);
        setExpensesTotal(expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0));
      }
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const [evRes, clientsRes, expRes] = await Promise.all([
          supabase.from('events').select('*').eq('agency_id', agencyId).order('event_date', { ascending: false }).limit(500),
          supabase.from('clients').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId),
          supabase.from('finance_expenses').select('amount').eq('agency_id', agencyId),
        ]);

        if (cancelled) return;
        const evList = (evRes.data || []) as Event[];
        setEvents(evList);
        setClientsCount(clientsRes.count ?? 0);
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

  return { stats, loading };
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentAgency } = useAgency();
  const { stats, loading } = useDashboardStats(currentAgency?.id);
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'משתמש';
  const canSeeMoney = user?.role !== 'producer';

  const kpiCards = useMemo(() => [
    {
      title: 'אירועים בחודש הבא',
      value: canSeeMoney ? `₪ ${stats.eventsNextMonthIncome.toFixed(2)} • ${stats.eventsNextMonthCount}` : `••• • ${stats.eventsNextMonthCount}`,
      desc: 'הכנסה משוערת ומספר אירועים',
      icon: Calendar,
    },
    {
      title: 'אירועים פעילים',
      value: canSeeMoney ? `₪ ${stats.activeEventsTotal.toFixed(2)} • ${stats.activeEventsCount}` : `••• • ${stats.activeEventsCount}`,
      desc: 'מהיום והלאה',
      icon: Calendar,
    },
    {
      title: 'סה"כ הוצאות',
      value: canSeeMoney ? `₪ ${stats.expensesTotal.toFixed(2)}` : '•••',
      desc: 'החודש (קבצים שהועלו)',
      icon: DollarSign,
    },
    {
      title: 'חשבוניות ממתינות',
      value: canSeeMoney ? `₪ ${stats.pendingTotal.toFixed(2)} • ${stats.pendingCount}` : `••• • ${stats.pendingCount}`,
      desc: 'החודש (ממתין/מאושר)',
      icon: FileText,
    },
    {
      title: 'סה"כ גבייה',
      value: canSeeMoney ? `₪ ${stats.collectedTotal.toFixed(2)}` : '•••',
      desc: 'כל ההכנסות שנגבו (realtime)',
      icon: TrendingUp,
    },
    {
      title: 'הכנסה צפויה',
      value: canSeeMoney ? `₪ ${stats.expectedIncome.toFixed(2)}` : '•••',
      desc: 'החודש (ממתין/מאושר)',
      icon: ClipboardList,
    },
  ], [stats, canSeeMoney]);

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            {displayName ? `ברוך הבא ${displayName} ל-NPC AGENCY MANAGEMENT` : 'ברוך הבא ל-NPC AGENCY MANAGEMENT'}
          </h1>
          <p className="text-muted-foreground">
            {currentAgency?.name || 'NPC'} — ניהול הפקות
          </p>
        </div>
        <Button type="button" className="btn-magenta shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2 hover:opacity-90" onClick={() => navigate('/events')}>
          אירוע חדש
        </Button>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-r-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5 md:gap-6">
          {kpiCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="h-full border-gray-100 dark:border-gray-800 shadow-sm">
                <CardContent className="p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{card.title}</span>
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <card.icon className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                  <p className="text-lg font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
        <CardContent className="p-6 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <p className="text-muted-foreground">
            גש לאירועים, לקוחות, אמנים או פיננסים מהתפריט. ייצוא דוח זמין בעמוד פיננסים.
          </p>
          <Button type="button" variant="outline" className="border-gray-200 dark:border-gray-700 shrink-0 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-offset-2" onClick={() => navigate('/events')}>
            לטבלת אירועים
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;
