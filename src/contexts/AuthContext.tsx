import React, { createContext, useContext, useEffect, useState } from 'react';
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

const IS_PROD = typeof window !== 'undefined' && window.location?.hostname !== 'localhost';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authConnectionFailed, setAuthConnectionFailed] = useState(false);

  // ── Profile fetch (used AFTER login or on confirmed session) ──────────
  const fetchUserProfile = async (authUser: SupabaseUser): Promise<User | null> => {
    const timeout = IS_PROD ? 10000 : 8000;
    try {
      const { data, error } = await withTimeout<any>(
        supabase.from('users').select('*').eq('id', authUser.id).single() as any,
        timeout,
        'Fetch user profile'
      );
      if (error) throw error;
      if (data) { setUser(data); return data; }
    } catch (err) {
      const msg = String((err as any)?.message || '');
      const isMissing = String((err as any)?.code || '') === 'PGRST116' || msg.includes('0 rows');

      // Only try provisioning on explicit missing row (NOT on timeout)
      if (isMissing) {
        try {
          const cc = (() => { try { return (localStorage.getItem('ima:last_company_id') || '').trim() || null; } catch { return null; } })();
          await withTimeout<any>(supabase.rpc('ensure_user_profile', { company_code: cc }) as any, 8000, 'Provision profile');
          const { data: d2, error: e2 } = await withTimeout<any>(
            supabase.from('users').select('*').eq('id', authUser.id).single() as any, 8000, 'Re-fetch profile');
          if (!e2 && d2) { setUser(d2); return d2; }
        } catch (pe) {
          console.warn('Auth: profile provisioning failed', pe);
        }
      }
      console.warn('Auth: profile fetch failed', err);
    }
    return null;
  };

  const refreshUser = async () => {
    try {
      const { user: au } = await withTimeout(getSessionUserFast(), 3000, 'getSession (refresh)');
      if (au) { setSupabaseUser(au); await fetchUserProfile(au); }
      else { setUser(null); setSupabaseUser(null); }
    } catch { /* ignore */ }
  };

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

  // ── INIT: must resolve FAST — show login page within 3-6s max ─────────
  useEffect(() => {
    let mounted = true;

    // Hard safety: ABSOLUTE cap — 3s prod, 3s dev. No matter what, stop loading.
    const hardMs = 3000;
    const hardTimer = setTimeout(() => {
      if (mounted && loading) {
        if (import.meta.env.DEV) console.debug(`[NPC Auth] Hard safety (${hardMs}ms) — forcing loading=false`);
        setLoading(false);
      }
    }, hardMs);

    const initAuth = async () => {
      try {
        // Demo mode — instant, no Supabase
        const demoAuth = localStorage.getItem('demo_authenticated');
        const demoUserData = localStorage.getItem('demo_user');
        if (demoAuth === 'true' && demoUserData) {
          try {
            const du = JSON.parse(demoUserData) as User;
            if (mounted) { setUser(du); setLoading(false); }
          } catch { if (mounted) setLoading(false); }
          return;
        }

        // Fast session check: 3s max. If no session → show login immediately.
        let authUser: SupabaseUser | null = null;
        try {
          const r = await withTimeout(getSessionUserFast(), 3000, 'getSession (init)');
          authUser = r.user ?? null;
        } catch {
          authUser = null; // timeout → treat as no session
        }

        // Magic-link callback: tokens in URL hash — give Supabase time to process
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
          setSupabaseUser(authUser);
          // Try to fetch profile with SHORT timeout — if it fails, still show login
          const profile = await Promise.race([
            fetchUserProfile(authUser),
            new Promise<null>((res) => setTimeout(() => res(null), 4000)),
          ]);
          if (!mounted) return;
          if (!profile) {
            // Profile not available — clear stale session, show login
            setUser(null);
            setSupabaseUser(null);
          }
        }
        if (mounted) setLoading(false);
      } catch (err) {
        console.warn('Auth init error', err);
        if (mounted) setLoading(false);
      }
    };

    initAuthRef.current = () => initAuth();
    initAuth().catch(() => { if (mounted) setLoading(false); });

    // Auth state listener (for magic-link completion, sign-out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (localStorage.getItem('demo_authenticated') === 'true') return;

      if (session?.user) {
        // Clear magic-link hash so LoginPage doesn't spin indefinitely
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && typeof window !== 'undefined' && window.history.replaceState) {
          const h = window.location.hash || '';
          if (h.includes('access_token=') || h.includes('refresh_token=')) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }
        setSupabaseUser(session.user);
        await fetchUserProfile(session.user);
        setLoading(false);
        return;
      }

      // No session — quick retry (token refresh race)
      try {
        const { data: r } = await withTimeout(supabase.auth.getSession(), 3000, 'listener retry');
        if (r?.session?.user && mounted) {
          setSupabaseUser(r.session.user);
          await fetchUserProfile(r.session.user);
          setLoading(false);
          return;
        }
      } catch { /* timeout */ }

      if (mounted) { setUser(null); setSupabaseUser(null); }
      setLoading(false);
    });

    return () => { mounted = false; clearTimeout(hardTimer); subscription.unsubscribe(); };
  }, []);

  // ── Sign out ──────────────────────────────────────────────────────────
  const signOut = async () => {
    localStorage.removeItem('demo_authenticated');
    localStorage.removeItem('demo_user');
    setUser(null);
    setSupabaseUser(null);
    try { await supabaseSignOut(); } catch (e) { console.error('SignOut error', e); }
    window.location.href = '/login';
  };

  // ── Profile updates ───────────────────────────────────────────────────
  const updateProfile: AuthContextType['updateProfile'] = async (updates) => {
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
  };

  const updateCurrentUser: AuthContextType['updateCurrentUser'] = async (patch) => {
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
  };

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
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
