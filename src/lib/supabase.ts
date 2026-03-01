import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

// Normalize URL: trim, ensure https in production, no trailing slash (avoids double-slash in paths)
function normalizeSupabaseUrl(url: string): string {
  let u = url.trim();
  if (!u) return '';
  if (u.endsWith('/')) u = u.slice(0, -1);
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && u.startsWith('http://')) {
    u = 'https' + u.slice(4);
  }
  return u;
}

const supabaseUrl = normalizeSupabaseUrl(rawUrl);
const supabaseAnonKey = rawKey.trim();

// Supabase anon key must be a JWT (long string starting with "eyJ"). Other values (e.g. sb_publishable_...) break auth.
const anonKeyLooksLikeJwt = supabaseAnonKey.length > 50 && supabaseAnonKey.startsWith('eyJ');

// Supabase URL and anon key are required. Invalid key (e.g. sb_publishable_...) will break auth.

/** For debugging auth connectivity: call from console or Login page. Does not log the full anon key. */
export function getSupabaseEnvDiagnostic(): {
  urlSet: boolean;
  keySet: boolean;
  anonKeyLooksLikeJwt: boolean;
  urlPrefix: string;
  keyLength: number;
  urlScheme: string;
} {
  return {
    urlSet: supabaseUrl.length > 0,
    keySet: supabaseAnonKey.length > 0,
    anonKeyLooksLikeJwt,
    urlPrefix: supabaseUrl ? supabaseUrl.slice(0, 40) + (supabaseUrl.length > 40 ? '…' : '') : '(empty)',
    keyLength: supabaseAnonKey.length,
    urlScheme: supabaseUrl ? (supabaseUrl.startsWith('https') ? 'https' : supabaseUrl.startsWith('http') ? 'http' : 'other') : 'n/a',
  };
}

if (typeof window !== 'undefined') {
  (window as any).__NPC_SUPABASE_DIAGNOSTIC = getSupabaseEnvDiagnostic;
}

type AuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const memoryStorage = (() => {
  const m = new Map<string, string>();
  const storage: AuthStorage = {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
  return storage;
})();

const safeStorage: AuthStorage = {
  getItem: (k) => {
    try {
      return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(k) : memoryStorage.getItem(k);
    } catch {
      return memoryStorage.getItem(k);
    }
  },
  setItem: (k, v) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(k, v);
      else memoryStorage.setItem(k, v);
    } catch {
      memoryStorage.setItem(k, v);
    }
  },
  removeItem: (k) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(k);
      else memoryStorage.removeItem(k);
    } catch {
      memoryStorage.removeItem(k);
    }
  },
};

// Production: In Supabase Dashboard → Authentication → URL Configuration, set:
// - Site URL: https://npc-am.com (or your production origin)
// - Redirect URLs: https://npc-am.com, https://npc-am.com/login, https://npc-am.com/**
// Session persists in localStorage (storageKey: ima_os_auth) so users stay logged in across browser close/reopen (PWA).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: safeStorage as any,
    storageKey: 'ima_os_auth',
  },
});

// Auth helpers
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

/** @deprecated Use signInWithGoogle for native OAuth */
export const signInWithMagicLink = async (email: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectTo = `${origin}/login`;
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
    },
  });
  return { data, error };
};

/** Native Google SSO (OAuth). Primary login method for B2B. */
export const signInWithGoogle = async (): Promise<{ error: { message: string } | null }> => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const appOrigin = origin.includes('supabase.co') ? (import.meta.env.VITE_APP_URL || 'https://npc-am.com') : origin;
  const redirectTo = `${appOrigin.replace(/\/$/, '')}`;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        scopes: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
      },
    });
    if (error) return { error: { message: error.message } };
    if (data?.url) window.location.href = data.url;
    return { error: null };
  } catch (e: any) {
    return { error: { message: e?.message || 'שגיאה בהתחלת התחברות Google' } };
  }
};

export const signOut = async () => {
  try { localStorage.removeItem('google_provider_token'); localStorage.removeItem('google_provider_refresh_token'); } catch {}
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
};

/** True if the error message indicates JWT/clock skew issues that may be fixed by refreshing the session. */
function isClockSkewOrJwtExpiredError(e: unknown): boolean {
  const msg = typeof (e as any)?.message === 'string' ? (e as any).message.toLowerCase() : '';
  return (
    msg.includes('clock') ||
    msg.includes('skew') ||
    msg.includes('jwt expired') ||
    msg.includes('token has expired') ||
    msg.includes('invalid claim')
  );
}

// Fast boot helper: reads session (Supabase may validate via network).
// On clock skew / JWT expired, refreshes the session once and retries to avoid spurious logouts.
export const getSessionUserFast = async (): Promise<{ user: any; error: any }> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error) return { user: data.session?.user ?? null, error };
    if (isClockSkewOrJwtExpiredError(error)) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData?.session?.user)
        return { user: refreshData.session.user, error: null };
    }
    return { user: (data as any)?.session?.user ?? null, error };
  } catch (e: any) {
    if (e?.name === 'AbortError' || (e instanceof DOMException && e.name === 'AbortError')) {
      return { user: null, error: { message: 'Connection aborted or timed out' } };
    }
    if (isClockSkewOrJwtExpiredError(e)) {
      try {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshData?.session?.user)
          return { user: refreshData.session.user, error: null };
      } catch {
        // fall through to throw or return error
      }
    }
    throw e;
  }
};

export const resetPassword = async (email: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  return { data, error };
};

/** Invoke calendar-invite Edge Function. Uses anon key for platform auth, user JWT in body for our function. */
export async function invokeCalendarInvite(
  eventId: string,
  sendInvites: boolean
): Promise<{ ok?: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  let token = session?.access_token;
  if (!token) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    token = refreshed?.access_token;
  }
  if (!token) throw new Error('Not authenticated');
  const url = `${supabaseUrl}/functions/v1/calendar-invite`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_id: eventId,
      send_invites: sendInvites,
      access_token: token,
    }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}
