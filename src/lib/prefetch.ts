/**
 * Aggressive prefetching for instant page transitions.
 * - Route chunks: preload lazy page components
 * - Data: prefetch React Query cache for Dashboard, Events, Finance
 */
import type { QueryClient } from '@tanstack/react-query';
import { getPrefetchOptions } from '@/hooks/useSupabaseQuery';

const PREFETCH_CACHE = new Set<string>();
const DATA_PREFETCH_CACHE = new Set<string>();

export function prefetchRoute(path: string): void {
  if (PREFETCH_CACHE.has(path)) return;
  PREFETCH_CACHE.add(path);
  const pathToImport: Record<string, () => Promise<unknown>> = {
    '/dashboard': () => import('@/pages/DashboardPage'),
    '/events': () => import('@/pages/EventsPage'),
    '/artists': () => import('@/pages/ArtistsPage'),
    '/clients': () => import('@/pages/ClientsPage'),
    '/finance': () => import('@/pages/FinancePage'),
    '/calendar': () => import('@/pages/CalendarPage'),
    '/documents': () => import('@/pages/DocumentsPage'),
    '/settings': () => import('@/pages/SettingsPage'),
  };
  const load = pathToImport[path];
  if (load) {
    load().catch(() => PREFETCH_CACHE.delete(path));
  }
}

/**
 * Prefetch React Query data for Dashboard, Events, Finance on nav hover.
 * Makes transitions feel instantaneous.
 */
export function prefetchDataForRoute(queryClient: QueryClient, agencyId: string | undefined, path: string): void {
  if (!agencyId) return;
  const cacheKey = `${path}:${agencyId}`;
  if (DATA_PREFETCH_CACHE.has(cacheKey)) return;
  const opts = getPrefetchOptions(agencyId);
  if (!opts) return;

  const routesWithData = ['/dashboard', '/events', '/finance'];
  if (!routesWithData.includes(path)) return;

  DATA_PREFETCH_CACHE.add(cacheKey);
  void Promise.all([
    queryClient.prefetchQuery(opts.events),
    queryClient.prefetchQuery(opts.artists),
    queryClient.prefetchQuery(opts.clients),
  ]).catch(() => DATA_PREFETCH_CACHE.delete(cacheKey));
}
