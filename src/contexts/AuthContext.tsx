import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, getSessionUserFast, getSupabaseEnvDiagnostic, signOut as supabaseSignOut } from '@/lib/supabase';
import type { User } from '@/types';
import { withTimeout } from '@/lib/utils';

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  /** True when initial auth check timed out (e.g. 10s) — show "Retry Connection" */
  authConnectionFailed: boolean;
  /** Call after authConnectionFailed to retry the connection */
  retryConnection: () => void;
  /** Set user from login response so we can navigate without full reload (no getSession timeout) */
  setUserFromLogin: (profile: User, supabaseUser: SupabaseUser) => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<User, 'full_name'>>) => Promise<void>;
  updateCurrentUser: (patch: Partial<Pick<User, 'role' | 'permissions'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authConnectionFailed, setAuthConnectionFailed] = useState(false);

  const fetchUserProfile = async (authUser: SupabaseUser) => {
    const isProduction = typeof window !== 'undefined' && window.location?.hostname !== 'localhost';
    const profileTimeoutMs = isProduction ? 18000 : 12000;
    try {
      const { data, error } = await withTimeout<any>(
        supabase.from('users').select('*').eq('id', authUser.id).single() as any,
        profileTimeoutMs,
        'Fetch user profile'
      );

      if (error) throw error;
      setUser(data);
    } catch (error) {
      const e = error as any;
      const code = String(e?.code || '');
      const message = String(e?.message || '');
      const isMissingRow =
        code === 'PGRST116' ||
        message.toLowerCase().includes('0 rows') ||
        message.toLowerCase().includes('json object requested, multiple (or no) rows returned');
      const isTimeout = message.toLowerCase().includes('timed out') || message.toLowerCase().includes('timeout');

      // On missing row OR timeout: try ensure_user_profile then re-fetch (handles slow Supabase / missing profile)
      if (isMissingRow || isTimeout) {
        try {
          const company_code = (() => {
            try {
              return (localStorage.getItem('ima:last_company_id') || '').trim() || null;
            } catch {
              return null;
            }
          })();

          await withTimeout<any>(
            supabase.rpc('ensure_user_profile', { company_code }) as any,
            profileTimeoutMs,
            'Provision missing profile'
          );

          const { data: data2, error: error2 } = await withTimeout<any>(
            supabase.from('users').select('*').eq('id', authUser.id).single() as any,
            profileTimeoutMs,
            'Re-fetch user profile'
          );

          if (!error2 && data2) {
            setUser(data2);
            return;
          }
        } catch (provisionError) {
          console.error('Auth: profile provisioning failed', provisionError);
        }
      }

      console.error('Auth: Failed to fetch profile', error);
      // Don't clear user on transient profile fetch failure when we already have a session:
      // avoids "logout" after actions (e.g. adding expense) that trigger a refresh.
      const { data: sessionCheck } = await supabase.auth.getSession();
      if (!sessionCheck?.session?.user) setUser(null);
    }
  };

  const refreshUser = async () => {
    // Fast-first refresh to avoid long hangs on bad networks.
    const { user: authUser } = await withTimeout(getSessionUserFast(), 1500, 'Supabase getSession (refresh fast)');
    if (authUser) {
      setSupabaseUser(authUser);
      await fetchUserProfile(authUser);
    } else {
      setUser(null);
      setSupabaseUser(null);
    }
  };

  const retryConnection = React.useCallback(() => {
    setAuthConnectionFailed(false);
    setLoading(true);
    initAuthRef.current?.();
  }, []);

  const setUserFromLogin = React.useCallback((profile: User, supabaseUser: SupabaseUser) => {
    setUser(profile);
    setSupabaseUser(supabaseUser);
    setLoading(false);
    setAuthConnectionFailed(false);
  }, []);

  const initAuthRef = React.useRef<() => void>(() => {});

  useEffect(() => {
    let mounted = true;

    if (import.meta.env.DEV) {
      try {
        const d = getSupabaseEnvDiagnostic();
        let hint = !d.urlSet || !d.keySet
          ? 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time (Netlify env) and redeploy.'
          : !d.anonKeyLooksLikeJwt
            ? 'VITE_SUPABASE_ANON_KEY must be the JWT from Supabase → Settings → API → anon public (starts with eyJ). You may have set a wrong key (e.g. sb_publishable_...).'
            : 'Env loaded. If auth times out, add Site URL and Redirect URLs in Supabase → Authentication → URL Configuration.';
        console.log('[NPC Auth Diagnostic]', JSON.stringify({ ...d, hint }, null, 2));
      } catch (e) {
        console.warn('[NPC Auth Diagnostic]', e);
      }
    }

    const initAuth = async () => {
      setAuthConnectionFailed(false);

      try {
        // Allow guest/demo auth when user entered via "Hello NPC user" screen (no email login).
        const demoAuth = localStorage.getItem('demo_authenticated');
        const demoUserData = localStorage.getItem('demo_user');
        const useDemoAuth = demoAuth === 'true' && demoUserData;
        if (useDemoAuth) {
          console.log('⚡ DEMO MODE: INSTANT AUTH (no Supabase)');
          try {
            const demoUser = JSON.parse(demoUserData) as User;
            if (mounted) {
              setUser(demoUser);
              setLoading(false);
            }
          } catch {
            if (mounted) setLoading(false);
          }
          return; // EXIT - don't check Supabase
        } else if (false) {
          // Safety: ensure demo auth cannot “stick” in non-demo builds
          localStorage.removeItem('demo_authenticated');
          localStorage.removeItem('demo_user');
        }

        // Soft timeout: race getSession vs delay. On timeout show login (no throw, no rescue screen).
        const sessionMaxWaitMs = typeof window !== 'undefined' && window.location?.hostname !== 'localhost' ? 15000 : 8000;
        const softTimeout = new Promise<{ user: any }>((resolve) => {
          setTimeout(() => resolve({ user: null }), sessionMaxWaitMs);
        });
        let result: { user: any } = await Promise.race([
          getSessionUserFast().then((r) => ({ user: r.user })),
          softTimeout,
        ]);
        let authUser = result.user;

        // Magic-link callback: tokens in URL hash; Supabase may need a moment to process them.
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        if (mounted && !authUser && (hash.includes('access_token=') || hash.includes('refresh_token='))) {
          await new Promise((r) => setTimeout(r, 1500));
          const retry = await getSessionUserFast();
          if (retry.user) authUser = retry.user;
        }

        if (mounted) {
          if (authUser) {
            setSupabaseUser(authUser);
            await fetchUserProfile(authUser);
          }
          setLoading(false);
        }
      } catch (error: any) {
        console.error('Auth initialization failed', error);
        if (typeof window !== 'undefined' && window.location?.hostname !== 'localhost') {
          const origin = window.location.origin;
          console.warn(
            'Auth: add these in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:',
            origin,
            origin + '/login'
          );
        }
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuthRef.current = () => initAuth();
    initAuth().catch(() => {
      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      const demoAuth = localStorage.getItem('demo_authenticated');
      const inDemoMode = demoAuth === 'true';
      if (inDemoMode) {
        console.log('⚡ DEMO MODE: Ignoring Supabase auth changes');
        return;
      }

      if (session?.user) {
        setSupabaseUser(session.user);
        await fetchUserProfile(session.user);
        setLoading(false);
        return;
      }

      // Session null: retry immediately, then again after a short delay (token refresh race)
      const { data: retry } = await supabase.auth.getSession();
      if (retry?.session?.user && mounted) {
        setSupabaseUser(retry.session.user);
        await fetchUserProfile(retry.session.user);
        setLoading(false);
        return;
      }

      // Delayed second retry so token refresh doesn't kick user out
      await new Promise((r) => setTimeout(r, 1200));
      if (!mounted) return;
      const { data: retry2 } = await supabase.auth.getSession();
      if (retry2?.session?.user && mounted) {
        setSupabaseUser(retry2.session.user);
        await fetchUserProfile(retry2.session.user);
        setLoading(false);
        return;
      }

      // Only clear after both retries fail (real sign-out or expired session)
      if (mounted) {
        setUser(null);
        setSupabaseUser(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Clear demo mode first so auth listener doesn't treat as demo
    localStorage.removeItem('demo_authenticated');
    localStorage.removeItem('demo_user');
    setUser(null);
    setSupabaseUser(null);

    try {
      await supabaseSignOut();
    } catch (e) {
      console.error('SignOut error', e);
    }

    // Force redirect so UI always leaves the app and no stale state remains
    window.location.href = '/login';
  };

  const updateProfile: AuthContextType['updateProfile'] = async (updates) => {
    const full_name = (updates.full_name ?? '').trim();
    if (!full_name) return;

    if (!import.meta.env.PROD) {
      const demoAuth = localStorage.getItem('demo_authenticated');
      if (demoAuth === 'true') {
        const raw = localStorage.getItem('demo_user');
        const existing = raw ? (JSON.parse(raw) as User) : user;
        if (!existing) return;
        const next = { ...existing, full_name };
        localStorage.setItem('demo_user', JSON.stringify(next));
        setUser(next);
        return;
      }
    }

    if (!supabaseUser) {
      throw new Error('No active session');
    }

    const { error } = await supabase.from('users').update({ full_name }).eq('id', supabaseUser.id);
    if (error) throw error;
    await refreshUser();
  };

  const updateCurrentUser: AuthContextType['updateCurrentUser'] = async (patch) => {
    if (!import.meta.env.PROD) {
      const demoAuth = localStorage.getItem('demo_authenticated');
      if (demoAuth === 'true') {
        const raw = localStorage.getItem('demo_user');
        const existing = raw ? (JSON.parse(raw) as User) : user;
        if (!existing) return;
        const next: User = {
          ...existing,
          ...patch,
          permissions: patch.permissions ? { ...(existing.permissions || {}), ...patch.permissions } : existing.permissions,
        };
        localStorage.setItem('demo_user', JSON.stringify(next));
        setUser(next);
        return;
      }
    }

    // Production: role/permissions should be managed by backend + RLS.
    throw new Error('Permission edits require backend in production.');
  };

  // Expose state for testing (development only)
  if (import.meta.env.DEV) {
    (window as any).__IMA_AUTH_STATE__ = { user, loading, supabaseUser };
  }

  return (
    <AuthContext.Provider value={{ user, supabaseUser, loading, authConnectionFailed, retryConnection, setUserFromLogin, signOut, refreshUser, updateProfile, updateCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
