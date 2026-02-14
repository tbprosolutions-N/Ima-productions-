// Supabase Edge Function: cron-tick
// Lightweight scheduler entrypoint:
// - queues renewal job for Google Calendar watches
// - optionally queues pull jobs as a safety net (even if webhook fails)
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - CRON_SECRET
//
// How to use:
// - schedule this function every 5-15 minutes
// - trigger sync-runner every 1-2 minutes (or let cron-tick also do it by calling sync-runner externally)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("CRON_SECRET") || "";
  if (!secret) return json({ error: "Server missing CRON_SECRET" }, 500);
  // Allow either header or query param for schedulers
  const header = req.headers.get("x-cron-secret") || "";
  const url = new URL(req.url);
  const qp = url.searchParams.get("key") || "";
  if (header !== secret && qp !== secret) return json({ error: "Unauthorized" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Missing Supabase secrets" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({}));
  const queuePull = Boolean((body as any)?.queuePull ?? true);

  // Determine agencies that have watches
  const { data: watches, error: wErr } = await admin
    .from("google_calendar_watches")
    .select("agency_id,id")
    .limit(5000);
  if (wErr) return json({ error: wErr.message }, 500);

  const byAgency = new Map<string, string[]>();
  for (const w of (watches as any[]) || []) {
    const aid = String(w.agency_id || "");
    const wid = String(w.id || "");
    if (!aid || !wid) continue;
    const arr = byAgency.get(aid) || [];
    arr.push(wid);
    byAgency.set(aid, arr);
  }

  let queuedRenew = 0;
  let queuedPull = 0;

  for (const [agencyId, watchIds] of byAgency.entries()) {
    // Renewal job (one per agency)
    await admin.from("sync_jobs").insert([
      {
        agency_id: agencyId,
        provider: "google",
        kind: "calendar_watch_renew",
        status: "pending",
        payload: { requested_at: new Date().toISOString(), source: "cron-tick" },
      } as any,
    ]);
    queuedRenew += 1;

    if (queuePull) {
      // Safety pull: one job per watch (cheap incremental, avoids webhook gaps)
      for (const watchId of watchIds.slice(0, 50)) {
        await admin.from("sync_jobs").insert([
          {
            agency_id: agencyId,
            provider: "google",
            kind: "calendar_pull",
            status: "pending",
            payload: { watch_id: watchId, source: "cron-tick", requested_at: new Date().toISOString() },
          } as any,
        ]);
        queuedPull += 1;
      }
    }
  }

  return json({
    ok: true,
    agencies: byAgency.size,
    queuedRenew,
    queuedPull,
  });
});

