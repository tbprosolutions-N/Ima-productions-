/**
 * New Event Form — NPC Collective Production Version
 *
 * Time Logic: ISO 8601 — date + start/end time combined for full timestamps (no all-day).
 * Checkboxes: Send Invitation → /api/calendar-invite (via invokeCalendarInvite)
 *             Send Agreement → agreementService.generateAgreement (send-email Edge Function)
 * Morning: All invoice fields saved to events; /api/morning createDocument reads from DB.
 *   Mapping: business_name, invoice_name, amount, payment_date, due_date, doc_type, doc_number
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { supabase, invokeCalendarInvite } from '@/lib/supabase';
import { getWeekday, toISO8601, safeDate } from '@/lib/utils';
import { agreementService } from '@/services/agreementService';
import {
  demoGetEvents,
  demoSetEvents,
  demoGetClients,
  demoSetClients,
  demoGetArtists,
  demoSetArtists,
  demoUpsertEvent,
  demoUpsertClient,
  demoUpsertArtist,
} from '@/lib/demoStore';
import type { Artist, Client, DocumentType, Event as EventType, EventStatus } from '@/types';

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'tax_invoice', label: 'חשבונית מס' },
  { value: 'receipt', label: 'קבלה' },
  { value: 'payment_request', label: 'חשבון עסקה' },
];

const STATUS_COLORS: Record<EventStatus, string> = {
  draft: 'bg-gray-500/20 text-gray-300',
  pending: 'bg-amber-500/20 text-amber-300',
  approved: 'bg-blue-500/20 text-blue-300',
  paid: 'bg-green-500/20 text-green-300',
  cancelled: 'bg-red-500/20 text-red-300',
};

export interface NewEventFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  agencyId: string;
  userId: string | undefined;
  artists: Artist[];
  clients: Client[];
  /** When true, persist to demoStore instead of Supabase; skip calendar-invite/agreement API calls. */
  isDemoMode?: boolean;
  editingEvent?: {
    id: string;
    business_name: string;
    invoice_name: string;
    event_date: string;
    event_time?: string | null;
    event_time_end?: string | null;
    location?: string | null;
    amount: number;
    payment_date?: string | null;
    due_date?: string | null;
    doc_type: DocumentType;
    doc_number?: string | null;
    status: EventStatus;
    notes?: string | null;
    client_id?: string | null;
    artist_id?: string | null;
  } | null;
  onError?: (message: string) => void;
  onSuccessToast?: (message: string) => void;
  onArtistsInvalidate?: () => void;
}

const emptyForm = () => ({
  event_name: '',
  customer_name: '',
  client_email: '',
  invoice_name: '',
  event_date: new Date().toISOString().slice(0, 10),
  start_time: '09:00',
  end_time: '17:00',
  location: '',
  amount: '',
  payment_date: '',
  invoice_send_date: '',
  doc_type: 'tax_invoice' as DocumentType,
  doc_number: '',
  status: 'pending' as EventStatus,
  artist_name: '',
  notes: '',
  send_invitation: true,
  send_agreement: false,
});

/** Time presets: 08:00–22:30 every 30 min (scrollable + manual typing) */
const TIME_PRESETS = (() => {
  const out: string[] = [];
  for (let h = 8; h <= 22; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 22) out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

function toTimeValue(v: string): string {
  if (!v || typeof v !== 'string') return '09:00';
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10) || 9));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10) || 0));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return v.slice(0, 5) || '09:00';
}

