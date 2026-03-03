import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  RowSelectionState,
} from '@tanstack/react-table';
import { Plus, Search, Download, Edit, Trash2, ArrowUpDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { NewEventForm } from '@/components/NewEventForm';
import { useAgency } from '@/contexts/AgencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { supabase } from '@/lib/supabase';
import { formatDate, getWeekday } from '@/lib/utils';
// exportUtils (xlsx ~643KB) is loaded lazily on first export click
import type { Event } from '@/types';
import { demoGetEvents, demoSetEvents, isDemoMode } from '@/lib/demoStore';
import { useEventsQuery, useArtistsQuery, useClientsQuery, useInvalidateEvents, useInvalidateArtists } from '@/hooks/useSupabaseQuery';
import { getMorningApiKey, getMorningCompanyId, isIntegrationConnected } from '@/lib/settingsStore';
import { useSearchParams } from 'react-router-dom';
import { queueSyncJob } from '@/lib/syncJobs';
import { createEventDocument, checkEventDocumentStatus } from '@/services/morningService';
import { getCollectionStatus } from '@/lib/collectionStatus';

const EventsPage: React.FC = () => {
  const { currentAgency } = useAgency();
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const canCreateEvent =
    !!user &&
    (user.permissions?.events_create === true ||
      (user.permissions?.events_create !== false && ['producer', 'manager', 'owner'].includes(user.role)));
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: events = [], isLoading: loading } = useEventsQuery(currentAgency?.id);
  const { data: clients = [] } = useClientsQuery(currentAgency?.id);
  const { data: artists = [] } = useArtistsQuery(currentAgency?.id);
  const invalidateEvents = useInvalidateEvents();
  const invalidateArtists = useInvalidateArtists();
  const [requestCorrectionEvent, setRequestCorrectionEvent] = useState<Event | null>(null);

  const isRowLocked = (ev: Event) => !!(ev.morning_id || ev.morning_sync_status === 'synced');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterArtistId, setFilterArtistId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const isOwner = user?.role === 'owner';

  // Deep-link edit support (used by Daybook owner-only edit button)
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId) return;
    if (loading) return;
    const ev = events.find(e => e.id === editId);
    if (!ev) return;
    openDialog(ev);
    const next = new URLSearchParams(searchParams);
    next.delete('edit');
    next.delete('from');
    setSearchParams(next, { replace: true });
  }, [searchParams, loading, events]);

  const handleDelete = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק אירוע זה?')) return;

    try {
      // DEMO MODE: delete locally
      if (isDemoMode()) {
        if (!currentAgency) return;
        const next = demoGetEvents(currentAgency.id).filter(e => e.id !== id);
        demoSetEvents(currentAgency.id, next);
        invalidateEvents(currentAgency.id);
        success('אירוע נמחק בהצלחה! ✅');
        return;
      }

      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      success('אירוע נמחק בהצלחה! ✅');
      invalidateEvents(currentAgency?.id);
    } catch {
      showError('מחיקת האירוע נכשלה. אנא נסה שוב.');
    }
  };

  const updateEventInline = async (eventId: string, patch: Partial<Event>) => {
    if (!currentAgency) return;

    try {
      if (isDemoMode()) {
        const next = demoGetEvents(currentAgency.id).map((e) => (e.id === eventId ? { ...e, ...patch } : e));
        demoSetEvents(currentAgency.id, next);
        invalidateEvents(currentAgency.id);
        return;
      }
      const { error } = await supabase.from('events').update(patch as any).eq('id', eventId);
      if (error) throw error;
      invalidateEvents(currentAgency.id);
    } catch (e: any) {
      showError(e?.message || 'אירעה שגיאה בעדכון. אנא נסה שוב.');
      invalidateEvents(currentAgency.id);
    }
  };

  const openDialog = (event?: Event) => {
    setEditingEvent(event || null);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingEvent(null);
  };

  const columns: ColumnDef<Event>[] = [
    {
      id: 'select',
      header: ({ table }) => {
        const all = table.getIsAllPageRowsSelected();
        const some = table.getIsSomePageRowsSelected();
        return (
          <input
            type="checkbox"
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = !all && some;
            }}
            onChange={(e) => table.toggleAllPageRowsSelected(e.currentTarget.checked)}
            className="h-4 w-4 accent-primary"
            aria-label="בחר הכל"
            disabled={!isOwner}
            title={!isOwner ? 'אין הרשאה למחיקה' : 'בחר הכל בעמוד'}
          />
        );
      },
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.currentTarget.checked)}
          className="h-4 w-4 accent-primary"
          aria-label="בחר שורה"
          disabled={!isOwner}
          title={!isOwner ? 'אין הרשאה למחיקה' : 'בחר שורה'}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 48,
    },
    {
      accessorKey: 'event_date',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent"
        >
          תאריך
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => formatDate(row.getValue('event_date')),
    },
    {
      accessorKey: 'weekday',
      header: 'יום',
      cell: ({ row }) => getWeekday(row.original.event_date),
    },
    {
      accessorKey: 'business_name',
      header: 'שם עסק',
    },
    {
      accessorKey: 'invoice_name',
      header: 'שם בחשבונית',
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent"
        >
          סכום
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        // Hide amount for producers
        if (user?.role === 'producer') return '***';
        const ev = row.original;
        const locked = isRowLocked(ev);
        return (
          <Input
            type="number"
            step="0.01"
            defaultValue={String(ev.amount ?? 0)}
            className="h-9 w-28 border-primary/30 min-h-[44px] min-w-[44px]"
            disabled={!isOwner || locked}
            title={locked ? 'שורה נעולה (מסמך רשמי)' : !isOwner ? 'אין הרשאה לערוך' : undefined}
            onBlur={(e) => {
              if (locked) return;
              const v = Number(e.currentTarget.value);
              if (!Number.isFinite(v)) return;
              if (v === Number(ev.amount || 0)) return;
              updateEventInline(ev.id, { amount: v } as any);
            }}
          />
        );
      },
    },
    {
      accessorKey: 'payment_date',
      header: 'תאריך תשלום',
      cell: ({ row }) => {
        const ev = row.original;
        const locked = isRowLocked(ev);
        const raw = (ev.payment_date ? String(ev.payment_date) : '').slice(0, 10);
        return (
          <Input
            type="date"
            defaultValue={raw}
            className="h-9 w-36 border-primary/30 min-h-[44px] min-w-[44px]"
            disabled={!isOwner || locked}
            title={locked ? 'שורה נעולה' : !isOwner ? 'אין הרשאה לערוך' : undefined}
            onBlur={(e) => {
              if (locked) return;
              const v = e.currentTarget.value;
              const next = v ? v : null;
              if (String(ev.payment_date || '').slice(0, 10) === String(next || '')) return;
              updateEventInline(ev.id, { payment_date: next as any } as any);
            }}
          />
        );
      },
    },
    {
      accessorKey: 'doc_type',
      header: 'סוג מסמך',
      cell: ({ row }) => {
        const type = row.getValue('doc_type') as string;
        return type === 'tax_invoice' ? 'חשבונית מס' : type === 'receipt' ? 'קבלה' : 'חשבון עסקה';
      },
    },
    {
      accessorKey: 'doc_number',
      header: 'מספר מסמך',
    },
    {
      accessorKey: 'status',
      header: 'סטטוס גבייה',
      cell: ({ row }) => {
        const ev = row.original;
        const info = getCollectionStatus(ev);
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${info.badgeClass}`}>
            {info.labelHe}
          </span>
        );
      },
    },
    {
      accessorKey: 'due_date',
      header: 'תאריך יעד',
      cell: ({ row }) => {
        const ev = row.original;
        const locked = isRowLocked(ev);
        const raw = (ev.due_date || '').toString().slice(0, 10);
        return (
          <Input
            type="date"
            defaultValue={raw}
            className="h-9 min-h-[44px] min-w-[44px] w-36 border-primary/30"
            disabled={locked}
            title={locked ? 'שורה נעולה (מסמך רשמי ב־Morning)' : undefined}
            onBlur={(e) => {
              if (locked) return;
              const v = e.currentTarget.value || undefined;
              if (String(ev.due_date || '').slice(0, 10) === (v || '')) return;
              updateEventInline(ev.id, { due_date: v || null } as any);
            }}
          />
        );
      },
    },
    {
      accessorKey: 'morning_sync_status',
      header: 'סנכרון Morning',
      cell: ({ row }) => {
        const syncStatus = row.original.morning_sync_status || 'not_synced';
        const morningUrl = (row.original as any).morning_document_url as string | undefined;
        const morningErr = (row.original as any).morning_last_error as string | undefined;
        
        if (syncStatus === 'not_synced') {
          return (
            <Button
              size="sm"
              onClick={async () => {
                if (!currentAgency) return;
                const eventId = row.original.id;

                if (isDemoMode()) {
                  const connected = isIntegrationConnected(currentAgency.id, 'morning');
                  const apiKey = getMorningApiKey(currentAgency.id);
                  const companyId = getMorningCompanyId(currentAgency.id);
                  if (!connected || !apiKey || !companyId) {
                    showError('חיבור Morning חסר. בדמו — הפעל Sandbox credentials בהגדרות סביבה.');
                    return;
                  }
                  // Demo: simulate sync (mock)
                  const syncing = events.map(e => (e.id === eventId ? { ...e, morning_sync_status: 'syncing' as const } : e));
                  demoSetEvents(currentAgency.id, syncing);
                  invalidateEvents(currentAgency.id);
                  await new Promise(resolve => setTimeout(resolve, 1200));
                  const synced = syncing.map(e => (e.id === eventId ? { ...e, morning_sync_status: 'synced' as const } : e));
                  demoSetEvents(currentAgency.id, synced);
                  invalidateEvents(currentAgency.id);
                  success('דמו: הסנכרון עם Morning הושלם ✅');
                  return;
                }

                // Production: call Vercel API Route (Morning API proxy; credentials server-side)
                const result = await createEventDocument(currentAgency.id, eventId);
                if (result.ok) {
                  success('המסמך נוצר ב־Morning בהצלחה ✅');
                  invalidateEvents(currentAgency.id);
                } else {
                  showError(result.error + (result.detail ? ` — ${result.detail}` : ''));
                  invalidateEvents(currentAgency.id);
                }
              }}
              className="btn-magenta text-xs relative overflow-hidden"
            >
              סנכרן Morning
            </Button>
          );
        }
        
        if (syncStatus === 'syncing') {
          return (
            <div className="flex items-center gap-2 text-blue-500 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>מסנכרן...</span>
            </div>
          );
        }
        
        if (syncStatus === 'synced') {
          const eventId = row.original.id;
          const hasDocId = !!(row.original as any).morning_document_id;
          return (
            <div className="flex flex-col gap-1.5">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-500 border border-green-500/50 flex items-center gap-1 w-fit">
                <span>✅</span>
                <span>סונכרן בהצלחה</span>
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {morningUrl ? (
                  <a href={morningUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline w-fit">
                    פתח מסמך
                  </a>
                ) : null}
                {hasDocId && !isDemoMode() ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    onClick={async () => {
                      if (!currentAgency) return;
                      const res = await checkEventDocumentStatus(currentAgency.id, eventId);
                      if (res.ok) {
                        success('סטטוס עודכן מ־Morning ✅');
                        invalidateEvents(currentAgency.id);
                      } else {
                        showError(res.error + (res.detail ? ` — ${res.detail}` : ''));
                      }
                    }}
                  >
                    בדוק סטטוס
                  </Button>
                ) : null}
              </div>
            </div>
          );
        }

        if (syncStatus === 'error') {
          return (
            <div className="flex flex-col gap-1">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-500 border border-red-500/50 flex items-center gap-1 w-fit">
                <span>⚠️</span>
                <span>שגיאה</span>
              </span>
              <div className="text-[11px] text-muted-foreground max-w-[180px] truncate" title={morningErr || ''}>
                {(() => {
                  if (!morningErr) return '—';
                  try {
                    const o = JSON.parse(morningErr);
                    return (typeof o?.message === 'string' ? o.message : morningErr) || '—';
                  } catch {
                    return morningErr;
                  }
                })()}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!currentAgency) return;
                  await queueSyncJob({
                    agencyId: currentAgency.id,
                    provider: 'morning',
                    kind: 'event_document_create',
                    payload: { event_id: row.original.id },
                    createdBy: user?.id,
                  });
                  success('נוצר Retry ל‑Morning ✅');
                  invalidateEvents(currentAgency.id);
                }}
              >
                נסה שוב
              </Button>
            </div>
          );
        }
        
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/50">
            לא סונכרן
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'פעולות',
      cell: ({ row }) => {
        const ev = row.original;
        const locked = isRowLocked(ev);
        return (
          <div className="flex items-center gap-2 min-h-[44px]">
            {locked ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px] min-w-[44px] px-3"
                onClick={() => setRequestCorrectionEvent(ev)}
                title="בקשת תיקון למסמך רשמי"
              >
                בקשת תיקון
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 min-h-[44px] min-w-[44px]"
                  onClick={() => openDialog(ev)}
                  title="עריכה"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 min-h-[44px] min-w-[44px] text-red-500 hover:text-red-600"
                  onClick={() => handleDelete(ev.id)}
                  disabled={!isOwner}
                  title={!isOwner ? 'אין הרשאה למחיקה' : undefined}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  const filteredEvents = useMemo(() => {
    let list = events;
    if (filterDateFrom) list = list.filter((e) => String(e.event_date || '').slice(0, 10) >= filterDateFrom);
    if (filterDateTo) list = list.filter((e) => String(e.event_date || '').slice(0, 10) <= filterDateTo);
    if (filterArtistId) list = list.filter((e) => e.artist_id === filterArtistId);
    if (filterStatus) list = list.filter((e) => e.status === filterStatus);
    return list;
  }, [events, filterDateFrom, filterDateTo, filterArtistId, filterStatus]);

  const table = useReactTable({
    data: filteredEvents,
    columns,
    initialState: { pagination: { pageSize: 25, pageIndex: 0 } },
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleExport = async () => {
    const filteredEvents = table.getFilteredRowModel().rows.map(row => row.original);
    const { exportEventsToExcel } = await import('@/lib/exportUtils');
    exportEventsToExcel(filteredEvents, 'events-export');
  };

  const selectedIds = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => (r.original as Event).id),
    [rowSelection]
  );

  const bulkDelete = async () => {
    if (!currentAgency) return;
    if (!isOwner) {
      showError('אין הרשאה למחיקה');
      return;
    }
    if (selectedIds.length === 0) return;
    if (!confirm(`למחוק ${selectedIds.length} אירועים?`)) return;
    setBulkDeleting(true);
    try {
      if (isDemoMode()) {
        const next = demoGetEvents(currentAgency.id).filter((e) => !selectedIds.includes(e.id));
        demoSetEvents(currentAgency.id, next);
        invalidateEvents(currentAgency.id);
        setRowSelection({});
        success('נמחקו אירועים נבחרים ✅');
        return;
      }
      const { error } = await supabase.from('events').delete().in('id', selectedIds);
      if (error) throw error;
      setRowSelection({});
      success('נמחקו אירועים נבחרים ✅');
      invalidateEvents(currentAgency?.id);
    } catch (e: any) {
      showError(e?.message || 'מחיקת האירועים נכשלה. אנא נסה שוב.');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-8 min-w-0">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">אירועים</h1>
          <p className="text-muted-foreground mt-1">נהל את כל האירועים שלך במקום אחד</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-offset-2" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            ייצא לדוח
          </Button>
          <Button className="btn-magenta focus-visible:ring-2 focus-visible:ring-offset-2 hover:opacity-90" onClick={() => openDialog()} disabled={!canCreateEvent}>
            <Plus className="w-4 h-4 mr-2" />
            אירוע חדש
          </Button>
        </div>
      </motion.div>

      <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
        <CardHeader className="p-5 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="date"
              placeholder="מתאריך"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-40 border-gray-200 dark:border-gray-700"
            />
            <Input
              type="date"
              placeholder="עד תאריך"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-40 border-gray-200 dark:border-gray-700"
            />
            <Select value={filterArtistId || '_all'} onValueChange={(v) => setFilterArtistId(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-44 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="אמן" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">כל האמנים</SelectItem>
                {artists.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus || '_all'} onValueChange={(v) => setFilterStatus(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-36 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="סטטוס" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">כל הסטטוסים</SelectItem>
                <SelectItem value="draft">טיוטה</SelectItem>
                <SelectItem value="pending">ממתין</SelectItem>
                <SelectItem value="partial">חלקי</SelectItem>
                <SelectItem value="collected">נגבה</SelectItem>
                <SelectItem value="cancelled">בוטל</SelectItem>
              </SelectContent>
            </Select>
            {(filterDateFrom || filterDateTo || filterArtistId || filterStatus) && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterArtistId(''); setFilterStatus(''); }}>
                נקה סינון
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש אירועים..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-10 border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 md:p-6 pt-0">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              <p className="mt-2 text-muted-foreground">טוען...</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 p-3">
                  <div className="text-sm text-foreground">
                    נבחרו <span className="font-bold">{selectedIds.length}</span> אירועים
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-red-500/40 text-red-600 hover:bg-red-500/10"
                      onClick={bulkDelete}
                      disabled={!isOwner || bulkDeleting}
                      title={!isOwner ? 'אין הרשאה למחיקה' : undefined}
                    >
                      {bulkDeleting ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          מוחק...
                        </span>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" />
                          מחק נבחרים
                        </>
                      )}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setRowSelection({})}>
                      נקה בחירה
                    </Button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto table-scroll-wrap -mx-px">
                <table className="w-full min-w-[800px] lg:min-w-0">
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="border-b border-gray-100 dark:border-gray-800 bg-muted/50 dark:bg-gray-800/80">
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            className="h-12 px-4 text-right align-middle font-medium text-muted-foreground dark:text-gray-300"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows?.length ? (
                      table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-gray-100 dark:border-gray-800 transition-colors hover:bg-muted/40 cursor-pointer"
                      >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="p-4 align-middle">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={columns.length} className="h-64 text-center">
                          <div className="flex flex-col items-center justify-center space-y-4 py-12">
                            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center ring-4 ring-primary/20 animate-pulse">
                              <Sparkles className="w-10 h-10 text-primary" />
                            </div>
                            <h3 className="text-xl font-semibold text-foreground">
                              מוכנים להפיק את האירוע הראשון?
                            </h3>
                            <p className="text-muted-foreground max-w-md text-sm">
                              אין נתונים להצגה. לחץ על צור אירוע כדי להתחיל.
                            </p>
                            <Button className="btn-magenta mt-4" onClick={() => openDialog()} disabled={!canCreateEvent}>
                              <Plus className="w-4 h-4 mr-2" />
                              צור אירוע ראשון
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between p-4 md:p-6">
                <div className="text-sm text-muted-foreground">
                  {table.getFilteredRowModel().rows.length} אירועים
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    הקודם
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    הבא
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Correction (locked row / official document) */}
      <Dialog open={!!requestCorrectionEvent} onOpenChange={(open) => !open && setRequestCorrectionEvent(null)}>
        <DialogContent className="max-w-md glass border-primary/20">
          <DialogHeader>
            <DialogTitle className="text-xl text-foreground">בקשת תיקון למסמך רשמי</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              האירוע סונכרן ל־Morning ומסמך רשמי נוצר. עריכות ישירות אינן מתאפשרות כדי לשמור על התאמה לספרים.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-foreground">
              שליחת בקשת תיקון תגרור עדכון במערכת החשבונות ויכולה להשפיע על זיכויי מסמכים רשמיים. האם להמשיך?
            </p>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setRequestCorrectionEvent(null)}>
                ביטול
              </Button>
              <Button
                type="button"
                className="btn-magenta"
                onClick={() => {
                  success('בקשת תיקון תישלח לחיבור Morning (מוכן לחיבור API)');
                  setRequestCorrectionEvent(null);
                }}
              >
                שלח בקשת תיקון
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog — NewEventForm (NPC Collective Production) */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingEvent(null); }}>
        <DialogContent className="max-w-3xl glass border-primary/20 max-h-[90vh] overflow-y-auto modu-dialog-scroll pb-[env(safe-area-inset-bottom)]">
          <DialogHeader>
            <DialogTitle className="text-2xl text-foreground">
              {editingEvent ? 'עריכת אירוע' : 'אירוע חדש'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              מלא את פרטי האירוע
            </DialogDescription>
          </DialogHeader>
          {!isDemoMode() && currentAgency && (
            <NewEventForm
              open={isDialogOpen}
              onClose={closeDialog}
              onSuccess={() => { invalidateEvents(currentAgency.id); closeDialog(); }}
              agencyId={currentAgency.id}
              userId={user?.id}
              artists={artists}
              clients={clients}
              editingEvent={editingEvent ? {
                id: editingEvent.id,
                business_name: editingEvent.business_name,
                invoice_name: editingEvent.invoice_name,
                event_date: String(editingEvent.event_date || '').slice(0, 10),
                event_time: editingEvent.event_time,
                event_time_end: editingEvent.event_time_end,
                location: (editingEvent as { location?: string }).location,
                amount: editingEvent.amount,
                payment_date: editingEvent.payment_date,
                due_date: editingEvent.due_date,
                doc_type: editingEvent.doc_type,
                doc_number: editingEvent.doc_number,
                status: editingEvent.status,
                notes: editingEvent.notes,
                client_id: editingEvent.client_id,
                artist_id: editingEvent.artist_id,
              } : undefined}
              onError={showError}
              onSuccessToast={success}
              onArtistsInvalidate={currentAgency ? () => invalidateArtists(currentAgency.id) : undefined}
            />
          )}
          {isDemoMode() && (
            <p className="text-muted-foreground py-4">מצב דמו — השתמש בטופס המלא בדשבורד או הפעל חיבור ל-Supabase.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventsPage;
