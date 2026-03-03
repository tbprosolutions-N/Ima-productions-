/**
 * New Event Form — NPC Collective Production Version
 * Full-featured event creation with Supabase, Morning API mapping, and Resend integration.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { supabase, invokeCalendarInvite } from '@/lib/supabase';
import { getWeekday } from '@/lib/utils';
import { agreementService } from '@/services/agreementService';
import type { Artist, Client, DocumentType, EventStatus } from '@/types';

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
  customer_name: '',
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

/** Common time presets for datalist (manual edit + pick) */
const TIME_PRESETS = Array.from({ length: 15 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`);

export function NewEventForm({
  open,
  onClose,
  onSuccess,
  agencyId,
  userId,
  artists,
  clients,
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
      setForm({
        customer_name: ev.business_name || '',
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
    // Prevent all-day: require start and end time
    if (!form.start_time?.trim()) err.start_time = 'נדרשת שעת התחלה';
    if (!form.end_time?.trim()) err.end_time = 'נדרשת שעת סיום';
    if (form.start_time && form.end_time && form.start_time >= form.end_time) {
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

    try {
      let clientId: string | undefined;
      const customerName = form.customer_name.trim();
      if (customerName) {
        const { data: found } = await supabase
          .from('clients')
          .select('id')
          .eq('agency_id', agencyId)
          .ilike('name', customerName)
          .limit(1)
          .maybeSingle();
        if ((found as { id?: string } | null)?.id) {
          clientId = (found as { id: string }).id;
        } else {
          const { data: inserted } = await supabase
            .from('clients')
            .insert({ agency_id: agencyId, name: customerName })
            .select('id')
            .single();
          if ((inserted as { id?: string } | null)?.id) clientId = (inserted as { id: string }).id;
        }
      }

      let artistId: string | undefined;
      const artistName = form.artist_name.trim();
      if (artistName) {
        const existing = artists.find((a) => a.name.trim().toLowerCase() === artistName.toLowerCase());
        if (existing) {
          artistId = existing.id;
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

      const effectiveBusinessName = customerName || 'אירוע';
      const effectiveInvoiceName = form.invoice_name?.trim() || effectiveBusinessName;
      const amountNum = Number(form.amount) || 0;

      const eventDate = form.event_date;
      const eventTime = form.start_time?.trim() || null;
      const eventTimeEnd = form.end_time?.trim() || null;

      const eventData = {
        agency_id: agencyId,
        producer_id: userId || agencyId,
        event_date: eventDate,
        weekday: getWeekday(eventDate),
        business_name: effectiveBusinessName,
        invoice_name: effectiveInvoiceName,
        location: form.location?.trim() || null,
        event_time: eventTime,
        event_time_end: eventTimeEnd,
        amount: Number.isFinite(amountNum) ? amountNum : 0,
        payment_date: form.payment_date || null,
        due_date: form.invoice_send_date || null,
        doc_type: form.doc_type,
        doc_number: form.doc_number || null,
        status: editingEvent ? form.status : 'pending',
        client_id: clientId || null,
        artist_id: artistId || null,
        notes: form.notes?.trim() || null,
      };

      if (editingEvent) {
        const { error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', editingEvent.id);
        if (error) throw error;
        onSuccessToast?.('אירוע עודכן בהצלחה! ✅');
      } else {
        const { data: inserted, error } = await supabase
          .from('events')
          .insert([eventData])
          .select('id')
          .single();
        if (error) throw error;
        const savedId = (inserted as { id?: string } | null)?.id;

        if (savedId && form.send_invitation) {
          try {
            const data = await invokeCalendarInvite(savedId, true);
            if (data?.ok) onSuccessToast?.('הזמנה ליומן נשלחה בהצלחה 📅');
          } catch (err: unknown) {
            console.error('[calendar-invite]', err);
            onError?.((err as Error)?.message || 'שגיאה בשליחת הזמנה');
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
            value={form.start_time}
            onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
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
            value={form.end_time}
            onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
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

      {/* Financials */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">סכום לתשלום</Label>
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
            <SelectTrigger className="border-primary/30">
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

      {/* Checkboxes — iOS: min 44px touch target */}
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 cursor-pointer min-h-[44px] py-2 -my-1">
          <input
            type="checkbox"
            checked={form.send_invitation}
            onChange={(e) => setForm((f) => ({ ...f, send_invitation: e.target.checked }))}
            className="rounded border-input accent-primary w-5 h-5 shrink-0 mt-0.5"
          />
          <span className="text-sm text-foreground">
            שלח הזמנה — לשלוח אימייל לאמן וללקוח ולהוסיף להיומן שלי ב-Google Calendar
          </span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer min-h-[44px] py-2 -my-1">
          <input
            type="checkbox"
            checked={form.send_agreement}
            onChange={(e) => setForm((f) => ({ ...f, send_agreement: e.target.checked }))}
            className="rounded border-input accent-primary w-5 h-5 shrink-0 mt-0.5"
          />
          <span className="text-sm text-foreground">
            שלח הסכם — לשלוח את תבנית ההסכם ללקוח במייל (מלא בפרטי האירוע)
          </span>
        </label>
      </div>

      {errors.submit && (
        <p className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">{errors.submit}</p>
      )}

      {/* Buttons — iOS: min 44px touch target */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={saving} className="min-h-[44px]">
          ביטול
        </Button>
        <Button type="submit" className="btn-magenta min-h-[44px]" disabled={saving}>
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
