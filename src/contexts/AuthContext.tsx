import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, getSessionUserFast, signOut as supabaseSignOut } from '@/lib/supabase';
import type { User } from '@/types';
import { withTimeout } from '@/lib/utils';

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  authConnectionFailed: boolean;
  retryConnection: () => void;
  setUserFromLogin: (profile: User, supabaseUser: SupabaseUser) => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<User, 'full_name'>>) => Promise<void>;
  updateCurrentUser: (patch: Partial<Pick<User, 'role' | 'permissions'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const perfLog = (msg: string, ...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(`[perf] Auth: ${msg}`, ...args);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authConnectionFailed, setAuthConnectionFailed] = useState(false);

  // ── Profile fetch (used AFTER login or on confirmed session). Resilient: no aggressive timeout that logs out. ──────────
  const fetchUserProfile = async (authUser: SupabaseUser): Promise<User | null> => {
    const timeout = 15000; // Single longer timeout so slow networks don't lose session
    try {
      // maybeSingle() returns { data: null, error: null } when no row exists — never throws PGRST116.
      // This prevents accidental logouts triggered by the missing-row exception path.
      const { data, error } = await withTimeout<any>(
        supabase.from('users').select('id,email,full_name,role,agency_id,permissions,avatar_url,created_at,updated_at,onboarded').eq('id', authUser.id).maybeSingle() as any,
        timeout,
        'Fetch user profile'
      );
      if (error) throw error;
      if (data) { setUser(data); return data; }

      // data === null means no row yet — try auto-provisioning (new invite / first login)
      try {
        const cc = (() => { try { return (localStorage.getItem('ima:last_company_id') || '').trim() || null; } catch { return null; } })();
        await withTimeout<any>(supabase.rpc('ensure_user_profile', { company_code: cc }) as any, 12000, 'Provision profile');
        const { data: d2, error: e2 } = await withTimeout<any>(
          supabase.from('users').select('id,email,full_name,role,agency_id,permissions,avatar_url,created_at,updated_at,onboarded').eq('id', authUser.id).maybeSingle() as any, 10000, 'Re-fetch profile');
        if (!e2 && d2) { setUser(d2); return d2; }
      } catch (pe) {
        void pe;
      }
    } catch (err) {
      const msg = String((err as any)?.message || '');
      const isTimeout = msg.includes('timed out');
      if (!isTimeout) void err;
    }
    return null;
  };

  const refreshUser = useCallback(async () => {
    // Background refresh — NEVER clears the session on failure.
    // Only an explicit signOut() should clear the user.
    try {
      const { user: au } = await withTimeout(getSessionUserFast(), 3000, 'getSession (refresh)');
      if (au) {
        setSupabaseUser(au);
        await fetchUserProfile(au);
      }
      // If au is null on a background check we ignore it — the session may simply
      // have been slow to restore from localStorage. The next explicit action will
      // re-validate properly.
    } catch {
      // Background refresh failed — session preserved
    }
  }, []);

  const retryConnection = React.useCallback(() => {
    setAuthConnectionFailed(false);
    setLoading(true);
    initAuthRef.current?.();
  }, []);

  const setUserFromLogin = React.useCallback((profile: User, sbUser: SupabaseUser) => {
    setUser(profile);
    setSupabaseUser(sbUser);
    setLoading(false);
    setAuthConnectionFailed(false);
  }, []);

  const initAuthRef = React.useRef<() => void>(() => {});
  const initialCheckDoneRef = React.useRef(false);

  // ── INIT: await getSession() before rendering. No band-aid timeouts. ───
  useEffect(() => {
    let mounted = true;
    let initResolved = false;

    const initAuth = async () => {
      perfLog('init:start');
      try {
        // Demo mode — instant, no Supabase
        const demoAuth = localStorage.getItem('demo_authenticated');
        const demoUserData = localStorage.getItem('demo_user');
        if (demoAuth === 'true' && demoUserData) {
          perfLog('init:demo');
          try {
            const du = JSON.parse(demoUserData) as User;
            if (mounted) { initResolved = true; setUser(du); setLoading(false); }
          } catch { if (mounted) { initResolved = true; setLoading(false); } }
          return;
        }

        // Session restore: give Supabase time to hydrate from localStorage (critical on F5 refresh)
        let authUser: SupabaseUser | null = null;
        try {
          const r = await withTimeout(getSessionUserFast(), 8000, 'getSession (init)');
          authUser = r.user ?? null;
          if (!authUser) {
            await new Promise((res) => setTimeout(res, 500));
            const r2 = await withTimeout(getSessionUserFast(), 6000, 'getSession (retry)');
            authUser = r2.user ?? null;
          }
        } catch {
          authUser = null;
        }

        // OAuth/magic-link callback: tokens in URL hash — give Supabase time to process
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        if (!authUser && (hash.includes('access_token=') || hash.includes('refresh_token='))) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const r2 = await withTimeout(getSessionUserFast(), 3000, 'getSession (magic-link)');
            if (r2.user) authUser = r2.user;
          } catch { /* ignore */ }
          // Clear hash so LoginPage doesn't spin forever if profile fails
          if (typeof window !== 'undefined' && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }

        if (!mounted) return;

        if (authUser) {
          perfLog('init:session', authUser.id);
          setSupabaseUser(authUser);
          perfLog('profile:start');
          const profile = await fetchUserProfile(authUser);
          perfLog('profile:end', !!profile);
          if (!mounted) return;
          // Only redirect to unauthorized when profile row is missing (not on timeout) — prevents logout on refresh
          if (!profile) {
            const { data: recheck } = await supabase.from('users').select('id,email,full_name,role,agency_id,permissions,avatar_url,created_at,updated_at,onboarded').eq('id', authUser.id).maybeSingle();
            if (recheck) {
              setUser(recheck as User);
            } else {
              setUser(null);
              setSupabaseUser(null);
              try { await supabaseSignOut(); } catch { /* ignore */ }
              const base = typeof window !== 'undefined' ? window.location.origin : '';
              if (typeof window !== 'undefined') window.location.href = `${base}/login?unauthorized=1`;
            }
          }
        } else {
          setUser(null);
          setSupabaseUser(null);
        }
        perfLog('init:done');
        if (mounted) { initResolved = true; initialCheckDoneRef.current = true; setLoading(false); }
      } catch (err) {
        void err;
        if (mounted) { initResolved = true; initialCheckDoneRef.current = true; setUser(null); setSupabaseUser(null); setLoading(false); }
      }
    };

    initAuthRef.current = () => initAuth();

    // Network-failure guard: if getSession hangs >20s, treat as no session and stop loading (avoids infinite spinner)
    const networkGuardMs = 20000;
    const guardTimer = setTimeout(() => {
      if (mounted && !initResolved) {
        initResolved = true;
        initialCheckDoneRef.current = true;
        setUser(null);
        setSupabaseUser(null);
        setLoading(false);
      }
    }, networkGuardMs);

    initAuth().catch(() => { if (mounted && !initResolved) { initResolved = true; setLoading(false); } });

    // Auth state listener: SIGNED_OUT / session expiry MUST clear user (no zombie state)
    // Do NOT clear user/session until initial getSession() has completed (prevents logout on refresh race).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      perfLog('auth:event', event);
      if (!mounted) return;
      if (localStorage.getItem('demo_authenticated') === 'true') return;
      if (!initialCheckDoneRef.current && !session) return; // Wait for init before reacting to "no session"

      if (session?.user) {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && typeof window !== 'undefined' && window.history.replaceState) {
          const h = window.location.hash || '';
          if (h.includes('access_token=') || h.includes('refresh_token=')) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }
        // Capture Google OAuth provider tokens for Sheets/Drive API access
        if (event === 'SIGNED_IN') {
          if (session.provider_token) {
            try { localStorage.setItem('google_provider_token', session.provider_token); } catch {}
          }
          if (session.provider_refresh_token) {
            try { localStorage.setItem('google_provider_refresh_token', session.provider_refresh_token); } catch {}
          }
        }
        setSupabaseUser(session.user);
        await fetchUserProfile(session.user);
        setLoading(false);
        return;
      }

      // No session: only clear after initial check is done (avoids F5 race where listener fires before getSession)
      if (!initialCheckDoneRef.current) return;

      try {
        const { data: r } = await withTimeout(supabase.auth.getSession(), 3000, 'listener retry');
        if (r?.session?.user && mounted) {
          setSupabaseUser(r.session.user);
          await fetchUserProfile(r.session.user);
          setLoading(false);
          return;
        }
      } catch { /* timeout */ }

      // SIGNED_OUT / session expiry: clear user
      setUser(null);
      setSupabaseUser(null);
      setLoading(false);
    });

    return () => { mounted = false; clearTimeout(guardTimer); subscription.unsubscribe(); };
  }, []);

  // Refetch profile on window focus — debounced to at most once every 5 minutes
  // to avoid hammering Supabase on rapid tab switches.
  const refreshUserRef = React.useRef(refreshUser);
  refreshUserRef.current = refreshUser;
  const lastFocusRefreshRef = React.useRef(0);
  useEffect(() => {
    const onFocus = () => {
      if (localStorage.getItem('demo_authenticated') === 'true') return;
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < 5 * 60 * 1000) return; // max once per 5 min
      lastFocusRefreshRef.current = now;
      refreshUserRef.current();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // ── Sign out ──────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    localStorage.removeItem('demo_authenticated');
    localStorage.removeItem('demo_user');
    setUser(null);
    setSupabaseUser(null);
    try { await supabaseSignOut(); } catch { /* ignore */ }
    window.location.href = '/login';
  }, []);

  // ── Profile updates ───────────────────────────────────────────────────
  const updateProfile = useCallback<AuthContextType['updateProfile']>(async (updates) => {
    const full_name = (updates.full_name ?? '').trim();
    if (!full_name) return;
    if (!import.meta.env.PROD && localStorage.getItem('demo_authenticated') === 'true') {
      const raw = localStorage.getItem('demo_user');
      const existing = raw ? (JSON.parse(raw) as User) : user;
      if (!existing) return;
      const next = { ...existing, full_name };
      localStorage.setItem('demo_user', JSON.stringify(next));
      setUser(next);
      return;
    }
    if (!supabaseUser) throw new Error('No active session');
    const { error } = await supabase.from('users').update({ full_name }).eq('id', supabaseUser.id);
    if (error) throw error;
    await refreshUser();
  }, [supabaseUser, refreshUser, user]);

  const updateCurrentUser = useCallback<AuthContextType['updateCurrentUser']>(async (patch) => {
    if (!import.meta.env.PROD && localStorage.getItem('demo_authenticated') === 'true') {
      const raw = localStorage.getItem('demo_user');
      const existing = raw ? (JSON.parse(raw) as User) : user;
      if (!existing) return;
      const next: User = { ...existing, ...patch, permissions: patch.permissions ? { ...(existing.permissions || {}), ...patch.permissions } : existing.permissions };
      localStorage.setItem('demo_user', JSON.stringify(next));
      setUser(next);
      return;
    }
    throw new Error('Permission edits require backend in production.');
  }, [user]);

  const value = useMemo(() => ({
    user,
    supabaseUser,
    loading,
    authConnectionFailed,
    retryConnection,
    setUserFromLogin,
    signOut,
    refreshUser,
    updateProfile,
    updateCurrentUser,
  }), [user, supabaseUser, loading, authConnectionFailed, retryConnection, setUserFromLogin, signOut, refreshUser, updateProfile, updateCurrentUser]);

  if (import.meta.env.DEV) {
    (window as any).__IMA_AUTH_STATE__ = { user, loading, supabaseUser };
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
