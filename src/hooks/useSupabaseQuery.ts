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

// ── Column selectors ────────────────────────────────────────────────────────
// Using '*' ensures queries work regardless of which migrations have been applied
// to the production database. Specific column lists can be restored once the
// consolidated migration (20260224000000) is confirmed applied in all environments.

const EVENT_LIST_COLS  = '*' as const;
const ARTIST_LIST_COLS = '*' as const;
const CLIENT_LIST_COLS = '*' as const;

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
