// Supabase Edge Function: send-login-magic-link
// Sends magic link for login via Resend (primary, immediate).
// Replaces Supabase signInWithOtp for faster delivery.
//
// Required: RESEND_API_KEY, RESEND_FROM (or via send-email).
// No auth required - anonymous can call (email must exist in users).

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
  email: string;
  redirectTo?: string;
};

/** Send magic link email via Resend (primary, immediate). */
async function sendViaResend(args: {
  supabaseUrl: string;
  serviceRole: string;
  to: string;
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
        subject: "התחברות — NPC",
        html: `
          <div dir="rtl" style="font-family: sans-serif;">
            <p>שלום,</p>
            <p>לחץ על הקישור להלן כדי להתחבר למערכת NPC:</p>
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
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing server configuration" }, 500);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const redirectTo = (body.redirectTo || "").trim();

  if (!email) return json({ error: "email is required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Generate magic link (user must exist in auth.users - caller should check check_email_exists_for_login first)
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: redirectTo || undefined },
  });

  if (linkErr) {
    // Don't reveal whether user exists; generic message
    if (linkErr.message?.toLowerCase().includes("user") && linkErr.message?.toLowerCase().includes("not found")) {
      return json({ error: "כתובת הדוא\"ל לא נמצאה במערכת. פנה למנהל כדי לקבל גישה." }, 400);
    }
    console.error("generateLink error", linkErr);
    return json({ error: linkErr.message || "Failed to generate magic link" }, 400);
  }

  const magicLink = linkData?.properties?.action_link;
  if (!magicLink) return json({ error: "Failed to generate magic link" }, 500);

  // Send via Resend immediately (primary, no fallbacks)
  const sent = await sendViaResend({
    supabaseUrl: SUPABASE_URL,
    serviceRole: SERVICE_ROLE,
    to: email,
    magicLink,
  });

  if (!sent) {
    return json({ error: "שליחת המייל נכשלה. נסה שוב או פנה למנהל." }, 500);
  }

  return json({ ok: true });
});
