// Supabase Edge Function: google-oauth-callback
// Exchanges OAuth code for tokens and stores a server-only token record.
//
// Required secrets:
// - GOOGLE_OAUTH_CLIENT_ID
// - GOOGLE_OAUTH_CLIENT_SECRET
// - GOOGLE_OAUTH_REDIRECT_URI (must match the start function)
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// NOTE: This function writes:
// - public.integration_tokens (server-only)
// - public.integrations (status/config + token_ref)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function base64UrlDecodeToJson<T>(s: string): T | null {
  try {
    const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((s.length + 3) % 4);
    const raw = atob(b64);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type State = {
  agencyId: string;
  requested?: { drive?: boolean; calendar?: boolean; gmail?: boolean; sheets?: boolean };
  returnTo?: string;
};

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const stateRaw = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error");

  if (error) {
    return html(`<h3>Google OAuth failed</h3><pre>${error}</pre>`, 400);
  }
  if (!code || !stateRaw) {
    return html("<h3>Missing code/state</h3>", 400);
  }

  const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
  const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
  const REDIRECT_URI = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !SUPABASE_URL || !SERVICE_ROLE) {
    return html("<h3>Server missing required secrets</h3>", 500);
  }

  const state = base64UrlDecodeToJson<State>(stateRaw);
  if (!state?.agencyId) return html("<h3>Invalid state</h3>", 400);

  // Exchange code → tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return html(`<h3>Token exchange failed</h3><pre>${txt}</pre>`, 400);
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
    expires_in?: number;
  };

  const expiry_date = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  // Fetch Google user email for display in Settings (reconnect details)
  let googleEmail: string | null = null;
  if (tokens.access_token) {
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userRes.ok) {
        const userInfo = (await userRes.json()) as { email?: string };
        googleEmail = (userInfo?.email || "").trim() || null;
      }
    } catch {
      // non-fatal
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Store tokens server-only
  const { data: tokenRow, error: tokenErr } = await admin
    .from("integration_tokens")
    .insert([
      {
        agency_id: state.agencyId,
        provider: "google",
        access_token: tokens.access_token || null,
        refresh_token: tokens.refresh_token || null,
        scope: tokens.scope || null,
        token_type: tokens.token_type || null,
        expiry_date,
      },
    ])
    .select("id")
    .single();

  if (tokenErr) {
    return html(`<h3>Failed storing tokens</h3><pre>${tokenErr.message}</pre>`, 500);
  }

  // Upsert connection (include google_email for UI: "reconnect" / "connected as")
  const { error: connErr } = await admin.from("integrations").upsert(
    [
      {
        agency_id: state.agencyId,
        provider: "google",
        status: "connected",
        token_ref: tokenRow?.id,
        config: {
          requested: state.requested || {},
          connected_via: "oauth",
          google_email: googleEmail,
          drive_connected: state.requested?.drive !== false,
          calendar_connected: state.requested?.calendar !== false,
        },
        connected_at: new Date().toISOString(),
      },
    ],
    { onConflict: "agency_id,provider" },
  );

  if (connErr) {
    return html(`<h3>Failed updating integration</h3><pre>${connErr.message}</pre>`, 500);
  }

  const returnTo = (state.returnTo || "").trim();
  const safeReturnTo = returnTo.startsWith("http") ? returnTo : "";
  const target = safeReturnTo || "/";

  return html(`
    <script>
      window.location.replace(${JSON.stringify(target)});
    </script>
    <p>Connected. Redirecting…</p>
  `);
});

