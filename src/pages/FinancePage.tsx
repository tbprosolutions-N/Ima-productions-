import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, CheckCircle, Circle, Upload, Download, Calendar, Pencil, Trash2, Plus, LayoutGrid, List, Eye, TrendingUp, FolderOpen, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useToast } from '@/contexts/ToastContext';
import { useAgency } from '@/contexts/AgencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { ExpenseUploadError, FinanceProvider, useFinance } from '@/contexts/FinanceContext';
import { isIntegrationConnected } from '@/lib/settingsStore';
import { queueSyncJob } from '@/lib/syncJobs';
import { addActivity } from '@/lib/activityLog';
import { deleteFinanceExpenseFile, getFinanceExpenseFile, setFinanceExpenseFile, setFinanceExpenses, type FinanceExpense } from '@/lib/financeStore';
import { supabase } from '@/lib/supabase';
import type { Artist, Client, Event } from '@/types';
import { demoGetArtists, demoGetClients, demoGetEvents, isDemoMode } from '@/lib/demoStore';
import { cleanNotes } from '@/lib/notesCleanup';
import { exportJsonToCSV, exportJsonToExcel } from '@/lib/exportUtils';
import { useSearchParams } from 'react-router-dom';
import { formatCurrency } from '@/lib/utils';
import { extractInvoiceData, type ExtractedExpense } from '@/services/invoiceExtraction';
import { processFile } from '@/services/ocrService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/** Memoized cash flow chart to prevent re-renders when parent updates */
const FinanceCashFlowChart = React.memo<{
  data: { monthKey: string; monthLabel: string; income: number; expenses: number }[];
  canSeeMoney: boolean;
}>(({ data, canSeeMoney }) => (
  <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        תזרים מזומנים
      </CardTitle>
      <CardDescription className="text-muted-foreground">
        הכנסות (אירועים שולמו) מול הוצאות לפי חודש בתקופה הנבחרת
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={v => (canSeeMoney ? `₪${(v / 1000).toFixed(0)}K` : '***')} />
            <Tooltip
              formatter={(value: number, name: string) => [canSeeMoney ? formatCurrency(value) : '***', name]}
              labelFormatter={label => `חודש: ${label}`}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
            />
            <Legend wrapperStyle={{ fontSize: '13px' }} />
            <Bar dataKey="income" name="הכנסות" fill="#10B981" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expenses" name="הוצאות" fill="#EF4444" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 text-center">
        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
          <p className="text-xs text-green-700 font-medium">סה"כ הכנסות</p>
          <p className="text-lg font-bold text-green-600">{canSeeMoney ? formatCurrency(data.reduce((s: number, d: any) => s + (d.income || 0), 0)) : '***'}</p>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-xs text-red-700 font-medium">סה"כ הוצאות</p>
          <p className="text-lg font-bold text-red-600">{canSeeMoney ? formatCurrency(data.reduce((s: number, d: any) => s + (d.expenses || 0), 0)) : '***'}</p>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs text-blue-700 font-medium">רווח נקי</p>
          <p className="text-lg font-bold text-blue-600">{canSeeMoney ? formatCurrency(data.reduce((s: number, d: any) => s + (d.income || 0) - (d.expenses || 0), 0)) : '***'}</p>
        </div>
      </div>
    </CardContent>
  </Card>
));

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

type ExpenseItem = FinanceExpense;

/** When true, hide "Uploaded Expenses" list to keep UI clean while OCR is under maintenance. */
const OCR_DISABLED = true;

