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
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useAgency } from '@/contexts/AgencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { supabase } from '@/lib/supabase';
import { formatDate, getWeekday } from '@/lib/utils';
import { exportEventsToExcel } from '@/lib/exportUtils';
import type { Client, Artist, DocumentType, Event, EventStatus } from '@/types';
import {
  demoGetArtists,
  demoGetClients,
  demoGetDocuments,
  demoGetEvents,
  demoSetArtists,
  demoSetClients,
  demoSetEvents,
  demoUpsertArtist,
  demoUpsertClient,
  isDemoMode,
} from '@/lib/demoStore';
import { useArtistsQuery, useClientsQuery, useInvalidateClients, useInvalidateArtists } from '@/hooks/useSupabaseQuery';
import { buildTemplateVariables, demoAddSentDoc, renderTemplate } from '@/lib/sentDocs';
import { getMorningApiKey, getMorningCompanyId, isIntegrationConnected } from '@/lib/settingsStore';
import { useSearchParams } from 'react-router-dom';
import { queueSyncJob } from '@/lib/syncJobs';
import { createEventDocument, checkEventDocumentStatus } from '@/services/morningService';
import { agreementService } from '@/services/agreementService';
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
  const [events, setEvents] = useState<Event[]>([]);
  const { data: clients = [] } = useClientsQuery(currentAgency?.id);
  const { data: artists = [] } = useArtistsQuery(currentAgency?.id);
  const invalidateClients = useInvalidateClients();
  const invalidateArtists = useInvalidateArtists();
  const [requestCorrectionEvent, setRequestCorrectionEvent] = useState<Event | null>(null);

  const isRowLocked = (ev: Event) => !!(ev.morning_id || ev.morning_sync_status === 'synced');
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const isOwner = user?.role === 'owner';
  type EventFormData = {
    event_date: string;
    business_name: string;
    client_business_name: string;
    artist_name: string;
    invoice_name: string;
    amount: string;
    payment_date: string;
    due_date: string;
    // Snapshot of the artist default payout model at time of event creation/edit
    artist_fee_type: 'fixed' | 'percent';
    artist_fee_value: string;
    // Optional override amount for this specific event (owner only)
    artist_fee_amount_override: string;
    doc_type: DocumentType;
    doc_number: string;
    status: EventStatus;
    notes: string;
    send_calendar_invite: boolean;
    send_agreement: boolean;
  };

  const [formData, setFormData] = useState<EventFormData>({
    event_date: '',
    business_name: '',
    client_business_name: '',
    artist_name: '',
    invoice_name: '',
    amount: '',
    payment_date: '',
    due_date: '',
    artist_fee_type: 'fixed',
    artist_fee_value: '',
    artist_fee_amount_override: '',
    doc_type: 'tax_invoice',
    doc_number: '',
    status: 'pending',
    notes: '',
    send_calendar_invite: true,
    send_agreement: false,
  });

  const computeArtistFee = (companyAmount: number, feeType: 'fixed' | 'percent', feeValue: number) => {
    if (!Number.isFinite(companyAmount) || companyAmount < 0) return 0;
    if (!Number.isFinite(feeValue) || feeValue < 0) return 0;
    if (feeType === 'percent') return Math.max(0, (companyAmount * feeValue) / 100);
    return Math.max(0, feeValue);
  };

  // Artist payout model is stored on the artist profile (demo-first).
  // To avoid DB schema drift, we embed it into Artist.notes as a special marker line.
  const PAYOUT_MARKER = '__IMA_PAYOUT__=';
  const parsePayoutFromNotes = (notesRaw: string | undefined | null): { type: 'fixed' | 'percent'; value: number } | null => {
    try {
      const line = String(notesRaw || '')
        .split('\n')
        .find((l) => l.trim().startsWith(PAYOUT_MARKER));
      if (!line) return null;
      const raw = line.trim().slice(PAYOUT_MARKER.length);
      const parsed = JSON.parse(raw) as any;
      const type = parsed?.type === 'percent' ? 'percent' : 'fixed';
      const value = Number(parsed?.value);
      return { type, value: Number.isFinite(value) ? value : 0 };
    } catch {
      return null;
    }
  };

  const resolveArtistPayout = (artistId?: string | null, artistName?: string | null) => {
    const a =
      (artistId ? artists.find((x) => x.id === artistId) : undefined) ??
      (artistName ? artists.find((x) => x.name.toLowerCase() === String(artistName).toLowerCase()) : undefined);
    const parsed = parsePayoutFromNotes(a?.notes);
    return {
      type: (parsed?.type || 'fixed') as 'fixed' | 'percent',
      value: Number(parsed?.value || 0),
      artist: a,
    };
  };

  useEffect(() => {
    if (currentAgency) {
      fetchEvents();
    } else {
      setLoading(false);
    }
  }, [currentAgency]);

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

  const fetchEvents = async () => {
    if (!currentAgency) return;
    try {
      setLoading(true);
      if (isDemoMode()) {
        setEvents(demoGetEvents(currentAgency.id));
        return;
      }
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('agency_id', currentAgency.id)
        .order('event_date', { ascending: false });
      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      if (isDemoMode()) {
        setEvents(demoGetEvents(currentAgency?.id || 'npc-agency-id'));
      } else {
        showError('טעינת האירועים נכשלה. אנא נסה שוב.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק אירוע זה?')) return;

    try {
      // DEMO MODE: delete locally
      if (isDemoMode()) {
        if (!currentAgency) return;
        const next = demoGetEvents(currentAgency.id).filter(e => e.id !== id);
        demoSetEvents(currentAgency.id, next);
        setEvents(next);
        success('אירוע נמחק בהצלחה! ✅');
        return;
      }

      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      success('אירוע נמחק בהצלחה! ✅');
      await fetchEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      showError('מחיקת האירוע נכשלה. אנא נסה שוב.');
    }
  };

  const updateEventInline = async (eventId: string, patch: Partial<Event>) => {
    if (!currentAgency) return;
    // Optimistic UI
    setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, ...patch } : e)));

    try {
      if (isDemoMode()) {
        const next = demoGetEvents(currentAgency.id).map((e) => (e.id === eventId ? { ...e, ...patch } : e));
        demoSetEvents(currentAgency.id, next);
        return;
      }
      const { error } = await supabase.from('events').update(patch as any).eq('id', eventId);
      if (error) throw error;
    } catch (e: any) {
      console.error(e);
      showError(e?.message || 'אירעה שגיאה בעדכון. אנא נסה שוב.');
      // best-effort refresh
      fetchEvents();
    }
  };

  const openDialog = (event?: Event) => {
    if (event) {
      setEditingEvent(event);
      const clientName = event.client_id ? (clients.find(c => c.id === event.client_id)?.name ?? '') : '';
      const artistName = event.artist_id ? (artists.find(a => a.id === event.artist_id)?.name ?? '') : '';
      const payout = resolveArtistPayout(event.artist_id, artistName);
      setFormData({
        event_date: String(event.event_date || '').slice(0, 10),
        business_name: event.business_name,
        client_business_name: clientName,
        artist_name: artistName,
        invoice_name: event.invoice_name || '',
        amount: event.amount.toString(),
        payment_date: event.payment_date ? String(event.payment_date).slice(0, 10) : '',
        due_date: event.due_date ? String(event.due_date).slice(0, 10) : '',
        // If the event already has a snapshot, keep it; otherwise take the artist default.
        artist_fee_type: (event.artist_fee_type || payout.type) as any,
        artist_fee_value:
          event.artist_fee_value === undefined || event.artist_fee_value === null
            ? String(payout.value || 0)
            : String(event.artist_fee_value),
        // Owner can override per-event payout amount (kept blank by default for new events).
        artist_fee_amount_override: isOwner ? (event.artist_fee_amount ? String(event.artist_fee_amount) : '') : '',
        doc_type: event.doc_type,
        doc_number: event.doc_number || '',
        status: event.status,
        notes: event.notes || '',
        send_calendar_invite: true,
        send_agreement: false,
      });
    } else {
      setEditingEvent(null);
      setFormData({
        event_date: '',
        business_name: '',
        client_business_name: '',
        artist_name: '',
        invoice_name: '',
        amount: '',
        payment_date: '',
        due_date: '',
        artist_fee_type: 'fixed',
        artist_fee_value: '',
        artist_fee_amount_override: '',
        doc_type: 'tax_invoice',
        doc_number: '',
        status: 'draft',
        notes: '',
        send_calendar_invite: true,
        send_agreement: false,
      });
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingEvent(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (!currentAgency) {
        throw new Error('לא נמצאה סוכנות פעילה. רענן את הדף ונסה שוב.');
      }

      const clientName = formData.client_business_name.trim();
      const artistName = formData.artist_name.trim();
      const effectiveBusinessName = clientName || formData.business_name.trim();

      type EnsureResult = { id?: string; existed: boolean };

      const ensureClient = async (): Promise<EnsureResult> => {
        if (!clientName) return { id: undefined, existed: false };
        if (isDemoMode()) {
          const existing = demoGetClients(currentAgency.id);
          const found = existing.find(c => c.name.toLowerCase() === clientName.toLowerCase());
          if (found) return { id: found.id, existed: true };
          const created = demoUpsertClient(currentAgency.id, { name: clientName });
          demoSetClients(currentAgency.id, [created, ...existing]);
          invalidateClients(currentAgency.id);
          return { id: created.id, existed: false };
        }
        const { data: found } = await supabase
          .from('clients')
          .select('id,name')
          .eq('agency_id', currentAgency.id)
          .ilike('name', clientName)
          .limit(1)
          .maybeSingle();
        if ((found as any)?.id) return { id: (found as any).id as string, existed: true };
        const { data: inserted, error } = await supabase
          .from('clients')
          .insert([{ agency_id: currentAgency.id, name: clientName }])
          .select('id')
          .single();
        if (error) throw error;
        return { id: (inserted as any).id as string, existed: false };
      };

      const ensureArtist = async (): Promise<EnsureResult> => {
        if (!artistName) return { id: undefined, existed: false };
        if (isDemoMode()) {
          const existing = demoGetArtists(currentAgency.id);
          const found = existing.find(a => a.name.toLowerCase() === artistName.toLowerCase());
          if (found) return { id: found.id, existed: true };
          const created = demoUpsertArtist(currentAgency.id, { name: artistName });
          demoSetArtists(currentAgency.id, [created, ...existing]);
          invalidateArtists(currentAgency.id);
          return { id: created.id, existed: false };
        }
        const { data: found } = await supabase
          .from('artists')
          .select('id,name')
          .eq('agency_id', currentAgency.id)
          .ilike('name', artistName)
          .limit(1)
          .maybeSingle();
        if ((found as any)?.id) return { id: (found as any).id as string, existed: true };
        const { data: inserted, error } = await supabase
          .from('artists')
          .insert([{ agency_id: currentAgency.id, name: artistName }])
          .select('id')
          .single();
        if (error) throw error;
        return { id: (inserted as any).id as string, existed: false };
      };

      const [clientRes, artistRes] = await Promise.all([ensureClient(), ensureArtist()]);
      const clientId = clientRes.id;
      const artistId = artistRes.id;
      const payout = resolveArtistPayout(artistId, artistName);

      // DEMO MODE: create/update in localStorage so it always works
      if (isDemoMode()) {
        const now = new Date().toISOString();
        const isoEventDate = formData.event_date ? new Date(formData.event_date).toISOString() : now;
        const isoPaymentDate = formData.payment_date ? new Date(formData.payment_date).toISOString() : undefined;
        const companyAmount = Number.isFinite(Number(formData.amount)) ? parseFloat(formData.amount) : 0;
        const feeType: 'fixed' | 'percent' = payout.type;
        const feeValue = Number.isFinite(Number(payout.value)) ? payout.value : 0;
        const override = Number.isFinite(Number(formData.artist_fee_amount_override)) ? parseFloat(formData.artist_fee_amount_override) : NaN;
        const computedFee = Number.isFinite(override) && override >= 0 ? override : computeArtistFee(companyAmount, feeType, feeValue);

        const base: Event = {
          id: editingEvent?.id || (globalThis.crypto?.randomUUID?.() ?? `demo-${Math.random().toString(36).slice(2)}`),
          agency_id: currentAgency.id || 'ima-productions-id',
          producer_id: user?.id || 'demo-user-id',
          event_date: isoEventDate,
          weekday: getWeekday(formData.event_date),
          business_name: effectiveBusinessName,
          invoice_name: formData.invoice_name,
          amount: companyAmount,
          payment_date: isoPaymentDate,
          due_date: formData.due_date ? new Date(formData.due_date).toISOString().slice(0, 10) : undefined,
          artist_fee_type: feeType,
          artist_fee_value: feeValue,
          artist_fee_amount: computedFee,
          doc_type: formData.doc_type,
          doc_number: formData.doc_number || undefined,
          status: editingEvent ? formData.status : 'pending',
          notes: formData.notes || undefined,
          morning_sync_status: editingEvent?.morning_sync_status || 'not_synced',
          created_at: editingEvent?.created_at || now,
          updated_at: now,
          client_id: clientId ?? editingEvent?.client_id,
          artist_id: artistId ?? editingEvent?.artist_id,
        };

        const existing = demoGetEvents(currentAgency.id);
        const next = editingEvent
          ? existing.map(e => (e.id === editingEvent.id ? base : e))
          : [base, ...existing];

        demoSetEvents(currentAgency.id, next);
        setEvents(next);
        success(editingEvent ? 'אירוע עודכן בהצלחה! ✅' : 'אירוע נוסף בהצלחה! 🎉');

        // Auto-send agreement ONLY if artist/client already existed in the system
        if (!editingEvent) {
          const docs = demoGetDocuments(currentAgency.id);
          const clientTemplate = docs.find(d => d.type === 'client_agreement');
          const artistTemplate = docs.find(d => d.type === 'artist_agreement');
          const client = clientId ? demoGetClients(currentAgency.id).find(c => c.id === clientId) : undefined;
          const artist = artistId ? demoGetArtists(currentAgency.id).find(a => a.id === artistId) : undefined;
          const vars = buildTemplateVariables({ event: base, client, artist });

          if (clientRes.existed && clientTemplate && client) {
            demoAddSentDoc(currentAgency.id, {
              kind: 'agreement',
              to: 'client',
              to_id: client.id,
              to_name: client.name,
              to_email: client.email,
              event_id: base.id,
              title: clientTemplate.title,
              rendered: renderTemplate(clientTemplate.content, vars),
            });
          }
          if (artistRes.existed && artistTemplate && artist) {
            demoAddSentDoc(currentAgency.id, {
              kind: 'agreement',
              to: 'artist',
              to_id: artist.id,
              to_name: artist.name,
              to_email: artist.email,
              event_id: base.id,
              title: artistTemplate.title,
              rendered: renderTemplate(artistTemplate.content, vars),
            });
          }
        }
        closeDialog();
        return;
      }

      const eventData = {
        // do not store UI-only fields
        event_date: formData.event_date,
        business_name: effectiveBusinessName,
        invoice_name: formData.invoice_name,
        payment_date: formData.payment_date || null,
        due_date: formData.due_date || null,
        artist_fee_type: isOwner ? payout.type : undefined,
        artist_fee_value: isOwner ? payout.value : undefined,
        artist_fee_amount: isOwner
          ? (() => {
              const companyAmount = Number.isFinite(Number(formData.amount)) ? parseFloat(formData.amount) : 0;
              const override = Number.isFinite(Number(formData.artist_fee_amount_override)) ? parseFloat(formData.artist_fee_amount_override) : NaN;
              if (Number.isFinite(override) && override >= 0) return override;
              return computeArtistFee(companyAmount, payout.type, payout.value);
            })()
          : undefined,
        doc_type: formData.doc_type,
        doc_number: formData.doc_number,
        status: editingEvent ? formData.status : 'pending',
        notes: formData.notes,
        amount: parseFloat(formData.amount),
        agency_id: currentAgency.id,
        weekday: getWeekday(formData.event_date),
        client_id: clientId,
        artist_id: artistId,
      };

      let savedEventId: string | undefined = editingEvent?.id;
      if (editingEvent) {
        const { error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', editingEvent.id);

        if (error) throw error;
        success('אירוע עודכן בהצלחה! ✅');
        // Sheets backup job (processed server-side)
        await queueSyncJob({
          agencyId: currentAgency.id,
          provider: 'sheets',
          kind: 'events_upsert',
          payload: { operation: 'update', event_id: editingEvent.id },
          createdBy: user?.id,
        });
        // Google Calendar sync job (company calendar + invite email flow)
        await queueSyncJob({
          agencyId: currentAgency.id,
          provider: 'google',
          kind: 'calendar_upsert',
          payload: { event_id: editingEvent.id, send_invites: formData.send_calendar_invite },
          createdBy: user?.id,
        });
      } else {
        const { data: inserted, error } = await supabase.from('events').insert([eventData]).select('id').single();

        if (error) throw error;
        savedEventId = (inserted as any)?.id;
        success('אירוע נוסף בהצלחה! 🎉');

        // Agreement engine: when artist & client emails present, send agreement + calendar invite
        let clientEmail = (clients.find(c => c.id === clientId) || {} as Client).email?.trim();
        let artistEmail = (artists.find(a => a.id === artistId) || {} as Artist).email?.trim();
        if (!clientEmail && clientId) {
          const { data: c } = await supabase.from('clients').select('email').eq('id', clientId).maybeSingle();
          clientEmail = (c as { email?: string })?.email?.trim();
        }
        if (!artistEmail && artistId) {
          const { data: a } = await supabase.from('artists').select('email').eq('id', artistId).maybeSingle();
          artistEmail = (a as { email?: string })?.email?.trim();
        }
        const shouldSendAgreement = !!(clientEmail && artistEmail);
        const sendInvites = shouldSendAgreement || formData.send_calendar_invite;

        await queueSyncJob({
          agencyId: currentAgency.id,
          provider: 'sheets',
          kind: 'events_upsert',
          payload: { operation: 'insert', event_id: savedEventId },
          createdBy: user?.id,
        });
        await queueSyncJob({
          agencyId: currentAgency.id,
          provider: 'google',
          kind: 'calendar_upsert',
          payload: { event_id: savedEventId, send_invites: sendInvites },
          createdBy: user?.id,
        });

        if ((shouldSendAgreement || formData.send_agreement) && savedEventId) {
          try {
            const { data: ownerRow } = await supabase
              .from('users')
              .select('email')
              .eq('agency_id', currentAgency.id)
              .eq('role', 'owner')
              .limit(1)
              .maybeSingle();
            const ownerEmail = (ownerRow as { email?: string })?.email?.trim() || undefined;
            await agreementService.generateAgreement({
              eventId: savedEventId,
              sendEmail: shouldSendAgreement || formData.send_agreement,
              ownerEmail,
            });
            success('הסכם הופעה נוצר ונשלח ✅');
          } catch (err: any) {
            console.error('Agreement send failed:', err);
            showError(err?.message || 'שליחת הסכם נכשלה');
          }
        }
      }
      if (formData.send_agreement && savedEventId && editingEvent) {
        try {
          const { data: ownerRow } = await supabase
            .from('users')
            .select('email')
            .eq('agency_id', currentAgency.id)
            .eq('role', 'owner')
            .limit(1)
            .maybeSingle();
          const ownerEmail = (ownerRow as { email?: string })?.email?.trim() || undefined;
          await agreementService.generateAgreement({
            eventId: savedEventId,
            sendEmail: true,
            ownerEmail,
          });
          success('הסכם נוצר ונשלח ללקוח במייל ✅');
        } catch (err: any) {
          console.error('Agreement send failed:', err);
          showError(err?.message || 'שליחת הסכם נכשלה');
        }
      }

      fetchEvents();
      closeDialog();
    } catch (err: any) {
      showError(err.message || 'אירעה שגיאה בשמירת האירוע. אנא נסה שוב.');
    }
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
      cell: ({ row }) => row.getValue('weekday') || getWeekday(row.original.event_date),
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
                  setEvents(prev => {
                    const next = prev.map(e => (e.id === eventId ? { ...e, morning_sync_status: 'syncing' as const } : e));
                    demoSetEvents(currentAgency.id, next);
                    return next;
                  });
                  await new Promise(resolve => setTimeout(resolve, 1200));
                  setEvents(prev => {
                    const next = prev.map(e => (e.id === eventId ? { ...e, morning_sync_status: 'synced' as const } : e));
                    demoSetEvents(currentAgency.id, next);
                    return next;
                  });
                  success('דמו: הסנכרון עם Morning הושלם ✅');
                  return;
                }

                // Production: call Netlify Function (Morning API proxy; credentials server-side)
                setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, morning_sync_status: 'syncing' as const } : e)));
                const result = await createEventDocument(currentAgency.id, eventId);
                if (result.ok) {
                  success('המסמך נוצר ב־Morning בהצלחה ✅');
                  fetchEvents();
                } else {
                  showError(result.error + (result.detail ? ` — ${result.detail}` : ''));
                  setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, morning_sync_status: 'not_synced' as const } : e)));
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
                        fetchEvents();
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
                {morningErr || '—'}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!currentAgency) return;
                  const eventId = row.original.id;
                  setEvents(prev => prev.map(e => (e.id === eventId ? { ...e, morning_sync_status: 'syncing' as const } : e)));
                  await queueSyncJob({
                    agencyId: currentAgency.id,
                    provider: 'morning',
                    kind: 'event_document_create',
                    payload: { event_id: eventId },
                    createdBy: user?.id,
                  });
                  success('נוצר Retry ל‑Morning ✅');
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

  const table = useReactTable({
    data: events,
    columns,
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

  const handleExport = () => {
    const filteredEvents = table.getFilteredRowModel().rows.map(row => row.original);
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
    try {
      if (isDemoMode()) {
        const next = demoGetEvents(currentAgency.id).filter((e) => !selectedIds.includes(e.id));
        demoSetEvents(currentAgency.id, next);
        setEvents(next);
        setRowSelection({});
        success('נמחקו אירועים נבחרים ✅');
        return;
      }
      const { error } = await supabase.from('events').delete().in('id', selectedIds);
      if (error) throw error;
      setRowSelection({});
      success('נמחקו אירועים נבחרים ✅');
      fetchEvents();
    } catch (e: any) {
      console.error(e);
      showError(e?.message || 'מחיקת האירועים נכשלה. אנא נסה שוב.');
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
        <CardHeader className="p-5 md:p-6">
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
                      disabled={!isOwner}
                      title={!isOwner ? 'אין הרשאה למחיקה' : undefined}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      מחק נבחרים
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

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl glass border-primary/20">
          <DialogHeader>
            <DialogTitle className="text-2xl text-foreground">
              {editingEvent ? 'עריכת אירוע' : 'אירוע חדש'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              מלא את פרטי האירוע
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2 col-span-2">
                <Label htmlFor="event_date" className="text-foreground">תאריך אירוע *</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                  required
                  className="border-primary/30"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="client_business_name" className="text-foreground">לקוח (שם עסק) *</Label>
                <Input
                  id="client_business_name"
                  value={formData.client_business_name}
                  onChange={(e) => setFormData({ ...formData, client_business_name: e.target.value })}
                  required
                  className="border-primary/30"
                  placeholder="לדוגמה: הבאר הקוקטייל"
                  list="clients-list"
                />
                <datalist id="clients-list">
                  {clients.slice(0, 50).map(c => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="artist_name" className="text-foreground">אמן *</Label>
                <Input
                  id="artist_name"
                  value={formData.artist_name}
                  onChange={(e) => setFormData({ ...formData, artist_name: e.target.value })}
                  required
                  className="border-primary/30"
                  placeholder="לדוגמה: Static & Ben El"
                  list="artists-list"
                />
                <datalist id="artists-list">
                  {artists.slice(0, 50).map(a => (
                    <option key={a.id} value={a.name} />
                  ))}
                </datalist>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="invoice_name" className="text-foreground">שם בחשבונית</Label>
                <Input
                  id="invoice_name"
                  value={formData.invoice_name}
                  onChange={(e) => setFormData({ ...formData, invoice_name: e.target.value })}
                  className="border-primary/30"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="amount" className="text-foreground">סכום לחברה (הכנסה) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  className="border-primary/30"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="payment_date" className="text-foreground">תאריך תשלום</Label>
                <Input
                  id="payment_date"
                  type="date"
                  value={formData.payment_date}
                  onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                  className="border-primary/30"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="due_date" className="text-foreground">תאריך יעד לשליחת חשבונית</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="border-primary/30"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-foreground">מודל תשלום לאמן (מוגדר בפרופיל)</Label>
                <div className="rounded-md border border-border bg-card px-3 py-2 text-sm flex flex-col gap-1">
                  {(() => {
                    const p = resolveArtistPayout(undefined, formData.artist_name);
                    return `${p.type === 'percent' ? `${p.value}% מהכנסה` : `${p.value.toLocaleString('he-IL')} סכום קבוע`}`;
                  })()}
                  <span className="text-xs text-muted-foreground">ניתן לעקוף סכום ספציפי לאירוע.</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="artist_fee_override" className="text-foreground">סכום לאמן (אופציונלי)</Label>
                <Input
                  id="artist_fee_override"
                  type="number"
                  step="0.01"
                  value={formData.artist_fee_amount_override}
                  onChange={(e) => setFormData({ ...formData, artist_fee_amount_override: e.target.value })}
                  className="border-primary/30"
                  disabled={!isOwner}
                  placeholder="סכום לאמן (אופציונלי)"
                  title={!isOwner ? 'אין הרשאה לערוך' : undefined}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="doc_type" className="text-foreground">סוג מסמך</Label>
                <Select value={formData.doc_type} onValueChange={(val: DocumentType) => setFormData({ ...formData, doc_type: val })}>
                  <SelectTrigger className="border-primary/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tax_invoice">חשבונית מס</SelectItem>
                    <SelectItem value="receipt">קבלה</SelectItem>
                    <SelectItem value="payment_request">חשבון עסקה</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="doc_number" className="text-foreground">מספר מסמך</Label>
                <Input
                  id="doc_number"
                  value={formData.doc_number}
                  onChange={(e) => setFormData({ ...formData, doc_number: e.target.value })}
                  className="border-primary/30"
                />
              </div>

              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="send_calendar_invite"
                  checked={formData.send_calendar_invite}
                  onChange={(e) => setFormData({ ...formData, send_calendar_invite: e.target.checked })}
                  className="rounded border-input accent-primary"
                />
                <Label htmlFor="send_calendar_invite" className="text-foreground cursor-pointer">
                  שליחת הזמנה ליומן לאמן וללקוח (אם יש כתובת אימייל)
                </Label>
              </div>

              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="send_agreement"
                  checked={formData.send_agreement}
                  onChange={(e) => setFormData({ ...formData, send_agreement: e.target.checked })}
                  className="rounded border-input accent-primary"
                />
                <Label htmlFor="send_agreement" className="text-foreground cursor-pointer">
                  שלח הסכם ללקוח (PDF במייל)
                </Label>
              </div>

              <div className="flex flex-col gap-2 col-span-2">
                <Label htmlFor="notes" className="text-foreground">הערות</Label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-primary/30 rounded-md text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>
                ביטול
              </Button>
              <Button type="submit" className="btn-magenta">
                {editingEvent ? 'עדכן' : 'הוסף'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventsPage;
