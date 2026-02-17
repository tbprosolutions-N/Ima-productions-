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

// ── Column selectors (fetch only what's needed for list views) ──────────────

const EVENT_LIST_COLS = 'id,agency_id,event_date,event_time,weekday,business_name,invoice_name,amount,payment_date,artist_fee_type,artist_fee_value,artist_fee_amount,doc_type,doc_number,due_date,status,notes,morning_sync_status,morning_id,morning_document_id,morning_document_number,morning_document_url,morning_last_error,morning_doc_status,created_at,updated_at,client_id,artist_id,producer_id,approver,google_event_id,google_event_html_link,google_sync_status' as const;

const ARTIST_LIST_COLS = 'id,agency_id,name,color,full_name,company_name,vat_id,phone,email,calendar_email,google_calendar_id,bank_id,bank_name,bank_branch,bank_account,notes,amount,created_at,updated_at' as const;

const CLIENT_LIST_COLS = 'id,agency_id,name,contact_person,vat_id,phone,email,address,notes,color,created_at,updated_at' as const;

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
      return (data || []) as Event[];
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
      return (data || []) as Artist[];
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
      return (data || []) as Client[];
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
