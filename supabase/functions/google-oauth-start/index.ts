// Supabase Edge Function: google-oauth-start
// Generates a Google OAuth consent URL with state.
//
// Required Supabase secrets (set in Supabase dashboard / CLI):
// - GOOGLE_OAUTH_CLIENT_ID
// - GOOGLE_OAUTH_REDIRECT_URI (should point to this project's google-oauth-callback function URL)
// - SITE_URL (optional, used for returnTo validation)
//
// Note: This function does NOT store tokens. Tokens are stored in google-oauth-callback.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function base64UrlEncode(obj: unknown) {
  const raw = JSON.stringify(obj);
  const b64 = btoa(raw);
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

type Body = {
  agencyId: string;
  requested?: { drive?: boolean; calendar?: boolean; gmail?: boolean; sheets?: boolean };
  returnTo?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
  const REDIRECT_URI = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI") || "";

  if (!CLIENT_ID || !REDIRECT_URI) {
    return json(
      {
        error:
          "Missing server configuration (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_REDIRECT_URI).",
      },
      500,
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const agencyId = (body.agencyId || "").trim();
  if (!agencyId) return json({ error: "agencyId is required" }, 400);

  const requested = body.requested || {};
  // Minimal scopes. In production, keep these tight and expand only when needed.
  const scopes: string[] = [];
  if (requested.drive) scopes.push("https://www.googleapis.com/auth/drive.file");
  if (requested.calendar) scopes.push("https://www.googleapis.com/auth/calendar");
  if (requested.gmail) scopes.push("https://www.googleapis.com/auth/gmail.send");
  if (requested.sheets) scopes.push("https://www.googleapis.com/auth/spreadsheets");

  // If user clicked "connect", default to all ecosystem scopes (safe for step-by-step rollout).
  if (scopes.length === 0) {
    scopes.push(
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/spreadsheets",
    );
  }

  const state = base64UrlEncode({
    agencyId,
    requested,
    returnTo: body.returnTo || "",
    issuedAt: new Date().toISOString(),
  });

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return json({ authUrl });
});

