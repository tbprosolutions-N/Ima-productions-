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

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time (e.g. Netlify env vars) and redeploy.');
} else if (!anonKeyLooksLikeJwt && typeof window !== 'undefined') {
  console.error(
    'Supabase anon key does not look valid. It must be the JWT from Supabase Dashboard → Settings → API → "anon" "public" key (starts with eyJ...). ' +
    'You may have set a different key (e.g. sb_publishable_...). Fix VITE_SUPABASE_ANON_KEY in Netlify and redeploy.'
  );
}

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
// Client uses window.location.origin for redirects; no hardcoded origin.
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

export const signInWithMagicLink = async (email: string) => {
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : '';
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
    },
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
};

// Fast boot helper: reads session (Supabase may validate via network).
// Wraps getSession so AbortError from Supabase internals is not left uncaught.
export const getSessionUserFast = async (): Promise<{ user: any; error: any }> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    return { user: data.session?.user ?? null, error };
  } catch (e: any) {
    if (e?.name === 'AbortError' || (e instanceof DOMException && e.name === 'AbortError')) {
      return { user: null, error: { message: 'Connection aborted or timed out' } };
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
