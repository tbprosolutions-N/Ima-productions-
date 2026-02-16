/**
 * Fetches the current user's role directly from the Supabase users table
 * so UI always reflects DB (avoids stale session/profile metadata).
 * Use this for nav visibility and permission checks (e.g. Sidebar).
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

export function useRole(): { role: UserRole | null; isLoading: boolean } {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole | null>(user?.role ?? null);
  const [isLoading, setIsLoading] = useState(!!user?.id);

  useEffect(() => {
    if (!user?.id) {
      setRole(null);
      setIsLoading(false);
      return;
    }
    if (localStorage.getItem('demo_authenticated') === 'true') {
      setRole((user as any).role ?? null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setRole(user.role ?? null);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        if (cancelled) return;
        if (error) {
          setRole(user.role ?? null);
          return;
        }
        const dbRole = (data as { role?: string })?.role;
        if (dbRole && ['producer', 'finance', 'manager', 'owner'].includes(dbRole)) {
          setRole(dbRole as UserRole);
        } else {
          setRole(user.role ?? null);
        }
      } catch {
        if (!cancelled) setRole(user.role ?? null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  return { role: role ?? user?.role ?? null, isLoading };
}