/** Inner content that uses global finance state (expenses) from context. */
const FinancePageContent: React.FC = () => {
  const { success, info, error: showError } = useToast();
  const { currentAgency } = useAgency();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const agencyId = currentAgency?.id || '';
  const canSeeMoney = user?.role !== 'producer';

  const { expenses, expensesLoadError, setExpenses, loadExpenses, addExpenseFromOcr, updateExpense: contextUpdateExpense, deleteExpense: contextDeleteExpense, notifyExpensesChanged } = useFinance();

  const storageKeyChecklist = useMemo(() => `ima_finance_${agencyId}_checklist`, [agencyId]);

  const [currentMonth] = useState(new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }));
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [editChecklist, setEditChecklist] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [periodFrom, setPeriodFrom] = useState(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportScope, setReportScope] = useState<'company' | 'artist' | 'client'>('company');
  const [reportArtistId, setReportArtistId] = useState<string>('');
  const [reportClientId, setReportClientId] = useState<string>('');
  const [reportFormat, setReportFormat] = useState<'excel' | 'csv'>('excel');

  // Allow other pages to open the Period Summary modal via URL:
  // /finance?report=1&scope=company|artist|client&artistId=...&clientId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
  useEffect(() => {
    const open = searchParams.get('report') === '1';
    if (!open) return;
    const scope = (searchParams.get('scope') || 'company') as any;
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const artistId = searchParams.get('artistId') || '';
    const clientId = searchParams.get('clientId') || '';
    if (from) setPeriodFrom(from);
    if (to) setPeriodTo(to);
    if (scope === 'artist' || scope === 'client' || scope === 'company') setReportScope(scope);
    if (artistId) setReportArtistId(artistId);
    if (clientId) setReportClientId(clientId);
    setReportOpen(true);

    // Clean the URL so refresh doesn't keep reopening
    const next = new URLSearchParams(searchParams);
    next.delete('report');
    next.delete('scope');
    next.delete('from');
    next.delete('to');
    next.delete('artistId');
    next.delete('clientId');
    setSearchParams(next, { replace: true });
  }, [searchParams]);

  const [expenseEditorOpen, setExpenseEditorOpen] = useState(false);
  const [expenseEditing, setExpenseEditing] = useState<ExpenseItem | null>(null);
  const [expenseEditVendor, setExpenseEditVendor] = useState('');
  const [expenseEditAmount, setExpenseEditAmount] = useState<string>('');
  const [expenseEditNotes, setExpenseEditNotes] = useState('');
  const [expensesView, setExpensesView] = useState<'list' | 'grid'>('list');
  const [inlineEditExpenseId, setInlineEditExpenseId] = useState<string | null>(null);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Record<string, boolean>>({});
  const [uploadLoading, setUploadLoading] = useState(false);
  type ReviewItem = { id: string; file: File; extracted: ExtractedExpense };
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [fileManagerSearch, setFileManagerSearch] = useState('');
  const [fileManagerPeriod, setFileManagerPeriod] = useState<'day' | 'month' | 'quarter' | 'year' | 'custom'>('month');
  const [fileManagerFrom, setFileManagerFrom] = useState('');
  const [fileManagerTo, setFileManagerTo] = useState('');

  useEffect(() => {
    // load checklist
    if (!agencyId) return;
    try {
      const raw = localStorage.getItem(storageKeyChecklist);
      const parsed = raw ? (JSON.parse(raw) as ChecklistItem[]) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        setChecklist(parsed);
      } else {
        setChecklist([
          { id: '1', title: 'סגירת חשבוניות ספקים', completed: false },
          { id: '2', title: 'העברת תשלומים לאמנים', completed: false },
          { id: '3', title: 'דיווח מע"מ', completed: false },
          { id: '4', title: 'עדכון דוחות כספיים', completed: false },
          { id: '5', title: 'התאמת חשבונות בנק', completed: false },
          { id: '6', title: 'סגירת חודש ב-Morning', completed: false },
          { id: '7', title: 'שליחת דוחות להנהלה', completed: false },
        ]);
      }
    } catch {
      setChecklist([
        { id: '1', title: 'סגירת חשבוניות ספקים', completed: false },
        { id: '2', title: 'העברת תשלומים לאמנים', completed: false },
        { id: '3', title: 'דיווח מע"מ', completed: false },
        { id: '4', title: 'עדכון דוחות כספיים', completed: false },
        { id: '5', title: 'התאמת חשבונות בנק', completed: false },
        { id: '6', title: 'סגירת חודש ב-Morning', completed: false },
        { id: '7', title: 'שליחת דוחות להנהלה', completed: false },
      ]);
    }
  }, [storageKeyChecklist, agencyId]);

  useEffect(() => {
    // persist checklist
    if (!agencyId) return;
    if (checklist.length === 0) return;
    localStorage.setItem(storageKeyChecklist, JSON.stringify(checklist));
  }, [checklist, storageKeyChecklist]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Reload expenses when tab becomes visible so data stays in sync when switching tabs
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && agencyId) loadExpenses();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [agencyId, loadExpenses]);

  useEffect(() => {
    // Demo only: persist to localStorage (production uses DB)
    if (!agencyId) return;
    if (!isDemoMode()) return;
    try {
      const { stored, didStripFiles } = setFinanceExpenses(agencyId, expenses);
      if (didStripFiles) {
        setExpenses(stored);
        showError('נשמרו פרטי הוצאה בלבד (ללא קובץ) בגלל מגבלת נפח. בפרודקשן יש לשמור קבצים ב‑Storage.');
      }
    } catch (e) {
      console.error(e);
      showError('לא ניתן לשמור מקומית (מגבלת נפח). נסו למחוק קבצים/הוצאות ישנות.');
    }
  }, [expenses, agencyId, showError]);

  // Phase 2: Collections + payouts summary (per selected period)
  useEffect(() => {
    if (!currentAgency) return;
    const run = async () => {
      try {
        setEventsLoading(true);
        if (isDemoMode()) {
          const all = demoGetEvents(currentAgency.id);
          const filtered = all
            .filter(e => {
              const d = new Date(e.payment_date || e.event_date).toISOString().slice(0, 10);
              return (!periodFrom || d >= periodFrom) && (!periodTo || d <= periodTo);
            })
            .sort((a, b) => String(b.payment_date || b.event_date).localeCompare(String(a.payment_date || a.event_date)));
          setEvents(filtered);
          return;
        }

        // NOTE: We intentionally fetch without date constraints to keep period logic correct when
        // payment_date differs from event_date. We then apply the period filter on (payment_date || event_date).
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('agency_id', currentAgency.id)
          .order('event_date', { ascending: false })
          .limit(500);
        if (error) throw error;
        const all = (data as Event[]) || [];
        const filtered = all
          .filter(e => {
            const d = String(e.payment_date || e.event_date || '').slice(0, 10);
            return (!periodFrom || d >= periodFrom) && (!periodTo || d <= periodTo);
          })
          .sort((a, b) => String(b.payment_date || b.event_date).localeCompare(String(a.payment_date || a.event_date)));
        setEvents(filtered);
      } catch (e) {
        console.error(e);
        setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    };
    run();
  }, [currentAgency?.id, periodFrom, periodTo]);

  // Realtime: keep period summary in sync when events or expenses change
  useEffect(() => {
    if (!currentAgency?.id || isDemoMode()) return;
    const agencyId = currentAgency.id;
    const channel = supabase
      .channel('finance-period-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `agency_id=eq.${agencyId}` },
        () => {
          setEventsLoading(true);
          supabase
            .from('events')
            .select('*')
            .eq('agency_id', agencyId)
            .order('event_date', { ascending: false })
            .limit(500)
            .then(({ data, error }) => {
              if (error) return;
              const all = (data as Event[]) || [];
              const filtered = all
                .filter(e => {
                  const d = String(e.payment_date || e.event_date || '').slice(0, 10);
                  return (!periodFrom || d >= periodFrom) && (!periodTo || d <= periodTo);
                })
                .sort((a, b) => String(b.payment_date || b.event_date).localeCompare(String(a.payment_date || a.event_date)));
              setEvents(filtered);
            })
            .then(() => setEventsLoading(false), () => setEventsLoading(false));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'finance_expenses', filter: `agency_id=eq.${agencyId}` },
        () => loadExpenses()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentAgency?.id, periodFrom, periodTo, loadExpenses]);

  // When opening Period Summary, sync with latest collection and expenses
  useEffect(() => {
    if (reportOpen && agencyId) {
      loadExpenses();
    }
  }, [reportOpen, agencyId, loadExpenses]);

  useEffect(() => {
    if (!currentAgency) return;
    const run = async () => {
      try {
        if (isDemoMode()) {
          setArtists(demoGetArtists(currentAgency.id));
          setClients(demoGetClients(currentAgency.id));
          return;
        }
        const [aRes, cRes] = await Promise.all([
          supabase.from('artists').select('*').eq('agency_id', currentAgency.id).order('name', { ascending: true }),
          supabase.from('clients').select('*').eq('agency_id', currentAgency.id).order('name', { ascending: true }),
        ]);
        setArtists(((aRes.data as Artist[]) || []).filter(Boolean));
        setClients(((cRes.data as Client[]) || []).filter(Boolean));
      } catch (e) {
        console.error(e);
        setArtists([]);
        setClients([]);
      }
    };
    run();
  }, [currentAgency?.id]);

  const computeArtistFee = (companyAmount: number, feeType: 'fixed' | 'percent' | 'none', feeValue: number) => {
    if (feeType === 'none') return 0;
    if (!Number.isFinite(companyAmount) || companyAmount < 0) return 0;
    if (!Number.isFinite(feeValue) || feeValue < 0) return 0;
    if (feeType === 'percent') return Math.max(0, (companyAmount * feeValue) / 100);
    return Math.max(0, feeValue);
  };

  const periodExpenses = useMemo(() => {
    return expenses.filter((x) => {
      const d = String(x.created_at || '').slice(0, 10);
      return (!periodFrom || d >= periodFrom) && (!periodTo || d <= periodTo);
    });
  }, [expenses, periodFrom, periodTo]);

  const summary = useMemo(() => {
    const collected = events.filter(e => e.status === 'paid');
    const collectedCount = collected.length;
    const collectedTotal = collected.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const payableEvents = events.filter(e => !!e.artist_id && e.status !== 'cancelled');
    const payableTotal = payableEvents.reduce((sum, e) => {
      const amt = Number(e.artist_fee_amount);
      if (Number.isFinite(amt) && amt > 0) return sum + amt;
      const feeType = (e.artist_fee_type || 'fixed') as 'fixed' | 'percent' | 'none';
      const feeValue = Number(e.artist_fee_value) || 0;
      return sum + computeArtistFee(Number(e.amount) || 0, feeType, feeValue);
    }, 0);
    const missingPayout = payableEvents.filter(e => (Number(e.artist_fee_amount) || 0) <= 0 && (Number(e.artist_fee_value) || 0) <= 0).length;

    const expensesTotal = periodExpenses.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);

    return { collectedCount, collectedTotal, payableTotal, missingPayout, expensesTotal };
  }, [events, periodExpenses]);

  /** Cash flow by month for the selected period (income = paid events, expenses = expense items). */
  const cashFlowData = useMemo(() => {
    if (!periodFrom || !periodTo || periodFrom > periodTo) return [];
    const start = new Date(periodFrom);
    const end = new Date(periodTo);
    const months: { monthKey: string; monthLabel: string; income: number; expenses: number }[] = [];
    const seen = new Set<string>();
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (seen.has(monthKey)) continue;
      seen.add(monthKey);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const income = events
        .filter(e => e.status === 'paid' && e.event_date) 
        .filter(e => {
          const ed = new Date(e.event_date);
          return ed >= monthStart && ed <= monthEnd;
        })
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const expensesSum = expenses
        .filter(x => {
          const dateStr = (x.expense_date || x.created_at || '').toString().slice(0, 10);
          if (!dateStr) return false;
          const ed = new Date(dateStr);
          return ed >= monthStart && ed <= monthEnd;
        })
        .reduce((s, x) => s + (Number(x.amount) || 0), 0);
      months.push({
        monthKey,
        monthLabel: monthStart.toLocaleDateString('he-IL', { month: 'short', year: 'numeric' }),
        income,
        expenses: expensesSum,
      });
    }
    return months;
  }, [periodFrom, periodTo, events, expenses]);

  const reportReady = useMemo(() => {
    if (periodFrom && periodTo && periodFrom > periodTo) return false;
    if (reportScope === 'artist') return !!reportArtistId;
    if (reportScope === 'client') return !!reportClientId;
    return true;
  }, [periodFrom, periodTo, reportScope, reportArtistId, reportClientId]);

  const reportLabel = useMemo(() => {
    if (reportScope === 'artist') {
      const a = artists.find(x => x.id === reportArtistId);
      return `אמן: ${a?.name || '—'}`;
    }
    if (reportScope === 'client') {
      const c = clients.find(x => x.id === reportClientId);
      return `לקוח: ${c?.name || '—'}`;
    }
    return 'חברה';
  }, [reportScope, reportArtistId, reportClientId, artists, clients]);

  const reportEvents = useMemo(() => {
    if (reportScope === 'artist') return events.filter(e => e.artist_id === reportArtistId);
    if (reportScope === 'client') return events.filter(e => e.client_id === reportClientId);
    return events;
  }, [events, reportScope, reportArtistId, reportClientId]);

  const reportTotals = useMemo(() => {
    const paid = reportEvents.filter(e => e.status === 'paid');
    const incomePaid = paid.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const incomeAll = reportEvents.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const payable = reportEvents
      .filter(e => !!e.artist_id && e.status !== 'cancelled')
      .reduce((sum, e) => {
        const amt = Number(e.artist_fee_amount);
        if (Number.isFinite(amt) && amt > 0) return sum + amt;
        const feeType = (e.artist_fee_type || 'fixed') as 'fixed' | 'percent' | 'none';
        const feeValue = Number(e.artist_fee_value) || 0;
        return sum + computeArtistFee(Number(e.amount) || 0, feeType, feeValue);
      }, 0);
    const expensesTotal = reportScope === 'company'
      ? periodExpenses.reduce((sum, x) => sum + (Number(x.amount) || 0), 0)
      : 0;
    return { incomePaid, incomeAll, payable, expensesTotal };
  }, [reportEvents, periodExpenses, reportScope]);

  const fileManagerFilteredList = useMemo(() => {
    const now = new Date();
    let from = '';
    let to = now.toISOString().slice(0, 10);
    if (fileManagerPeriod === 'day') {
      from = to = now.toISOString().slice(0, 10);
    } else if (fileManagerPeriod === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    } else if (fileManagerPeriod === 'quarter') {
      const q = Math.floor(now.getMonth() / 3) + 1;
      from = new Date(now.getFullYear(), (q - 1) * 3, 1).toISOString().slice(0, 10);
    } else if (fileManagerPeriod === 'year') {
      from = `${now.getFullYear()}-01-01`;
    } else {
      from = fileManagerFrom || from;
      to = fileManagerTo || to;
    }
    const q = (fileManagerSearch || '').trim().toLowerCase();
    return expenses.filter((e) => {
      const created = (e.created_at || '').slice(0, 10);
      if (created < from || created > to) return false;
      if (q && !(e.filename || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, fileManagerSearch, fileManagerPeriod, fileManagerFrom, fileManagerTo]);

  const reportRows = useMemo(() => {
    const rows: Record<string, any>[] = [];
    const artistById = new Map(artists.map(a => [a.id, a]));
    const clientById = new Map(clients.map(c => [c.id, c]));

    for (const e of reportEvents) {
      const artist = e.artist_id ? artistById.get(e.artist_id) : undefined;
      const client = e.client_id ? clientById.get(e.client_id) : undefined;
      const feeType = (e.artist_fee_type || 'fixed') as 'fixed' | 'percent' | 'none';
      const feeValue = Number(e.artist_fee_value) || 0;
      const payable = (Number(e.artist_fee_amount) || 0) > 0
        ? Number(e.artist_fee_amount) || 0
        : computeArtistFee(Number(e.amount) || 0, feeType, feeValue);

      rows.push({
        'סוג': 'אירוע',
        'תאריך אירוע': String(e.event_date || '').slice(0, 10),
        'תאריך תשלום': String(e.payment_date || '').slice(0, 10),
        'לקוח': client?.name || e.business_name || '',
        'אמן': artist?.name || '',
        'סטטוס': e.status,
        'הכנסה לחברה': Number(e.amount) || 0,
        'לתשלום לאמן': payable,
        'הערות': cleanNotes(e.notes),
      });
    }

    if (reportScope === 'company') {
      for (const x of periodExpenses) {
        rows.push({
          'סוג': 'הוצאה',
          'תאריך אירוע': '',
          'תאריך תשלום': String(x.created_at || '').slice(0, 10),
          'לקוח': '',
          'אמן': '',
          'סטטוס': x.morning_status || '',
          'הכנסה לחברה': '',
          'לתשלום לאמן': '',
          'הערות': `${x.vendor || ''}${x.vendor ? ' · ' : ''}${x.filename || ''}${x.notes ? ` · ${x.notes}` : ''}`,
        });
      }
    }

    return rows;
  }, [reportEvents, artists, clients, periodExpenses, reportScope, computeArtistFee]);

  // Prevent any action before agency is ready (avoids saving under wrong/empty key)
  if (!currentAgency || !agencyId) {
    return (
      <div className="space-y-6">
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardHeader>
            <CardTitle>פיננסים</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">טוען סוכנות…</CardContent>
        </Card>
      </div>
    );
  }

  const exportReport = () => {
    if (!canSeeMoney) {
      showError('אין הרשאה להציג/לייצא סכומים עבור תפקיד Producer.');
      return;
    }
    if (!reportReady) {
      showError('נא לבחור טווח תאריכים תקין ולמלא סינון (אמן/לקוח) לפי הצורך.');
      return;
    }
    const scopeSlug = reportScope === 'company' ? 'company' : reportScope === 'artist' ? `artist_${reportArtistId}` : `client_${reportClientId}`;
    const filename = `finance_period_${scopeSlug}_${periodFrom || 'from'}_${periodTo || 'to'}`;
    try {
      if (reportFormat === 'excel') {
        exportJsonToExcel({
          data: reportRows,
          filename,
          sheetName: 'Finance Period',
          colWidths: [10, 14, 14, 28, 18, 12, 14, 14, 40],
        });
      } else {
        exportJsonToCSV({ data: reportRows, filename });
      }
      success('הדוח יוצא בהצלחה ✅');
      addActivity(agencyId, {
        actor_name: user?.full_name || 'Noa Tibi',
        actor_email: user?.email,
        action: 'event_updated',
        message: 'יוצא דוח תקופה',
        meta: { reportScope, periodFrom, periodTo, format: reportFormat, rows: reportRows.length },
      });
    } catch (e: any) {
      console.error(e);
      showError(e?.message || 'ייצוא נכשל');
    }
  };

  const inferExpenseMeta = (filename: string): { vendor: string; amount?: number } => {
    const base = filename.replace(/\.[^/.]+$/, '');
    // Match numbers: 1) NIS/₪/שקל followed by digits, 2) digits with optional . or , decimal, 3) last number in string (common for totals)
    const nisMatch = base.match(/(?:nis|₪|שקל|amount|סכום)\s*[:=]?\s*([\d,.\s]+)/i);
    const digitMatches = Array.from(base.matchAll(/(\d{1,6})(?:[.,](\d{1,2}))?/g));
    let amount: number | undefined;
    if (nisMatch) {
      const numStr = nisMatch[1].replace(/\s/g, '').replace(',', '.');
      const parsed = parseFloat(numStr);
      if (Number.isFinite(parsed)) amount = parsed;
    }
    if (amount === undefined && digitMatches.length > 0) {
      const m = digitMatches[digitMatches.length - 1];
      const whole = m[1];
      const frac = m[2];
      const num = frac ? `${whole}.${frac}` : whole;
      const parsed = Number(num);
      if (Number.isFinite(parsed) && parsed < 1e7) amount = parsed;
    }
    const vendor = base
      .replace(/(\d{1,6})(?:[.,](\d{1,2}))?/g, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    return { vendor: vendor || base.trim() || '', amount };
  };

  const dataUrlToBlobUrl = (dataUrl: string): { url: string; mime: string } | null => {
    try {
      if (!dataUrl.startsWith('data:')) return null;
      const [meta, b64] = dataUrl.split(',');
      const mime = (meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream').trim();
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      return { url, mime };
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const toggleItem = (id: string) => {
    if (editChecklist) return;
    setChecklist(prev =>
      prev.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
    success('הסטטוס עודכן בהצלחה! ✅');
  };

  const addChecklistItem = () => {
    const title = newChecklistTitle.trim();
    if (!title) return;
    const next: ChecklistItem = {
      id: globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}`,
      title,
      completed: false,
    };
    setChecklist(prev => [next, ...prev]);
    setNewChecklistTitle('');
    success('נוסף לרשימה ✅');
  };

  const removeChecklistItem = (id: string) => {
    setChecklist(prev => prev.filter(i => i.id !== id));
    success('נמחק ✅');
  };

  const updateChecklistTitle = (id: string, title: string) => {
    setChecklist(prev => prev.map(i => (i.id === id ? { ...i, title } : i)));
  };

  const updateReviewItem = (id: string, patch: Partial<ExtractedExpense>) => {
    setReviewItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, extracted: { ...it.extracted, ...patch } } : it))
    );
  };

  const saveReviewAndUpload = async () => {
    if (reviewItems.length === 0) return;
    setUploadLoading(true);
    try {
      const mapped: ExpenseItem[] = [];

      for (const { id: reviewId, file, extracted } of reviewItems) {
        const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
        const storage_path = `${agencyId}/${reviewId}/${safeName}`;

        const up = await supabase.storage
          .from('expenses')
          .upload(storage_path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
        if (up.error) throw new Error(up.error.message);

        const row: Record<string, unknown> = {
          agency_id: agencyId,
          uploaded_by: user?.id || null,
          filename: file.name,
          filetype: file.type || 'application/octet-stream',
          size: file.size,
          storage_path,
          vendor: extracted.supplier_name || null,
          supplier_name: extracted.supplier_name || null,
          amount: extracted.amount ?? null,
          notes: 'הועלה דרך המערכת',
          morning_status: 'not_synced',
        };
        if (extracted.expense_date) row.expense_date = extracted.expense_date;
        if (extracted.vat != null) row.vat = extracted.vat;

        const { data: inserted, error: insError } = await supabase
          .from('finance_expenses')
          .insert([row as any])
          .select('id, created_at, updated_at, filename, filetype, size, storage_path, uploaded_by, vendor, supplier_name, amount, expense_date, vat, notes, morning_status')
          .single();
        if (insError) throw new Error(insError.message);
        const r = inserted as any;
        mapped.push({
          id: String(r.id),
          created_at: String(r.created_at),
          updated_at: r.updated_at ? String(r.updated_at) : undefined,
          filename: String(r.filename),
          filetype: String(r.filetype),
          size: Number(r.size) || 0,
          storage_path: String(r.storage_path),
          uploaded_by: r.uploaded_by ? String(r.uploaded_by) : undefined,
          vendor: r.vendor ?? r.supplier_name ?? undefined,
          supplier_name: r.supplier_name ?? undefined,
          amount: r.amount != null ? Number(r.amount) : undefined,
          expense_date: r.expense_date ? String(r.expense_date).slice(0, 10) : undefined,
          vat: r.vat != null ? Number(r.vat) : undefined,
          notes: r.notes ?? undefined,
          morning_status: r.morning_status ?? 'not_synced',
          file_store: 'supabase',
        });
      }

      setExpenses((prev) => [...mapped, ...prev]);
      notifyExpensesChanged(expenses.length + mapped.length);
      addActivity(agencyId, {
        actor_name: user?.full_name || 'System',
        actor_email: user?.email,
        action: 'expense_uploaded',
        message: `הועלו ${reviewItems.length} הוצאות`,
        meta: { count: reviewItems.length },
      });
      success(`נשמר בהצלחה לצורך מס וסנכרון Morning — ${reviewItems.length} קבצים ✅`);
      setReviewOpen(false);
      setReviewItems([]);
      loadExpenses();
    } catch (e: any) {
      showError(e?.message || 'אירעה שגיאה. הנתונים לא נשמרו. אנא נסה שוב.');
    } finally {
      setUploadLoading(false);
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    try {
      if (!isDemoMode()) {
        setUploadLoading(true);
        try {
          const items: { id: string; file: File; extracted: ExtractedExpense }[] = [];
          for (const f of list) {
            const id = globalThis.crypto?.randomUUID?.() ?? `exp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            let extracted: ExtractedExpense;
            try {
              extracted = await extractInvoiceData(f);
            } catch {
              try {
                extracted = await processFile(f);
              } catch {
                extracted = {
                  supplier_name: f.name.replace(/\.[^/.]+$/, '').slice(0, 80) || 'קובץ',
                  amount: undefined,
                  vat: undefined,
                  expense_date: new Date().toISOString().slice(0, 10),
                };
              }
            }
            items.push({ id, file: f, extracted });
          }
          // Scan → Extract → Save to Supabase → immediate UI update (no review step)
          let saved = 0;
          for (const { file, extracted } of items) {
            try {
              await addExpenseFromOcr({
                agencyId,
                userId: user?.id || null,
                file,
                extracted,
              });
              saved++;
            } catch (err) {
              const msg = err instanceof ExpenseUploadError
                ? (err.code === 'STORAGE_FORBIDDEN'
                    ? 'העלאת קובץ נחסמה (403) — בדוק הרשאות Storage ו־RLS על bucket "expenses".'
                    : err.code === 'INSERT_FORBIDDEN'
                      ? 'שמירת רשומה נחסמה (הרשאות) — ודא שהמשתמש בתפקיד owner/manager/finance.'
                      : err.code === 'INSERT_SCHEMA'
                        ? `שגיאת טבלה: ${err.message} — הרץ את מיגרציית finance_expenses ב־Supabase.`
                        : err.message)
                : (err instanceof Error ? err.message : 'שגיאה בשמירה');
              console.error('[Finance] addExpenseFromOcr failed', err);
              showError(msg);
              break;
            }
          }
          if (saved > 0) {
            addActivity(agencyId, {
              actor_name: user?.full_name || 'System',
              actor_email: user?.email,
              action: 'expense_uploaded',
              message: `הועלו ${saved} הוצאות`,
              meta: { count: saved },
            });
            success(`נשמרו ${saved} קבצים — הוצגו בהוצאות אחרונות ✅`);
            loadExpenses();
          }
        } finally {
          setUploadLoading(false);
        }
        return;
      }

      const nowIso = new Date().toISOString();
      const next: ExpenseItem[] = list.map((f) => ({
        id: globalThis.crypto?.randomUUID?.() ?? `exp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        created_at: nowIso,
        filename: f.name,
        filetype: f.type || 'application/octet-stream',
        size: f.size,
        // Store file in IndexedDB; keep localStorage small & reliable
        dataUrl: undefined,
        file_store: 'idb',
        ...inferExpenseMeta(f.name),
        notes: 'הקובץ נשמר מקומית — ניתן לצפייה/הורדה',
        morning_status: 'not_synced',
      }));

      await Promise.all(
        next.map((meta, idx) =>
          setFinanceExpenseFile({
            agencyId,
            expenseId: meta.id,
            file: list[idx],
            filename: meta.filename,
            filetype: meta.filetype,
          }).catch((e) => console.warn('setFinanceExpenseFile failed', e))
        )
      );
      const newExpenses = [...next, ...expenses];
      setExpenses(newExpenses);
      setFinanceExpenses(agencyId, newExpenses);
      notifyExpensesChanged(newExpenses.length);
      addActivity(agencyId, {
        actor_name: 'Noa Tibi',
        actor_email: undefined,
        action: 'expense_uploaded',
        message: `הועלו ${list.length} הוצאות`,
        meta: { count: list.length },
      });
      success(`נוספו ${list.length} קבצים ✅`);
    } catch (e) {
      console.error(e);
      showError('העלאת הקבצים נכשלה. אנא נסה שוב.');
    }
  };

  const openFilePicker = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.click();
  };

  const updateExpense = (id: string, patch: Partial<ExpenseItem>) => {
    const affectsMorning =
      Object.prototype.hasOwnProperty.call(patch, 'vendor') ||
      Object.prototype.hasOwnProperty.call(patch, 'amount') ||
      Object.prototype.hasOwnProperty.call(patch, 'filename') ||
      Object.prototype.hasOwnProperty.call(patch, 'dataUrl') ||
      Object.prototype.hasOwnProperty.call(patch, 'notes');
    const fullPatch = {
      ...patch,
      ...(affectsMorning ? { morning_status: 'not_synced' as const, morning_synced_at: undefined } : {}),
    };
    contextUpdateExpense(id, fullPatch);
    addActivity(agencyId, {
      actor_name: user?.full_name || 'Noa Tibi',
      actor_email: user?.email,
      action: 'expense_updated',
      message: `עודכנה הוצאה: ${id}`,
      meta: { id, patch: Object.keys(patch) },
    });
    notifyExpensesChanged();
  };

  const deleteExpense = (id: string) => {
    if (isDemoMode()) {
      deleteFinanceExpenseFile({ agencyId, expenseId: id }).catch(() => {});
    }
    contextDeleteExpense(id);
    setSelectedExpenseIds(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    addActivity(agencyId, {
      actor_name: user?.full_name || 'Noa Tibi',
      actor_email: user?.email,
      action: 'expense_deleted',
      message: 'נמחקה הוצאה',
      meta: { id },
    });
    success('הוצאה נמחקה ✅');
  };

  const toggleSelectedExpense = (id: string, next?: boolean) => {
    setSelectedExpenseIds(prev => {
      const current = !!prev[id];
      const value = next ?? !current;
      const out = { ...prev, [id]: value };
      if (!value) delete out[id];
      return out;
    });
  };

  const selectedCount = Object.entries(selectedExpenseIds).filter(([, v]) => v).length;

  const selectAllVisible = (ids: string[]) => {
    setSelectedExpenseIds(() => {
      const out: Record<string, boolean> = {};
      ids.forEach(id => { out[id] = true; });
      return out;
    });
  };

  const clearSelection = () => setSelectedExpenseIds({});

  const deleteSelected = () => {
    const ids = Object.entries(selectedExpenseIds)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) return;
    if (!confirm(`למחוק ${ids.length} הוצאות?`)) return;
    // Use a snapshot of ids to avoid any stale state edge-cases
    const set = new Set(ids);
    if (!isDemoMode()) {
      const toRemovePaths = expenses
        .filter((e) => set.has(e.id))
        .map((e) => e.storage_path)
        .filter(Boolean) as string[];
      if (toRemovePaths.length > 0) supabase.storage.from('expenses').remove(toRemovePaths).catch(() => {});
      supabase.from('finance_expenses').delete().in('id', ids).then(({ error }) => {
        if (error) console.error(error);
      });
    } else {
      Array.from(set).forEach((id) => deleteFinanceExpenseFile({ agencyId, expenseId: id }).catch(() => {}));
    }
    setExpenses(prev => prev.filter(e => !set.has(e.id)));
    setSelectedExpenseIds({});
    notifyExpensesChanged(Math.max(0, expenses.length - ids.length));
    addActivity(agencyId, {
      actor_name: 'Noa Tibi',
      actor_email: undefined,
      action: 'expense_deleted',
      message: 'נמחקו הוצאות מרובות',
      meta: { count: ids.length, ids },
    });
    success(`נמחקו ${ids.length} הוצאות ✅`);
  };

  const morningReady = isIntegrationConnected(agencyId, 'morning');

  const viewExpenseFile = (exp: ExpenseItem) => {
    void (async () => {
      try {
        if (exp.file_store === 'supabase' && exp.storage_path) {
          const { data, error } = await supabase.storage.from('expenses').createSignedUrl(exp.storage_path, 60);
          if (error) throw error;
          const w = window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
          if (!w) downloadExpenseFile(exp);
          return;
        }
        if (exp.file_store === 'idb') {
          const stored = await getFinanceExpenseFile({ agencyId, expenseId: exp.id });
          if (!stored?.blob) {
            showError('הקובץ לא נמצא. נסה להעלות מחדש.');
            return;
          }
          const url = URL.createObjectURL(stored.blob);
          const w = window.open(url, '_blank', 'noopener,noreferrer');
          if (!w) downloadExpenseFile(exp);
          window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
          return;
        }
        if (!exp.dataUrl) return;
        const blob = dataUrlToBlobUrl(exp.dataUrl);
        const url = blob?.url || exp.dataUrl;
        const w = window.open(url, '_blank', 'noopener,noreferrer');
        if (!w) downloadExpenseFile(exp);
        if (blob?.url) window.setTimeout(() => URL.revokeObjectURL(blob.url), 30_000);
      } catch (e: any) {
        console.error(e);
        showError(e?.message || 'אירעה שגיאה בפתיחת הקובץ. אנא נסה שוב.');
      }
    })();
  };

  const downloadExpenseFile = (exp: ExpenseItem) => {
    void (async () => {
      try {
        if (exp.file_store === 'supabase' && exp.storage_path) {
          const { data, error } = await supabase.storage.from('expenses').createSignedUrl(exp.storage_path, 60);
          if (error) throw error;
          const a = document.createElement('a');
          a.href = data.signedUrl;
          a.download = exp.filename || 'expense';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        }
        if (exp.file_store === 'idb') {
          const stored = await getFinanceExpenseFile({ agencyId, expenseId: exp.id });
          if (!stored?.blob) {
            showError('הקובץ לא נמצא. נסה להעלות מחדש.');
            return;
          }
          const url = URL.createObjectURL(stored.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = exp.filename || stored.filename || 'expense';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
          return;
        }
        if (!exp.dataUrl) return;
        const blob = dataUrlToBlobUrl(exp.dataUrl);
        const a = document.createElement('a');
        a.href = blob?.url || exp.dataUrl;
        a.download = exp.filename || 'expense';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (blob?.url) window.setTimeout(() => URL.revokeObjectURL(blob.url), 30_000);
      } catch (e: any) {
        console.error(e);
        showError(e?.message || 'הורדת הקובץ נכשלה. אנא נסה שוב.');
      }
    })();
  };

  const openExpenseEditor = (exp: ExpenseItem) => {
    setExpenseEditing(exp);
    setExpenseEditVendor(exp.vendor || '');
    setExpenseEditAmount(exp.amount === undefined || exp.amount === null ? '' : String(exp.amount));
    setExpenseEditNotes(exp.notes || '');
    setExpenseEditorOpen(true);
  };

  const saveExpenseEditor = () => {
    if (!expenseEditing) return;
    updateExpense(expenseEditing.id, {
      vendor: expenseEditVendor,
      amount: expenseEditAmount === '' ? undefined : Number(expenseEditAmount),
      notes: expenseEditNotes,
    });
    setExpenseEditorOpen(false);
    setExpenseEditing(null);
    success('הוצאה עודכנה ✅');
  };

  const syncExpensesToMorning = async () => {
    if (!morningReady) {
      showError('יש לחבר Morning בהגדרות (הסוד נשמר בשרת)');
      return;
    }
    const snapshot = expenses;
    const toSync = snapshot.filter(e => e.morning_status !== 'synced');
    if (toSync.length === 0) {
      info('אין מה לסנכרן (הכל כבר מסונכרן) ✅');
      return;
    }

    if (isDemoMode()) {
      setExpenses(prev =>
        prev.map(e =>
          e.morning_status === 'synced' ? e : { ...e, morning_status: 'syncing' }
        )
      );
      await new Promise(r => setTimeout(r, 1500));
      const now = new Date().toISOString();
      let synced = 0;
      let errors = 0;
      setExpenses(prev =>
        prev.map(e => {
          if (e.morning_status !== 'syncing' && e.morning_status !== 'not_synced' && e.morning_status !== 'error') return e;
          if (e.amount === undefined || e.amount === null || !Number.isFinite(Number(e.amount))) {
            errors += 1;
            return { ...e, morning_status: 'error' };
          }
          synced += 1;
          return { ...e, morning_status: 'synced', morning_synced_at: now };
        })
      );
      addActivity(agencyId, {
        actor_name: 'Noa Tibi',
        actor_email: undefined,
        action: 'morning_sync_expenses',
        message: 'סונכרנו הוצאות ל‑Morning',
        meta: { synced, errors, total: snapshot.length },
      });
      if (errors > 0) {
        showError(`סנכרון חלקי: ${synced} סונכרנו, ${errors} דורשות סכום לפני סנכרון.`);
      } else {
        success('ההוצאות סונכרנו ל‑Morning ✅');
      }
      return;
    }

    const job = await queueSyncJob({
      agencyId,
      provider: 'morning',
      kind: 'expenses_sync',
      payload: {},
      createdBy: user?.id,
    });
    if (!job) {
      showError('לא ניתן ליצור משימת סנכרון (אולי אין הרשאת Owner)');
      return;
    }
    setExpenses(prev =>
      prev.map(e =>
        e.morning_status === 'synced' ? e : { ...e, morning_status: 'syncing' }
      )
    );
    success('משימת סנכרון ל‑Morning נוצרה — מתעדכן ברקע ✅');
    addActivity(agencyId, {
      actor_name: user?.full_name || 'System',
      actor_email: user?.email,
      action: 'morning_sync_expenses',
      message: 'נוצרה משימת סנכרון הוצאות ל‑Morning',
      meta: { jobId: job.id, count: toSync.length },
    });
    for (let i = 1; i <= 10; i++) {
      setTimeout(() => loadExpenses(), i * 3000);
    }
  };

  const completedCount = checklist.filter(item => item.completed).length;
  const progress = (completedCount / checklist.length) * 100;

  return (
    <div className="space-y-6">
      {!currentAgency ? (
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardHeader>
            <CardTitle>פיננסים</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">טוען סוכנות…</CardContent>
        </Card>
      ) : null}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-8 h-8 text-primary animate-pulse" />
            פיננסים
          </h1>
          <p className="text-muted-foreground mt-1">
            ניהול כספי ורישום הוצאות
          </p>
        </div>
        <Button
          type="button"
          className="btn-magenta"
          onClick={() => {
            if (!canSeeMoney) {
              showError('אין הרשאה להציג/לייצא סכומים עבור תפקיד Producer.');
              return;
            }
            setReportOpen(true);
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          ייצא דוח חודשי
        </Button>
      </motion.div>

      {!isDemoMode() && expensesLoadError && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-amber-800 dark:text-amber-200 text-sm flex items-center justify-between gap-2">
          <span>טעינת הוצאות נכשלה: {expensesLoadError}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => loadExpenses()}>
            נסה שוב
          </Button>
        </div>
      )}

      <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>סיכום תקופה</span>
            <span className="text-xs text-muted-foreground">{eventsLoading ? 'טוען…' : 'מתעדכן בזמן אמת'}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
            <div className="space-y-1">
              <Label className="text-foreground">מתאריך</Label>
              <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="border-primary/30" />
            </div>
            <div className="space-y-1">
              <Label className="text-foreground">עד תאריך</Label>
              <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="border-primary/30" />
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 min-h-[5rem] flex flex-col justify-center gap-1 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">נגבו (שולם)</div>
              <div className="text-xl font-bold text-foreground">
                {summary.collectedCount} אירועים · {canSeeMoney ? formatCurrency(summary.collectedTotal) : '***'}
              </div>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 min-h-[5rem] flex flex-col justify-center gap-1 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">לתשלום לאמנים</div>
              <div className="text-xl font-bold text-foreground">
                {canSeeMoney ? formatCurrency(summary.payableTotal) : '***'}
              </div>
              {summary.missingPayout > 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  {summary.missingPayout} אירועים ללא תשלום לאמן
                </div>
              )}
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 min-h-[5rem] flex flex-col justify-center gap-1 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">הוצאות בתקופה</div>
              <div className="text-xl font-bold text-foreground">
                {canSeeMoney ? formatCurrency(summary.expensesTotal) : '***'}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border/60">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-foreground">דוח לפי</Label>
                  <Select value={reportScope} onValueChange={(v) => {
                    const next = v as any;
                    setReportScope(next);
                    // reset dependent selection
                    if (next !== 'artist') setReportArtistId('');
                    if (next !== 'client') setReportClientId('');
                  }}>
                    <SelectTrigger className="border-primary/30">
                      <SelectValue placeholder="בחר" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">חברה</SelectItem>
                      <SelectItem value="artist">אמן</SelectItem>
                      <SelectItem value="client">לקוח</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {reportScope === 'artist' && (
                  <div className="space-y-1">
                    <Label className="text-foreground">אמן</Label>
                    <Select value={reportArtistId} onValueChange={(v) => setReportArtistId(v)}>
                      <SelectTrigger className="border-primary/30">
                        <SelectValue placeholder="בחר אמן" />
                      </SelectTrigger>
                      <SelectContent>
                        {artists.length === 0 ? (
                          <SelectItem value="__none__" disabled>אין אמנים</SelectItem>
                        ) : (
                          artists.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {reportScope === 'client' && (
                  <div className="space-y-1">
                    <Label className="text-foreground">לקוח</Label>
                    <Select value={reportClientId} onValueChange={(v) => setReportClientId(v)}>
                      <SelectTrigger className="border-primary/30">
                        <SelectValue placeholder="בחר לקוח" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.length === 0 ? (
                          <SelectItem value="__none__" disabled>אין לקוחות</SelectItem>
                        ) : (
                          clients.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-foreground">פורמט</Label>
                  <Select value={reportFormat} onValueChange={(v) => setReportFormat(v as any)}>
                    <SelectTrigger className="border-primary/30">
                      <SelectValue placeholder="בחר פורמט" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {reportLabel} · {periodFrom || '—'} → {periodTo || '—'} · {reportRows.length} שורות
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-primary/30"
                    onClick={() => setReportOpen(true)}
                    disabled={!reportReady || !canSeeMoney}
                    title={!reportReady ? 'נא לבחור מסננים נדרשים' : (!canSeeMoney ? 'Producer לא רואה סכומים' : undefined)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    הצג דוח
                  </Button>
                  <Button
                    type="button"
                    className="btn-magenta"
                    onClick={exportReport}
                    disabled={!reportReady || !canSeeMoney}
                    title={!reportReady ? 'נא לבחור מסננים נדרשים' : (!canSeeMoney ? 'Producer לא רואה סכומים' : undefined)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    ייצא דוח תקופה
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cash flow graph (memoized) */}
      {cashFlowData.length > 0 && (
        <FinanceCashFlowChart data={cashFlowData} canSeeMoney={canSeeMoney} />
      )}

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>דוח תקופה</DialogTitle>
            <DialogDescription>
              {reportLabel} · {periodFrom || '—'} → {periodTo || '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-1">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border bg-card p-3 min-h-[4rem] flex flex-col justify-center gap-1">
                <div className="text-xs text-muted-foreground">הכנסות (שולם)</div>
                <div className="text-lg font-bold text-foreground">{canSeeMoney ? reportTotals.incomePaid.toLocaleString('he-IL') : '***'}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 min-h-[4rem] flex flex-col justify-center gap-1">
                <div className="text-xs text-muted-foreground">הכנסות (סה״כ אירועים)</div>
                <div className="text-lg font-bold text-foreground">{canSeeMoney ? reportTotals.incomeAll.toLocaleString('he-IL') : '***'}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 min-h-[4rem] flex flex-col justify-center gap-1">
                <div className="text-xs text-muted-foreground">לתשלום לאמנים</div>
                <div className="text-lg font-bold text-foreground">{canSeeMoney ? reportTotals.payable.toLocaleString('he-IL') : '***'}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 min-h-[4rem] flex flex-col justify-center gap-1">
                <div className="text-xs text-muted-foreground">הוצאות (בתקופה)</div>
                <div className="text-lg font-bold text-foreground">
                  {reportScope === 'company' ? (canSeeMoney ? reportTotals.expensesTotal.toLocaleString('he-IL') : '***') : '—'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">תצוגה של {Math.min(reportRows.length, 200)} שורות (מוגבל ל‑200 למסך).</div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="border-primary/30" onClick={exportReport} disabled={!reportReady || !canSeeMoney}>
                  <Download className="w-4 h-4 mr-2" />
                  ייצא
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[50vh] rounded-lg border border-gray-100 dark:border-gray-800 table-scroll-wrap">
              <table className="w-full text-sm min-w-[700px] lg:min-w-0">
                <thead className="border-b bg-muted/50 dark:bg-gray-800/80">
                  <tr>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">סוג</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">תאריך אירוע</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">תאריך תשלום</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">לקוח</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">אמן</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">סטטוס</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">הכנסה</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">לתשלום לאמן</th>
                    <th className="h-10 px-3 text-right font-medium text-muted-foreground dark:text-gray-300">הערות</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.slice(0, 200).map((r, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-3">{r['סוג']}</td>
                      <td className="p-3 text-muted-foreground">{r['תאריך אירוע'] || '—'}</td>
                      <td className="p-3 text-muted-foreground">{r['תאריך תשלום'] || '—'}</td>
                      <td className="p-3">{r['לקוח'] || '—'}</td>
                      <td className="p-3">{r['אמן'] || '—'}</td>
                      <td className="p-3 text-muted-foreground">{r['סטטוס'] || '—'}</td>
                      <td className="p-3">{canSeeMoney ? (r['הכנסה לחברה'] === '' ? '—' : Number(r['הכנסה לחברה'] || 0).toLocaleString('he-IL')) : '***'}</td>
                      <td className="p-3">{canSeeMoney ? (r['לתשלום לאמן'] === '' ? '—' : Number(r['לתשלום לאמן'] || 0).toLocaleString('he-IL')) : '***'}</td>
                      <td className="p-3 text-xs text-muted-foreground max-w-[420px] truncate" title={String(r['הערות'] || '')}>{r['הערות'] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Checklist */}
        <div className="lg:col-span-2">
          <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  רשימת משימות חודשיות - {currentMonth}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {completedCount} מתוך {checklist.length}
                  {checklist.length > 0 && (
                    <span className="mr-2 font-semibold text-primary"> · {Math.round(progress)}%</span>
                  )}
                </span>
              </CardTitle>
              <div className="mt-3 space-y-1">
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${checklist.length ? progress : 0}%` }}
                    transition={{ type: 'spring', stiffness: 50, damping: 20 }}
                    className="bg-gradient-to-r from-primary to-purple-500 h-3 rounded-full min-w-[2px]"
                  />
                </div>
                <p className="text-xs text-muted-foreground">התקדמות רשימת המשימות החודשית</p>
              </div>
            </CardHeader>

            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-primary/30"
                  onClick={() => setEditChecklist(v => !v)}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {editChecklist ? 'סיים עריכה' : 'ערוך רשימה'}
                </Button>
                {editChecklist && (
                  <div className="flex gap-2">
                    <Input
                      value={newChecklistTitle}
                      onChange={(e) => setNewChecklistTitle(e.target.value)}
                      placeholder="הוסף משימה חדשה..."
                      className="border-primary/30"
                    />
                    <Button type="button" className="btn-magenta" onClick={addChecklistItem}>
                      <Plus className="w-4 h-4 mr-2" />
                      הוסף
                    </Button>
                  </div>
                )}
              </div>

              {checklist.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => toggleItem(item.id)}
                  className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-all duration-300 hover:bg-primary/10 hover:shadow-[0_0_15px_hsl(var(--primary)/0.3)] ${
                    item.completed ? 'bg-green-500/10 border border-green-500/30' : 'bg-card border border-border'
                  }`}
                >
                  <div>
                    {item.completed ? (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : (
                      <Circle className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    {editChecklist ? (
                      <Input
                        value={item.title}
                        onChange={(e) => updateChecklistTitle(item.id, e.target.value)}
                        className="border-primary/30"
                      />
                    ) : (
                      <span className={`${item.completed ? 'text-muted-foreground dark:text-gray-400 line-through' : 'text-foreground dark:text-gray-100 font-medium'}`}>
                        {item.title}
                      </span>
                    )}
                  </div>
                  {editChecklist && (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        removeChecklistItem(item.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Expense Upload */}
        <div className="flex flex-col">
          <Card className="border-gray-100 dark:border-gray-800 shadow-sm flex-1 flex flex-col min-h-[320px]">
            <CardHeader className="shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                העלאת הוצאות
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 flex-1 flex flex-col">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => addFiles(e.target.files || [])}
              />

              <div
                className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
                onClick={openFilePicker}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  addFiles(e.dataTransfer.files);
                }}
              >
                <Upload className="w-10 h-10 text-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  גרור ושחרר קבצים להעלאה
                </p>
                <p className="text-xs text-muted-foreground">
                  הקבצים יישמרו בתיקיית "הקבצים שלי"
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="btn-magenta flex-1 min-w-[140px]"
                  onClick={openFilePicker}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  בחר קבצים
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-w-[140px]"
                  onClick={() => setFileManagerOpen(true)}
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  הקבצים שלי
                </Button>
              </div>
              {reviewItems.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setReviewOpen(true)}
                >
                  עיין ושמור ({reviewItems.length})
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  syncExpensesToMorning();
                }}
              >
                סנכרן הוצאות ל‑Morning
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* File Manager Modal */}
      <Dialog open={fileManagerOpen} onOpenChange={setFileManagerOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              מסמכים שהועלו
            </DialogTitle>
            <DialogDescription>סינון לפי שם קובץ ותקופה. הנתונים נשמרים גם אחרי ניווט בין דפים.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder="חיפוש לפי שם קובץ..."
                value={fileManagerSearch}
                onChange={(e) => setFileManagerSearch(e.target.value)}
                className="border-primary/30"
              />
              <Select value={fileManagerPeriod} onValueChange={(v: any) => setFileManagerPeriod(v)}>
                <SelectTrigger className="border-primary/30">
                  <SelectValue placeholder="תקופה" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">היום</SelectItem>
                  <SelectItem value="month">החודש</SelectItem>
                  <SelectItem value="quarter">הרבעון</SelectItem>
                  <SelectItem value="year">השנה</SelectItem>
                  <SelectItem value="custom">טווח מותאם</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {fileManagerPeriod === 'custom' && (
              <div className="flex flex-wrap gap-2 items-center">
                <Label className="text-muted-foreground text-xs">מתאריך</Label>
                <Input
                  type="date"
                  value={fileManagerFrom}
                  onChange={(e) => setFileManagerFrom(e.target.value)}
                  className="w-40"
                />
                <Label className="text-muted-foreground text-xs">עד תאריך</Label>
                <Input
                  type="date"
                  value={fileManagerTo}
                  onChange={(e) => setFileManagerTo(e.target.value)}
                  className="w-40"
                />
              </div>
            )}
            <div className="border border-border rounded-lg overflow-auto flex-1 min-h-[200px]">
              {fileManagerFilteredList.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {expenses.length === 0
                    ? 'אין עדיין מסמכים שהועלו. העלה קבצים בעזרת "בחר קבצים".'
                    : 'אין תוצאות התואמות את הסינון.'}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {fileManagerFilteredList.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 p-3 hover:bg-muted/50">
                      <FileText className="w-5 h-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm truncate block">{e.filename || 'ללא שם'}</span>
                        <span className="text-xs text-muted-foreground">
                          {(e.created_at || '').slice(0, 10)} {e.amount != null ? ` · ${formatCurrency(Number(e.amount))}` : ''}
                        </span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => viewExpenseFile(e)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:bg-red-500/10"
                          onClick={() => {
                            if (confirm(`למחוק "${e.filename || e.id}"?`)) {
                              contextDeleteExpense(e.id);
                              success('הקובץ הוסר מהרשימה');
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recent Expenses (hidden when OCR is disabled to keep UI clean) */}
      {!OCR_DISABLED && (
      <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>הוצאות אחרונות</CardTitle>
            <div className="flex flex-wrap gap-3 items-center">
              {selectedCount > 0 && (
                <>
                  <div className="text-xs text-muted-foreground px-2 py-1 rounded-full border border-border bg-card">
                    נבחרו: {selectedCount}
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={deleteSelected} className="border-red-500/30 text-red-500 hover:bg-red-500/10">
                    מחק נבחרים
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
                    נקה בחירה
                  </Button>
                </>
              )}
              <Button
                type="button"
                size="sm"
                variant={expensesView === 'list' ? 'default' : 'outline'}
                className={expensesView === 'list' ? 'btn-magenta' : ''}
                onClick={() => setExpensesView('list')}
              >
                <List className="w-4 h-4 mr-2" />
                רשימה
              </Button>
              <Button
                type="button"
                size="sm"
                variant={expensesView === 'grid' ? 'default' : 'outline'}
                className={expensesView === 'grid' ? 'btn-magenta' : ''}
                onClick={() => setExpensesView('grid')}
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                אייקונים
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <FolderOpen className="w-16 h-16 text-muted-foreground/60 mx-auto mb-4" strokeWidth={1} />
              <p className="text-muted-foreground text-sm mb-1">אין נתונים להצגה</p>
              <p className="text-muted-foreground/80 text-sm">לחץ על הוסף או העלה קבצים כדי להתחיל</p>
            </div>
          ) : (
            <>
              {expensesView === 'list' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      טיפ: סמן/י כמה קבצים ואז “מחק נבחרים”.
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => selectAllVisible(expenses.slice(0, 20).map(e => e.id))}>
                        בחר הכל
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
                        נקה
                      </Button>
                    </div>
                  </div>
                  {expenses.slice(0, 20).map((e) => (
                    <div key={e.id} className="p-4 rounded-lg border border-border bg-card">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-[220px] flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!selectedExpenseIds[e.id]}
                              onChange={(ev) => toggleSelectedExpense(e.id, ev.target.checked)}
                              className="h-4 w-4 accent-primary shrink-0"
                            />
                            <div className="font-medium text-foreground">{e.filename}</div>
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                            {new Date(e.created_at).toLocaleString('he-IL')} · {(e.size / 1024).toFixed(0)}KB · {e.filetype || '—'}
                            {e.morning_status === 'synced' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-700 dark:text-green-400 text-xs font-medium">
                                סונכרן ל‑Morning
                              </span>
                            )}
                            {e.morning_status === 'syncing' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs">
                                מסנכרן…
                              </span>
                            )}
                            {e.morning_status === 'error' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-700 dark:text-red-400 text-xs">
                                שגיאה בסנכרון
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary">
                              ספק: {e.vendor?.trim() ? e.vendor : '—'}
                            </span>
                            <span className="px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                              סכום: {e.amount === undefined ? '—' : `${e.amount}`}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button type="button" size="icon" variant="outline" className="min-h-[44px] min-w-[44px] shrink-0" onClick={() => openExpenseEditor(e)} title="ערוך פרטים" aria-label="ערוך פרטים">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-[44px] min-w-[44px] shrink-0 px-3"
                            onClick={() => viewExpenseFile(e)}
                            disabled={!e.dataUrl && e.file_store !== 'idb' && e.file_store !== 'supabase'}
                          >
                            צפה
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-[44px] min-w-[44px] shrink-0 px-3"
                            onClick={() => downloadExpenseFile(e)}
                            disabled={!e.dataUrl && e.file_store !== 'idb' && e.file_store !== 'supabase'}
                          >
                            הורד
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="min-h-[44px] min-w-[44px] shrink-0 border-red-500/30 text-red-500 hover:bg-red-500/10"
                            onClick={() => {
                              if (!confirm('למחוק הוצאה זו?')) return;
                              deleteExpense(e.id);
                            }}
                            aria-label="מחק הוצאה"
                          >
                            מחק
                          </Button>
                        </div>
                      </div>

                      {inlineEditExpenseId === e.id ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">ספק / בית עסק</div>
                            <Input
                              value={e.vendor || ''}
                              onChange={(ev) => updateExpense(e.id, { vendor: ev.target.value })}
                              className="border-primary/30"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">סכום</div>
                            <Input
                              type="number"
                              value={e.amount ?? ''}
                              onChange={(ev) => updateExpense(e.id, { amount: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                              className="border-primary/30"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">הערות</div>
                            <Input
                              value={e.notes || ''}
                              onChange={(ev) => updateExpense(e.id, { notes: ev.target.value })}
                              className="border-primary/30"
                            />
                          </div>
                          <div className="md:col-span-3 flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setInlineEditExpenseId(null)}>
                              סיים
                            </Button>
                            <Button type="button" className="btn-magenta" onClick={() => setInlineEditExpenseId(null)}>
                              שמור
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                          <div className="rounded-md border border-border bg-background/40 dark:bg-card/60 px-3 py-2">
                            <div className="text-xs text-muted-foreground">ספק / בית עסק</div>
                            <div className="text-foreground font-medium truncate">{e.vendor?.trim() ? e.vendor : '—'}</div>
                          </div>
                          <div className="rounded-md border border-border bg-background/40 dark:bg-card/60 px-3 py-2">
                            <div className="text-xs text-muted-foreground">סכום</div>
                            <div className="text-foreground font-medium">{e.amount === undefined ? '—' : e.amount}</div>
                          </div>
                          <div className="rounded-md border border-border bg-background/40 dark:bg-card/60 px-3 py-2">
                            <div className="text-xs text-muted-foreground">הערות</div>
                            <div className="text-foreground font-medium truncate">{cleanNotes(e.notes) || '—'}</div>
                          </div>
                          <div className="md:col-span-3 flex justify-end">
                            <Button type="button" variant="outline" size="sm" onClick={() => setInlineEditExpenseId(e.id)} title="ערוך פרטים">
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {expenses.slice(0, 24).map((e) => {
                    const isImg = !!e.dataUrl && (e.filetype?.startsWith('image/') || e.dataUrl.startsWith('data:image'));
                    return (
                      <div
                        key={e.id}
                        className="relative text-right p-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-[0_0_12px_hsl(var(--primary)/0.18)] transition-all"
                      >
                        <div className="absolute top-2 right-2">
                          <input
                            type="checkbox"
                            checked={!!selectedExpenseIds[e.id]}
                            onChange={(ev) => toggleSelectedExpense(e.id, ev.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                        </div>
                        <button type="button" onClick={() => openExpenseEditor(e)} className="w-full text-right">
                        <div className="w-full h-28 rounded-md border border-border overflow-hidden bg-background flex items-center justify-center">
                          {isImg ? (
                            <img src={e.dataUrl} alt={e.filename} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-xs text-muted-foreground">PDF / קובץ</div>
                          )}
                        </div>
                        <div className="mt-2">
                          <div className="text-sm font-medium text-foreground truncate">{e.filename}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            ספק: {e.vendor?.trim() ? e.vendor : '—'} · סכום: {e.amount === undefined ? '—' : e.amount}
                          </div>
                        </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      )}

      <Dialog open={expenseEditorOpen} onOpenChange={(v) => { if (!v) setExpenseEditing(null); setExpenseEditorOpen(v); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>קובץ הוצאה</DialogTitle>
            <DialogDescription>
              צפייה ועריכה של פרטי הקובץ שהועלה.
            </DialogDescription>
          </DialogHeader>

          {expenseEditing ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm font-medium text-foreground">{expenseEditing.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(expenseEditing.created_at).toLocaleString('he-IL')} · {(expenseEditing.size / 1024).toFixed(0)}KB · {expenseEditing.filetype}
                </div>
                {expenseEditing.dataUrl && (expenseEditing.filetype.startsWith('image/') || expenseEditing.dataUrl.startsWith('data:image')) && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-border">
                    <img src={expenseEditing.dataUrl} alt="expense preview" className="w-full max-h-80 object-contain bg-background" />
                  </div>
                )}
                {!expenseEditing.dataUrl && (
                  <div className="mt-3 text-sm text-muted-foreground">אין תצוגה מקדימה לקובץ זה.</div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => viewExpenseFile(expenseEditing)}
                    disabled={!expenseEditing.dataUrl && expenseEditing.file_store !== 'idb' && expenseEditing.file_store !== 'supabase'}
                  >
                    צפה
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => downloadExpenseFile(expenseEditing)}
                    disabled={!expenseEditing.dataUrl && expenseEditing.file_store !== 'idb' && expenseEditing.file_store !== 'supabase'}
                  >
                    הורד קובץ
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-foreground">ספק / בית עסק</Label>
                  <Input value={expenseEditVendor} onChange={(e) => setExpenseEditVendor(e.target.value)} className="border-primary/30" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">סכום</Label>
                  <Input type="number" value={expenseEditAmount} onChange={(e) => setExpenseEditAmount(e.target.value)} className="border-primary/30" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">הערות</Label>
                  <Input value={expenseEditNotes} onChange={(e) => setExpenseEditNotes(e.target.value)} className="border-primary/30" />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setExpenseEditorOpen(false)}>
                  ביטול
                </Button>
                <Button type="button" className="btn-magenta" onClick={saveExpenseEditor}>
                  שמור
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">לא נבחרה הוצאה.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review extracted data before save (production) */}
      <Dialog open={reviewOpen} onOpenChange={(v) => setReviewOpen(v)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>בדוק פרטים לפני שמירה</DialogTitle>
            <DialogDescription>המערכת חילצה פרטים מהקבצים. ערוך במידת הצורך ולחץ שמור.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {reviewItems.map(({ id, file, extracted }) => (
              <div key={id} className="p-4 rounded-lg border border-primary/20 bg-card space-y-3">
                <div className="text-sm font-medium text-foreground truncate">{file.name}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">ספק</Label>
                    <Input
                      value={extracted.supplier_name}
                      onChange={(e) => updateReviewItem(id, { supplier_name: e.target.value })}
                      className="border-primary/30 h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">סכום</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={extracted.amount ?? ''}
                      onChange={(e) => updateReviewItem(id, { amount: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="border-primary/30 h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">מע״מ</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={extracted.vat ?? ''}
                      onChange={(e) => updateReviewItem(id, { vat: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="border-primary/30 h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">תאריך</Label>
                    <Input
                      type="date"
                      value={extracted.expense_date ?? ''}
                      onChange={(e) => updateReviewItem(id, { expense_date: e.target.value })}
                      className="border-primary/30 h-9"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => { setReviewOpen(false); setReviewItems([]); }}>
              ביטול
            </Button>
            <Button type="button" className="btn-magenta" onClick={saveReviewAndUpload} disabled={uploadLoading}>
              {uploadLoading ? 'שומר…' : 'שמור כולם (נשמר לצורך מס ו‑Morning)'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const FinancePage: React.FC = () => {
  const { currentAgency } = useAgency();
  const agencyId = currentAgency?.id || '';
  if (!currentAgency) {
    return (
      <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader><CardTitle>פיננסים</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">טוען סוכנות…</CardContent>
      </Card>
    );
  }
  return (
    <FinanceProvider agencyId={agencyId}>
      <FinancePageContent />
    </FinanceProvider>
  );
};

export default FinancePage;