export function NewEventForm({
  open,
  onClose,
  onSuccess,
  agencyId,
  userId,
  artists,
  clients,
  isDemoMode = false,
  editingEvent,
  onError,
  onSuccessToast,
  onArtistsInvalidate,
}: NewEventFormProps) {
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const invoiceNameInitialized = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (editingEvent) {
      const ev = editingEvent;
      const artistName = ev.artist_id ? artists.find((a) => a.id === ev.artist_id)?.name || '' : '';
      const existingClientEmail = ev.client_id ? clients.find((c) => c.id === ev.client_id)?.email || '' : '';
      setForm({
        event_name: (ev as any).event_name || '',
        customer_name: ev.business_name || '',
        client_email: existingClientEmail,
        invoice_name: ev.invoice_name || '',
        event_date: String(ev.event_date || '').slice(0, 10),
        start_time: (ev.event_time as string) || '09:00',
        end_time: (ev.event_time_end as string) || '17:00',
        location: ev.location || '',
        amount: ev.amount != null ? String(ev.amount) : '',
        payment_date: ev.payment_date ? String(ev.payment_date).slice(0, 10) : '',
        invoice_send_date: ev.due_date ? String(ev.due_date).slice(0, 10) : '',
        doc_type: ev.doc_type || 'tax_invoice',
        doc_number: ev.doc_number || '',
        status: (ev.status as EventStatus) || 'pending',
        artist_name: artistName,
        notes: ev.notes || '',
        send_invitation: true,
        send_agreement: false,
      });
    } else {
      setForm(emptyForm());
    }
    setErrors({});
    invoiceNameInitialized.current = false;
  }, [open, editingEvent, artists]);

  // Auto-fill invoice_name from client when customer selected
  useEffect(() => {
    if (!open || invoiceNameInitialized.current) return;
    const name = form.customer_name.trim();
    if (!name) return;
    const client = clients.find((c) => c.name === name);
    if (client) {
      setForm((f) => ({
        ...f,
        invoice_name: (client.invoice_name as string) || client.name,
      }));
      invoiceNameInitialized.current = true;
    }
  }, [open, form.customer_name, clients]);

  const validate = (): boolean => {
    const err: Record<string, string> = {};
    if (!form.event_date?.trim()) err.event_date = 'נדרש תאריך';
    if (!form.artist_name?.trim()) err.artist_name = 'נדרש שם אמן';
    if (!form.customer_name?.trim()) err.customer_name = 'נדרש שם לקוח';
    // ISO 8601: require start/end time (prevents all-day)
    if (!form.start_time?.trim()) err.start_time = 'נדרשת שעת התחלה';
    if (!form.end_time?.trim()) err.end_time = 'נדרשת שעת סיום';
    const startIso = toISO8601(form.event_date, form.start_time);
    const endIso = toISO8601(form.event_date, form.end_time);
    if (startIso && endIso && startIso >= endIso) {
      err.end_time = 'שעת סיום חייבת להיות אחרי שעת התחלה';
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!validate()) return;
    submittingRef.current = true;
    setSaving(true);
    setErrors({});

    const effectiveBusinessName = form.customer_name.trim() || 'אירוע';
    const effectiveInvoiceName = form.invoice_name?.trim() || effectiveBusinessName;
    const amountNum = Number(form.amount) || 0;
    const eventDate = form.event_date;
    const eventTime = form.start_time?.trim() ?? undefined;
    const eventTimeEnd = form.end_time?.trim() ?? undefined;

    const baseEventData = {
      producer_id: userId || agencyId,
      event_name: form.event_name?.trim() || undefined,
      event_date: eventDate,
      weekday: getWeekday(eventDate),
      business_name: effectiveBusinessName,
      invoice_name: effectiveInvoiceName,
      location: form.location?.trim() ?? undefined,
      event_time: eventTime ?? undefined,
      event_time_end: eventTimeEnd ?? undefined,
      amount: Number.isFinite(amountNum) ? amountNum : 0,
      payment_date: safeDate(form.payment_date),
      due_date: safeDate(form.invoice_send_date),
      doc_type: form.doc_type,
      doc_number: form.doc_number?.trim() || undefined,
      status: (editingEvent ? form.status : 'pending') as EventStatus,
      notes: form.notes?.trim() ?? undefined,
    };

    try {
      let clientId: string | undefined;
      const customerName = form.customer_name.trim();
      if (customerName) {
        if (isDemoMode) {
          const existing = demoGetClients(agencyId).find((c) => c.name === customerName);
          if (existing) clientId = existing.id;
          else {
            const created = demoUpsertClient(agencyId, { name: customerName });
            clientId = created.id;
            demoSetClients(agencyId, [created, ...demoGetClients(agencyId)]);
          }
        } else {
          const clientEmailInput = form.client_email.trim();
          const { data: found } = await supabase
            .from('clients')
            .select('id,email')
            .eq('agency_id', agencyId)
            .ilike('name', customerName)
            .limit(1)
            .maybeSingle();
          if ((found as { id?: string } | null)?.id) {
            clientId = (found as { id: string }).id;
            // Update email on existing client if a new one is provided
            if (clientEmailInput && !(found as { email?: string }).email) {
              await supabase.from('clients').update({ email: clientEmailInput }).eq('id', clientId);
            }
          } else {
            const { data: inserted } = await supabase
              .from('clients')
              .insert({ agency_id: agencyId, name: customerName, ...(clientEmailInput && { email: clientEmailInput }) })
              .select('id')
              .single();
            if ((inserted as { id?: string } | null)?.id) clientId = (inserted as { id: string }).id;
          }
        }
      }

      let artistId: string | undefined;
      const artistName = form.artist_name.trim();
      if (artistName) {
        const existing = artists.find((a) => a.name.trim().toLowerCase() === artistName.toLowerCase());
        if (existing) {
          artistId = existing.id;
        } else if (isDemoMode) {
          const created = demoUpsertArtist(agencyId, { name: artistName });
          artistId = created.id;
          demoSetArtists(agencyId, [created, ...demoGetArtists(agencyId)]);
          onArtistsInvalidate?.();
        } else {
          const { data: inserted } = await supabase
            .from('artists')
            .insert({ agency_id: agencyId, name: artistName })
            .select('id')
            .single();
          if ((inserted as { id?: string } | null)?.id) {
            artistId = (inserted as { id: string }).id;
            onArtistsInvalidate?.();
          }
        }
      }

      const eventData = {
        ...baseEventData,
        client_id: clientId ?? undefined,
        artist_id: artistId ?? undefined,
      };

      /** Brute-force mapper: every nullable field → ?? undefined. Explicitly typed as Event. */
      const toSanitizedEvent = (raw: EventType): EventType => {
        const sanitizedEvent: EventType = {
          id: raw.id,
          agency_id: raw.agency_id,
          producer_id: raw.producer_id,
          event_date: raw.event_date,
          weekday: raw.weekday,
          business_name: raw.business_name ?? '',
          invoice_name: raw.invoice_name ?? '',
          amount: raw.amount,
          doc_type: raw.doc_type,
          status: raw.status,
          created_at: raw.created_at,
          updated_at: raw.updated_at,
          event_name: raw.event_name ?? undefined,
          location: raw.location ?? undefined,
          payment_date: raw.payment_date ?? undefined,
          due_date: raw.due_date ?? undefined,
          notes: raw.notes ?? undefined,
          doc_number: raw.doc_number ?? undefined,
          client_id: raw.client_id ?? undefined,
          artist_id: raw.artist_id ?? undefined,
          event_time: raw.event_time ?? undefined,
          event_time_end: raw.event_time_end ?? undefined,
          artist_fee_type: raw.artist_fee_type ?? undefined,
          artist_fee_value: raw.artist_fee_value ?? undefined,
          artist_fee_amount: raw.artist_fee_amount ?? undefined,
          approver: raw.approver ?? undefined,
          morning_sync_status: raw.morning_sync_status ?? undefined,
          morning_id: raw.morning_id ?? undefined,
          morning_document_id: raw.morning_document_id ?? undefined,
          morning_document_number: raw.morning_document_number ?? undefined,
          morning_document_url: raw.morning_document_url ?? undefined,
          morning_last_error: raw.morning_last_error ?? undefined,
          morning_doc_status: raw.morning_doc_status ?? undefined,
          google_event_id: raw.google_event_id ?? undefined,
          google_event_html_link: raw.google_event_html_link ?? undefined,
          google_artist_event_id: raw.google_artist_event_id ?? undefined,
          google_artist_event_html_link: raw.google_artist_event_html_link ?? undefined,
          google_sync_status: raw.google_sync_status ?? undefined,
          google_synced_at: raw.google_synced_at ?? undefined,
        };
        return sanitizedEvent;
      };

      if (editingEvent) {
        if (isDemoMode) {
          const next = demoGetEvents(agencyId).map((e) => {
            const raw = e.id === editingEvent.id ? { ...e, ...eventData } : e;
            return toSanitizedEvent(raw);
          });
          demoSetEvents(agencyId, next);
          onSuccessToast?.('אירוע עודכן בהצלחה! ✅');
        } else {
          const { error } = await supabase
            .from('events')
            .update(eventData)
            .eq('id', editingEvent.id);
          if (error) throw error;
          onSuccessToast?.('אירוע עודכן בהצלחה! ✅');
        }
      } else {
        let savedId: string | undefined;
        if (isDemoMode) {
          const newEvent = demoUpsertEvent(agencyId, eventData as any);
          savedId = newEvent.id;
          const sanitizedEvent = toSanitizedEvent(newEvent);
          const existing = demoGetEvents(agencyId).map(toSanitizedEvent);
          demoSetEvents(agencyId, [sanitizedEvent, ...existing]);
          onSuccessToast?.('אירוע נוסף בהצלחה! 🎉');
        } else {
          const { data: inserted, error } = await supabase
            .from('events')
            .insert([{ ...eventData, agency_id: agencyId }])
            .select('id')
            .single();
          if (error) throw error;
          savedId = (inserted as { id?: string } | null)?.id;

          if (savedId && form.send_invitation) {
            try {
              const data = await invokeCalendarInvite(savedId, true);
              if (data?.ok) onSuccessToast?.('הזמנה ליומן נשלחה בהצלחה 📅');
              else onError?.(data?.error || 'שגיאה בשליחת הזמנה');
            } catch (err: unknown) {
              console.error('[calendar-invite]', err);
              onError?.('האירוע נוצר, אך שליחת ההזמנה נכשלה. בדוק חיבור ל-Google Calendar.');
            }
          }

          if (savedId && form.send_agreement) {
            try {
              await agreementService.generateAgreement({
                eventId: savedId,
                sendEmail: true,
              });
              onSuccessToast?.('הסכם נשלח ללקוח במייל');
            } catch (err: unknown) {
              console.error('[agreement]', err);
              onError?.((err as Error)?.message || 'שגיאה בשליחת הסכם');
            }
          }

          onSuccessToast?.('אירוע נוסף בהצלחה! 🎉');
        }
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'שגיאה בשמירת אירוע';
      setErrors({ submit: msg });
      onError?.(msg);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(emptyForm());
    setErrors({});
    onClose();
  };

  if (!open) return null;

  const statusColor = STATUS_COLORS[form.status] || 'bg-gray-500/20 text-gray-300';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 modu-form-input touch-manipulation">
      {/* Event Name */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="event_name">שם האירוע</Label>
        <Input
          id="event_name"
          value={form.event_name}
          onChange={(e) => setForm((f) => ({ ...f, event_name: e.target.value }))}
          placeholder="לדוגמה: חתונה · בת מצווה · אירוע חברה"
          className="border-primary/30"
        />
      </div>

      {/* Event Identification */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="customer_name">שם לקוח *</Label>
          <Input
            id="customer_name"
            value={form.customer_name}
            onChange={(e) => {
              setForm((f) => ({ ...f, customer_name: e.target.value }));
              invoiceNameInitialized.current = false;
            }}
            placeholder="לדוגמה: הבאר הקוקטייל"
            list="customer-list"
            className={errors.customer_name ? 'border-red-500' : 'border-primary/30'}
          />
          <datalist id="customer-list">
            {clients.slice(0, 50).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          {errors.customer_name && <p className="text-xs text-red-500">{errors.customer_name}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="client_email">מייל לקוח (לזימון)</Label>
          <Input
            id="client_email"
            type="email"
            value={form.client_email}
            onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
            placeholder="client@example.com"
            className="border-primary/30"
            dir="ltr"
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="invoice_name">שם בחשבונית</Label>
          <Input
            id="invoice_name"
            value={form.invoice_name}
            onChange={(e) => setForm((f) => ({ ...f, invoice_name: e.target.value }))}
            placeholder="שם שיופיע בחשבונית (נמלא אוטומטית מלקוח)"
            className="border-primary/30"
          />
        </div>
      </div>

      {/* Scheduling — CRITICAL: prevent all-day */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="event_date">תאריך *</Label>
          <Input
            id="event_date"
            type="date"
            value={form.event_date}
            onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
            className={errors.event_date ? 'border-red-500' : 'border-primary/30'}
          />
          {errors.event_date && <p className="text-xs text-red-500">{errors.event_date}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="start_time">שעת התחלה *</Label>
          <Input
            id="start_time"
            type="time"
            list="time-presets"
            value={toTimeValue(form.start_time)}
            onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value || '09:00' }))}
            className={errors.start_time ? 'border-red-500' : 'border-primary/30'}
          />
          <datalist id="time-presets">
            {TIME_PRESETS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {errors.start_time && <p className="text-xs text-red-500">{errors.start_time}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="end_time">שעת סיום *</Label>
          <Input
            id="end_time"
            type="time"
            list="time-presets-end"
            value={toTimeValue(form.end_time)}
            onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value || '17:00' }))}
            className={errors.end_time ? 'border-red-500' : 'border-primary/30'}
          />
          <datalist id="time-presets-end">
            {TIME_PRESETS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {errors.end_time && <p className="text-xs text-red-500">{errors.end_time}</p>}
        </div>
      </div>

      {/* Location */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">מיקום</Label>
        <Input
          id="location"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="מקום האירוע (מסונכרן עם Google Calendar)"
          className="border-primary/30"
        />
      </div>

      {/* Financials — Morning mapping: amount, payment_date, due_date, doc_type, doc_number, business_name, invoice_name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">סכום לתשלום (₪)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              className="border-primary/30"
            />
            <span className="text-muted-foreground shrink-0">₪</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="payment_date">תאריך תשלום</Label>
          <Input
            id="payment_date"
            type="date"
            value={form.payment_date}
            onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
            className="border-primary/30"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invoice_send_date">תאריך יעד לשליחת חשבונית</Label>
          <Input
            id="invoice_send_date"
            type="date"
            value={form.invoice_send_date}
            onChange={(e) => setForm((f) => ({ ...f, invoice_send_date: e.target.value }))}
            className="border-primary/30"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="doc_type">סוג מסמך</Label>
          <Select
            value={form.doc_type}
            onValueChange={(v: DocumentType) => setForm((f) => ({ ...f, doc_type: v }))}
          >
            <SelectTrigger id="doc_type" className="border-primary/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="doc_number">מספר מסמך</Label>
          <Input
            id="doc_number"
            value={form.doc_number}
            onChange={(e) => setForm((f) => ({ ...f, doc_number: e.target.value }))}
            placeholder="אופציונלי"
            className="border-primary/30"
          />
        </div>
        {editingEvent && (
          <div className="flex flex-col gap-2">
            <Label>סטטוס תשלום</Label>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}
            >
              {form.status === 'draft' && 'טיוטה'}
              {form.status === 'pending' && 'ממתין'}
              {form.status === 'approved' && 'אושר'}
              {form.status === 'paid' && 'שולם'}
              {form.status === 'cancelled' && 'בוטל'}
            </span>
          </div>
        )}
      </div>

      {/* Artist — בחירה מהרשימה או הקלדת שם חדש */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="artist_name">אמן *</Label>
        <Input
          id="artist_name"
          value={form.artist_name}
          onChange={(e) => setForm((f) => ({ ...f, artist_name: e.target.value }))}
          placeholder="בחר מהרשימה או הקלד שם חדש"
          list="artist-list"
          className={errors.artist_name ? 'border-red-500' : 'border-primary/30'}
        />
        <datalist id="artist-list">
          {artists.map((a) => (
            <option key={a.id} value={a.name} />
          ))}
        </datalist>
        {errors.artist_name && <p className="text-xs text-red-500">{errors.artist_name}</p>}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">הערות הפקה</Label>
        <textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2 bg-background border border-primary/30 rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="הערות נוספות לאירוע"
        />
      </div>

      {/* Checkboxes — Send Invitation → calendar-invite; Send Agreement → agreementService (send-email) */}
      <div className="flex flex-col gap-3">
        <label htmlFor="send_invitation" className="flex items-center gap-3 cursor-pointer min-h-[44px] py-2 -my-1">
          <input
            id="send_invitation"
            type="checkbox"
            checked={form.send_invitation}
            onChange={(e) => setForm((f) => ({ ...f, send_invitation: e.target.checked }))}
            className="rounded border-input accent-primary w-5 h-5 shrink-0 mt-0.5"
          />
          <span className="text-sm text-foreground">
            שלח הזמנה — אימייל לאמן וללקוח + הוספה ל-Google Calendar
          </span>
        </label>
        <label htmlFor="send_agreement" className="flex items-center gap-3 cursor-pointer min-h-[44px] py-2 -my-1">
          <input
            id="send_agreement"
            type="checkbox"
            checked={form.send_agreement}
            onChange={(e) => setForm((f) => ({ ...f, send_agreement: e.target.checked }))}
            className="rounded border-input accent-primary w-5 h-5 shrink-0 mt-0.5"
          />
          <span className="text-sm text-foreground">
            שלח הסכם — PDF ללקוח במייל (Resend)
          </span>
        </label>
      </div>

      {errors.submit && (
        <p className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">{errors.submit}</p>
      )}

      {/* Actions — Add / Cancel */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-6 border-t border-border/50">
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          disabled={saving}
          className="min-h-[44px] px-6"
        >
          ביטול
        </Button>
        <Button type="submit" className="btn-magenta min-h-[44px] px-8" disabled={saving}>
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              שומר...
            </span>
          ) : editingEvent ? (
            'עדכן'
          ) : (
            'הוסף אירוע'
          )}
        </Button>
      </div>
    </form>
  );
}
