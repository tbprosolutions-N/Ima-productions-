import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
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

// NOTE: We intentionally keep Supabase client untyped for demo stability.
// The strongly-typed Database definition must match the actual schema; when it
// drifts, TypeScript infers `never` for table operations and breaks the build.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Critical for reliability: avoid hangs when browser storage is blocked.
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
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
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

// Fast boot helper: does NOT hit the network (reads local session).
// Use this for app startup to avoid long hangs on refresh.
export const getSessionUserFast = async () => {
  const { data, error } = await supabase.auth.getSession();
  return { user: data.session?.user ?? null, error };
};

export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  return { data, error };
};
