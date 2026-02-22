/**
 * Shared React Query hooks for Supabase data fetching.
 * Provides cached, background-revalidating queries for Events, Artists, Clients.
 * Page transitions become instant because data is served from cache first.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demoStore';
import { demoGetEvents, demoGetClients, demoGetArtists } from '@/lib/demoStore';
import type { Event, Artist, Client } from '@/types';

const STALE_TIME = 2 * 60 * 1000; // 2 minutes before background refetch
const CACHE_TIME = 10 * 60 * 1000; // 10 minutes in cache
const PREFETCH_STALE_MIN = 30 * 1000; // Stale-while-revalidate: at least 30s (no duplicate fetch within 30s)

// ── Column selectors ────────────────────────────────────────────────────────
// Explicit columns instead of SELECT * — avoids fetching large/unused fields
// and makes query payloads smaller as data scales.

const EVENT_LIST_COLS = [
  'id', 'agency_id', 'producer_id', 'event_date', 'event_time', 'weekday',
  'business_name', 'invoice_name', 'amount', 'payment_date',
  'artist_fee_type', 'artist_fee_value', 'artist_fee_amount', 'approver',
  'doc_type', 'doc_number', 'due_date', 'status', 'notes',
  'morning_sync_status', 'morning_id', 'morning_document_id',
  'morning_document_number', 'morning_document_url', 'morning_last_error', 'morning_doc_status',
  'client_id', 'artist_id',
  'google_event_id', 'google_event_html_link',
  'google_artist_event_id', 'google_artist_event_html_link',
  'google_sync_status', 'google_synced_at',
  'created_at', 'updated_at',
].join(',');

const ARTIST_LIST_COLS = [
  'id', 'agency_id', 'name', 'color', 'full_name', 'company_name', 'vat_id',
  'phone', 'email', 'calendar_email', 'google_calendar_id',
  'bank_id', 'bank_name', 'bank_branch', 'bank_account',
  'notes', 'amount', 'created_at', 'updated_at',
].join(',');

const CLIENT_LIST_COLS = [
  'id', 'agency_id', 'name', 'contact_person', 'vat_id',
  'phone', 'email', 'address', 'notes', 'color',
  'created_at', 'updated_at',
].join(',');

// ── Events ──────────────────────────────────────────────────────────────────

export function useEventsQuery(agencyId: string | undefined) {
  return useQuery<Event[]>({
    queryKey: ['events', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];
      if (isDemoMode()) return demoGetEvents(agencyId);
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_LIST_COLS)
        .eq('agency_id', agencyId)
        .order('event_date', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Event[];
    },
    enabled: !!agencyId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchOnWindowFocus: false,
  });
}

// ── Artists ──────────────────────────────────────────────────────────────────

export function useArtistsQuery(agencyId: string | undefined) {
  return useQuery<Artist[]>({
    queryKey: ['artists', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];
      if (isDemoMode()) return demoGetArtists(agencyId);
      const { data, error } = await supabase
        .from('artists')
        .select(ARTIST_LIST_COLS)
        .eq('agency_id', agencyId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Artist[];
    },
    enabled: !!agencyId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchOnWindowFocus: false,
  });
}

// ── Clients ─────────────────────────────────────────────────────────────────

export function useClientsQuery(agencyId: string | undefined) {
  return useQuery<Client[]>({
    queryKey: ['clients', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];
      if (isDemoMode()) return demoGetClients(agencyId);
      const { data, error } = await supabase
        .from('clients')
        .select(CLIENT_LIST_COLS)
        .eq('agency_id', agencyId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Client[];
    },
    enabled: !!agencyId,
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    refetchOnWindowFocus: false,
  });
}

// ── Invalidation helpers (call after mutations) ─────────────────────────────

export function useInvalidateEvents() {
  const qc = useQueryClient();
  return (agencyId?: string) => {
    if (agencyId) qc.invalidateQueries({ queryKey: ['events', agencyId] });
    else qc.invalidateQueries({ queryKey: ['events'] });
  };
}

export function useInvalidateArtists() {
  const qc = useQueryClient();
  return (agencyId?: string) => {
    if (agencyId) qc.invalidateQueries({ queryKey: ['artists', agencyId] });
    else qc.invalidateQueries({ queryKey: ['artists'] });
  };
}

export function useInvalidateClients() {
  const qc = useQueryClient();
  return (agencyId?: string) => {
    if (agencyId) qc.invalidateQueries({ queryKey: ['clients', agencyId] });
    else qc.invalidateQueries({ queryKey: ['clients'] });
  };
}

// ── Prefetch helpers (for hover prefetch on nav links) ───────────────────────

export function getPrefetchOptions(agencyId: string | undefined) {
  if (!agencyId) return null;
  const today = new Date().toISOString().slice(0, 10);
  const stale = Math.max(STALE_TIME, PREFETCH_STALE_MIN);
  return {
    events: {
      queryKey: ['events', agencyId] as const,
      queryFn: async () => {
        if (isDemoMode()) return demoGetEvents(agencyId);
        const { data, error } = await supabase
          .from('events')
          .select(EVENT_LIST_COLS)
          .eq('agency_id', agencyId)
          .order('event_date', { ascending: false });
        if (error) throw error;
        return (data || []) as unknown as Event[];
      },
      staleTime: stale,
      gcTime: CACHE_TIME,
    },
    /** Dashboard: next 5 upcoming events only — lighter payload. */
    eventsUpcoming5: {
      queryKey: ['events-upcoming', agencyId] as const,
      queryFn: async () => {
        if (isDemoMode()) {
          const all = demoGetEvents(agencyId);
          return all
            .filter((e) => (e.event_date || '').toString().slice(0, 10) >= today && e.status !== 'cancelled')
            .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''))
            .slice(0, 5);
        }
        const { data, error } = await supabase
          .from('events')
          .select(EVENT_LIST_COLS)
          .eq('agency_id', agencyId)
          .gte('event_date', today)
          .neq('status', 'cancelled')
          .order('event_date', { ascending: true })
          .limit(5);
        if (error) throw error;
        return (data || []) as unknown as Event[];
      },
      staleTime: stale,
      gcTime: CACHE_TIME,
    },
    artists: {
      queryKey: ['artists', agencyId] as const,
      staleTime: stale,
      queryFn: async () => {
        if (isDemoMode()) return demoGetArtists(agencyId);
        const { data, error } = await supabase
          .from('artists')
          .select(ARTIST_LIST_COLS)
          .eq('agency_id', agencyId)
          .order('name', { ascending: true });
        if (error) throw error;
        return (data || []) as unknown as Artist[];
      },
      gcTime: CACHE_TIME,
    },
    clients: {
      queryKey: ['clients', agencyId] as const,
      staleTime: stale,
      queryFn: async () => {
        if (isDemoMode()) return demoGetClients(agencyId);
        const { data, error } = await supabase
          .from('clients')
          .select(CLIENT_LIST_COLS)
          .eq('agency_id', agencyId)
          .order('name', { ascending: true });
        if (error) throw error;
        return (data || []) as unknown as Client[];
      },
      gcTime: CACHE_TIME,
    },
  };
}
