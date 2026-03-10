import { createClient } from '@supabase/supabase-js';

// Fallback for Vercel env sync (project oerqkyzfsdygmmsonrgz)
const FALLBACK_URL = 'https://oerqkyzfsdygmmsonrgz.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lcnFreXpmc2R5Z21tc29ucmd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODM4NDUsImV4cCI6MjA4NTQ1OTg0NX0.bgl0O37jqsDdSbt28VotD_or3WdmOcIRA7tCQ8_RdPo';
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

const supabaseUrl = normalizeSupabaseUrl(rawUrl) || FALLBACK_URL;
const supabaseAnonKey = rawKey.trim() || FALLBACK_KEY;

// Supabase anon key must be a JWT (long string starting with "eyJ"). Other values (e.g. sb_publishable_...) break auth.
const anonKeyLooksLikeJwt = supabaseAnonKey.length > 50 && supabaseAnonKey.startsWith('eyJ');

// Diagnostic: verify env loaded (first 5 chars only for safety). Expected project: oerqkyzfsdygmmsonrgz
const EXPECTED_PROJECT_REF = 'oerqkyzfsdygmmsonrgz';
if (typeof window !== 'undefined') {
  const urlFirst5 = supabaseUrl.slice(0, 5);
  const keyFirst5 = supabaseAnonKey.slice(0, 5);
  const urlMatchesProject = supabaseUrl.includes(EXPECTED_PROJECT_REF);
  console.info('[Auth] Env check — URL (first 5):', urlFirst5, '| Key (first 5):', keyFirst5, '| Project ref in URL:', urlMatchesProject);
  if (!urlMatchesProject) console.warn('[Auth] Supabase URL may not match project', EXPECTED_PROJECT_REF);
}

// Supabase URL and anon key are required. Invalid key (e.g. sb_publishable_...) will break auth.

/** Canonical app URL (VITE_APP_URL with fallback to production). Use for any app-origin logic. */
export const getAppUrl = (): string => appUrl;

