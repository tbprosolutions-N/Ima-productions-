/// <reference types="vite/client" />

interface ImportMetaEnv {
  // ── Required: Supabase (set in Netlify → Environment variables, scope: all) ──
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;

  // ── Optional: App metadata ────────────────────────────────────────────────
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_VERSION?: string;
  /** Canonical public URL of this deployment (e.g. https://npc-am.com). Used for OAuth redirects. */
  readonly VITE_APP_URL?: string;

  // ── Optional: Morning / Green Invoice sandbox ─────────────────────────────
  readonly VITE_MORNING_API_URL?: string;
  readonly VITE_MORNING_SANDBOX_API_KEY?: string;
  readonly VITE_MORNING_SANDBOX_ENABLED?: string;

  // ── Dev / test ────────────────────────────────────────────────────────────
  /** Set to 'true' to bypass Supabase auth and use demo store (dev only). */
  readonly VITE_DEMO_BYPASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
