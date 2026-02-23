/**
 * Fetches the current user's role from the Supabase users table.
 * Cached via React Query (2 min stale) to avoid waterfall and repeated requests.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

const ROLE_STALE_MS = 2 * 60 * 1000;
const ROLE_GC_MS = 10 * 60 * 1000;
const VALID_ROLES: UserRole[] = ['producer', 'finance', 'manager', 'owner'];

export function useRole(): { role: UserRole | null; isLoading: boolean } {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data: role, isLoading, isFetching } = useQuery({
    queryKey: ['userRole', userId],
    queryFn: async (): Promise<UserRole | null> => {
      if (!userId) return null;
      if (localStorage.getItem('demo_authenticated') === 'true') {
        return (user as { role?: UserRole })?.role ?? null;
      }
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (error) return (user as { role?: UserRole })?.role ?? null;
      const r = (data as { role?: string })?.role;
      return r && VALID_ROLES.includes(r as UserRole) ? (r as UserRole) : (user as { role?: UserRole })?.role ?? null;
    },
    enabled: !!userId,
    staleTime: ROLE_STALE_MS,
    gcTime: ROLE_GC_MS,
    refetchOnWindowFocus: false,
    placeholderData: user?.role ?? undefined,
  });

  return {
    role: role ?? user?.role ?? null,
    isLoading: !!userId && (isLoading || (isFetching && role === undefined)),
  };
}