/** For debugging auth connectivity: call from console or Login page. Does not log the full anon key. */
export function getSupabaseEnvDiagnostic(): {
  urlSet: boolean;
  keySet: boolean;
  anonKeyLooksLikeJwt: boolean;
  urlPrefix: string;
  keyLength: number;
  urlScheme: string;
  appUrl: string;
} {
  return {
    urlSet: supabaseUrl.length > 0,
    keySet: supabaseAnonKey.length > 0,
    anonKeyLooksLikeJwt,
    urlPrefix: supabaseUrl ? supabaseUrl.slice(0, 40) + (supabaseUrl.length > 40 ? '…' : '') : '(empty)',
    keyLength: supabaseAnonKey.length,
    urlScheme: supabaseUrl ? (supabaseUrl.startsWith('https') ? 'https' : supabaseUrl.startsWith('http') ? 'http' : 'other') : 'n/a',
    appUrl,
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
    flowType: 'pkce',
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

// Production auth: single source of truth — avoid Vercel preview URL / auth loop
const PRODUCTION_APP_URL = 'https://npc-am.com';
const PRODUCTION_AUTH_CALLBACK = PRODUCTION_APP_URL + '/auth/callback';

const _rawViteAppUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
const appUrl = _rawViteAppUrl || PRODUCTION_APP_URL;
if (typeof window !== 'undefined' && !_rawViteAppUrl) {
  console.warn('Warning: VITE_APP_URL is missing, falling back to https://npc-am.com');
}

/** Returns the redirect URL for OAuth. Always production callback regardless of VITE_APP_URL. */
export function getAuthCallbackRedirectUrl(): string {
  return PRODUCTION_AUTH_CALLBACK;
}

const AUTH_POPUP_NAME = 'ima_supabase_oauth';
const AUTH_DONE_MESSAGE = 'ima-auth-done';
const AUTH_BROADCAST_CHANNEL = 'ima-auth-done';
const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 640;

/** OAuth redirect target: always https://npc-am.com/auth/callback (never env-dependent). */
function getGoogleOAuthRedirectTo(): string {
  const redirectTo = PRODUCTION_AUTH_CALLBACK;
  if (typeof window !== 'undefined') console.info('Auth Redirect Target: ' + redirectTo);
  return redirectTo;
}

/**
 * Start Google OAuth in a popup. Main window stays on npc-am.com — avoids Chrome
 * "intermediate navigation chain" / third‑party cookie issues. Resolves when
 * popup completes auth and closes, or rejects on block/timeout/error.
 */
export function signInWithGooglePopup(): Promise<{ error: { message: string } | null }> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ error: { message: 'לא זמין בסביבה זו' } });
      return;
    }
    const redirectTo = getGoogleOAuthRedirectTo();
    supabase.auth
      .signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
        },
      })
      .then(({ data, error }) => {
        if (error) {
          console.error('[Auth] signInWithOAuth error:', error.message);
          resolve({ error: { message: error.message } });
          return;
        }
        if (!data?.url) {
          resolve({ error: { message: 'לא התקבל קישור להתחברות' } });
          return;
        }
        const left = Math.round((window.screen.width - POPUP_WIDTH) / 2);
        const top = Math.round((window.screen.height - POPUP_HEIGHT) / 2);
        const popup = window.open(
          data.url,
          AUTH_POPUP_NAME,
          `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );
        if (!popup) {
          resolve({ error: { message: 'החלון נחסם. אפשר חלונות קופצים לאתר או לחץ "התחברות בדף מלא".' } });
          return;
        }
        const timeout = 120000; // 2 min
        const timeoutId = setTimeout(() => {
          try {
            if (popup.closed) return;
            popup.close();
          } catch {}
          cleanup();
          resolve({ error: { message: 'זמן ההתחברות פג. נסה שוב.' } });
        }, timeout);
        const onMessage = (e: MessageEvent) => {
          if (e.origin !== window.location.origin || e.data?.type !== AUTH_DONE_MESSAGE) return;
          cleanup();
          resolve({ error: null });
        };
        const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(AUTH_BROADCAST_CHANNEL) : null;
        const onBroadcast = (e: MessageEvent) => {
          if (e.data?.type === AUTH_DONE_MESSAGE) {
            try { bc?.close(); } catch {}
            cleanup();
            resolve({ error: null });
          }
        };
        if (bc) bc.addEventListener('message', onBroadcast);
        const onClose = () => {
          if (popup.closed) {
            cleanup();
            // Popup closed — session might be set if user completed auth in popup
            supabase.auth.getSession().then(({ data: { session } }) => {
              resolve(session ? { error: null } : { error: { message: 'ההתחברות בוטלה או נכשלה.' } });
            });
          }
        };
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            onClose();
          }
        }, 300);
        const cleanup = () => {
          clearTimeout(timeoutId);
          clearInterval(checkClosed);
          window.removeEventListener('message', onMessage);
          if (bc) try { bc.close(); bc.removeEventListener('message', onBroadcast); } catch {}
        };
        window.addEventListener('message', onMessage);
      })
      .catch((e: any) => {
        console.error('[Auth] signInWithGooglePopup exception:', e);
        resolve({ error: { message: e?.message || 'שגיאה בהתחלת התחברות Google' } });
      });
  });
}

/** Listener for auth-done message from popup (call once from LoginPage). */
export function onAuthPopupDone(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: MessageEvent) => {
    if (e.origin !== window.location.origin || e.data?.type !== AUTH_DONE_MESSAGE) return;
    callback();
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** Notify opener that auth completed (call from AuthCallbackPage when in popup). Uses BroadcastChannel so it works when window.opener is null after OAuth redirect. */
export function notifyAuthPopupDone(): void {
  if (typeof window === 'undefined') return;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      bc.postMessage({ type: AUTH_DONE_MESSAGE });
      bc.close();
    }
    if (window.opener) window.opener.postMessage({ type: AUTH_DONE_MESSAGE }, window.location.origin);
  } finally {
    window.close();
  }
}

/** Native Google SSO (OAuth). usePopup: false = redirect (default, most reliable); true = popup. */
export const signInWithGoogle = async (options?: { usePopup?: boolean }): Promise<{ error: { message: string } | null }> => {
  const usePopup = options?.usePopup === true;
  if (usePopup) return signInWithGooglePopup();

  const redirectTo = getGoogleOAuthRedirectTo();
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        scopes: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
      },
    });
    if (error) {
      console.error('[Auth] signInWithOAuth error:', error.message);
      return { error: { message: error.message } };
    }
    if (data?.url) window.location.href = data.url;
    return { error: null };
  } catch (e: any) {
    console.error('[Auth] signInWithGoogle exception:', e);
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

/** Invoke calendar-invite via Vercel API proxy (avoids CORS). */
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
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${base}/api/calendar-invite`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_id: eventId, send_invites: sendInvites }),
  });
  const text = await res.text();
  let data: { ok?: boolean; error?: string };
  try {
    data = text ? (JSON.parse(text) as { ok?: boolean; error?: string }) : {};
  } catch {
    data = { error: text?.slice(0, 100) || `HTTP ${res.status}` };
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}
