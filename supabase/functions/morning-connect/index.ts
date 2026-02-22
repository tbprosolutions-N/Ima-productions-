// Supabase Edge Function: morning-connect
// Stores Morning/GreenInvoice credentials server-side. Requires JWT. Only owner/finance can save.
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Input: { agencyId, companyId, apiKey, baseUrl? }
// Headers: Authorization: Bearer <session_token>

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

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized", detail: "Missing Authorization: Bearer <token>" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Missing Supabase secrets" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized", detail: authErr?.message || "Invalid token" }, 401);

  const body = await req.json().catch(() => ({}));
  const agencyId = String((body as any)?.agencyId || "").trim();
  const companyId = String((body as any)?.companyId || "").trim();
  const apiKey = String((body as any)?.apiKey || "").trim();
  const baseUrl = String((body as any)?.baseUrl || "https://api.greeninvoice.co.il/api/v1").trim();

  if (!agencyId || !companyId || !apiKey) return json({ error: "agencyId, companyId, apiKey are required" }, 400);

  const { data: appUser } = await admin.from("users").select("agency_id, role").eq("id", user.id).single();
  const userAgencyId = (appUser as any)?.agency_id;
  const userRole = (appUser as any)?.role;
  if (userAgencyId !== agencyId || !["owner", "finance"].includes(userRole || "")) {
    return json({ error: "Forbidden", detail: "Only owner or finance can save Morning credentials" }, 403);
  }

  // Store secret
  const { error: secErr } = await admin.from("integration_secrets").upsert(
    [
      {
        agency_id: agencyId,
        provider: "morning",
        secret: { id: companyId, secret: apiKey, base_url: baseUrl },
      } as any,
    ],
    { onConflict: "agency_id,provider" },
  );
  if (secErr) return json({ error: secErr.message }, 500);

  // Mark integration connected (no secrets in config)
  const { error: iErr } = await admin.from("integrations").upsert(
    [
      {
        agency_id: agencyId,
        provider: "morning",
        status: "connected",
        config: { base_url: baseUrl },
        connected_at: new Date().toISOString(),
      } as any,
    ],
    { onConflict: "agency_id,provider" },
  );
  if (iErr) return json({ error: iErr.message }, 500);

  return json({ ok: true });
});

