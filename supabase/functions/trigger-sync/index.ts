/**
 * Supabase Edge Function: trigger-sync
 * Invokes sync-runner so pending sync_jobs (e.g. calendar_upsert) run immediately.
 * Called from EventsPage after saving an event with "Send calendar invite" checked.
 *
 * Requires: JWT (user must be authenticated)
 * Secrets: SYNC_RUNNER_SECRET, SUPABASE_URL (injected)
 *
 * Deploy: npx supabase functions deploy trigger-sync
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
  const secret = Deno.env.get("SYNC_RUNNER_SECRET")?.trim();
  if (!SUPABASE_URL || !secret) {
    return json({ error: "Server not configured (missing SYNC_RUNNER_SECRET or SUPABASE_URL)" }, 502);
  }

  const syncRunnerUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/sync-runner`;
  try {
    const res = await fetch(syncRunnerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-secret": secret,
      },
      body: JSON.stringify({ limit: 20 }),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    if (!res.ok) {
      return json({ error: (data as any)?.error || `sync-runner ${res.status}`, details: data }, 502);
    }
    return json({ ok: true, ...(data as object) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `Failed to trigger sync: ${msg}` }, 502);
  }
});
