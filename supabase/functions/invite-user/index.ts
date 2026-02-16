// Supabase Edge Function: invite-user
// Invites a user by email without switching the current session.
//
// Required secrets:
// - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// - RESEND_API_KEY, RESEND_FROM (or invoke send-email which has them)
//
// Flow: Create user → generate magic link → send via Resend (PRIMARY, no fallbacks).
// Bypasses Gmail and Supabase SMTP for instant delivery.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

type Body = {
  agencyId: string;
  email: string;
  full_name: string;
  role: "producer" | "finance" | "manager" | "owner";
  permissions?: Record<string, boolean>;
  redirectTo?: string;
};

/** Send invite email via Resend (primary, immediate). */
async function sendViaResend(args: {
  supabaseUrl: string;
  serviceRole: string;
  to: string;
  full_name: string;
  magicLink: string;
}): Promise<boolean> {
  const fnUrl = `${args.supabaseUrl.replace(/\/$/, "")}/functions/v1/send-email`;
  try {
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.serviceRole}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [args.to],
        subject: "הזמנה להתחברות — NPC",
        html: `
          <div dir="rtl" style="font-family: sans-serif;">
            <p>שלום ${args.full_name || args.to},</p>
            <p>הוזמנת למערכת NPC. לחץ על הקישור להלן כדי להתחבר:</p>
            <p><a href="${args.magicLink}" style="background:#7c3aed;color:white;padding:10px 20px;text-decoration:none;border-radius:8px;">התחברות</a></p>
            <p>או העתק את הקישור: ${args.magicLink}</p>
            <p>אם לא ביקשת זאת, התעלם ממייל זה.</p>
          </div>`,
      }),
    });
    const data = (await res.json()) as { ok?: boolean };
    return res.ok && !!data?.ok;
  } catch (e) {
    console.error("Resend send failed", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE) {
    return json(
      { error: "Missing server configuration (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)." },
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
  const email = (body.email || "").trim().toLowerCase();
  const full_name = (body.full_name || "").trim();
  const role = body.role;
  const permissions = body.permissions || {};
  const originFromHeader = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || "";
  const redirectTo =
    (body.redirectTo || "").trim() ||
    (Deno.env.get("SITE_URL") || "").trim() ||
    (originFromHeader ? `${originFromHeader}/login` : "").trim();
  const effectiveRedirect = redirectTo || undefined;

  if (!agencyId) return json({ error: "agencyId is required" }, 400);
  if (!email) return json({ error: "email is required" }, 400);
  if (!full_name) return json({ error: "full_name is required" }, 400);
  if (!role) return json({ error: "role is required" }, 400);

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const { data: callerProfile, error: callerProfileErr } = await userClient
    .from("users")
    .select("id,role,agency_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (callerProfileErr || !callerProfile) {
    return json({ error: "Caller profile missing (run bootstrap.sql / ensure_user_profile.sql)" }, 403);
  }

  const callerRole = String((callerProfile as any).role || "");
  const callerAgency = String((callerProfile as any).agency_id || "");

  if (callerAgency !== agencyId) return json({ error: "Forbidden: agency mismatch" }, 403);
  if (!(callerRole === "owner" || callerRole === "manager")) return json({ error: "Forbidden: requires owner/manager" }, 403);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // 1) Create user or get existing
  let invitedId: string | null = null;
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { full_name, role, agency_id: agencyId, permissions },
  });

  if (createErr) {
    const { data: listData } = await admin.auth.admin.listUsers();
    const existing = (listData?.users || []).find((u: any) => (u.email || "").toLowerCase() === email);
    if (existing) invitedId = existing.id;
    if (!invitedId) {
      return json({
        error: createErr.message,
        hint: "If user already exists, use 'Send Link' from the user list to resend the login link.",
      }, 400);
    }
  } else {
    invitedId = createData?.user?.id || null;
  }

  // 2) Generate magic link
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: effectiveRedirect },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    console.error("generateLink error", linkErr);
    return json({ error: "Failed to generate magic link" }, 500);
  }

  const magicLink = linkData.properties.action_link;

  // 3) Send via Resend immediately (primary, no fallbacks)
  const sent = await sendViaResend({
    supabaseUrl: SUPABASE_URL,
    serviceRole: SERVICE_ROLE,
    to: email,
    full_name,
    magicLink,
  });

  // 4) Ensure public.users row exists
  const baseRow: Record<string, unknown> = {
    id: invitedId,
    email,
    full_name,
    role,
    agency_id: agencyId,
    updated_at: new Date().toISOString(),
  };

  const tryUpsert = async (row: Record<string, unknown>) => {
    const { error } = await admin.from("users").upsert(row, { onConflict: "id" });
    if (error) throw error;
  };

  try {
    await tryUpsert({ ...baseRow, permissions });
  } catch {
    await tryUpsert(baseRow);
  }

  const hint = sent
    ? "Invite sent. If the user does not receive the email within a few minutes, ask them to check spam."
    : "Email could not be sent automatically. Copy the link below and send it to the user.";

  return json({
    ok: true,
    user_id: invitedId,
    email,
    hint,
    ...(sent ? {} : { magic_link: magicLink }),
  }, 200);
});
