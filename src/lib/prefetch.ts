/**
 * Aggressive prefetching for sub-2s page transitions.
 * Call on hover/focus of nav links to preload route chunks.
 */
const PREFETCH_CACHE = new Set<string>();

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
    '/sync': () => import('@/pages/SyncMonitorPage'),
  };
  const load = pathToImport[path];
  if (load) {
    load().catch(() => PREFETCH_CACHE.delete(path));
  }
}
