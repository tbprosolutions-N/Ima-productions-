// Supabase Edge Function: send-email
// Sends emails via Resend API. Call from frontend or other Edge Functions.
//
// Required secrets:
// - RESEND_API_KEY (from Resend dashboard)
// - RESEND_FROM (optional): default sender e.g. "NPC Collective <onboarding@resend.dev>"
// - RESEND_REPLY_TO (optional): reply-to address e.g. "npcollectivebooking@gmail.com"
//
// POST body: { to: string[], subject: string, html: string, from?: string, attachments?: { content: string, filename: string }[] }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Resend } from "npm:resend";

function corsHeaders(origin = "*") {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

type Body = {
  to: string[];
  subject: string;
  html: string;
  from?: string;
  reply_to?: string;
  attachments?: { content: string; filename: string }[];
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!apiKey) {
    return json({ error: "RESEND_API_KEY not configured" }, 500);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { to, subject, html } = body;
  if (!Array.isArray(to) || to.length === 0 || !subject || !html) {
    return json({
      error: "Missing required fields: to (array), subject, html",
    }, 400);
  }

  const from = body.from?.trim() || Deno.env.get("RESEND_FROM")?.trim();
  if (!from) {
    return json({
      error: "Missing 'from'. Set RESEND_FROM env or pass 'from' in body.",
    }, 400);
  }

  const attachments = body.attachments;
  if (attachments !== undefined && !Array.isArray(attachments)) {
    return json({ error: "attachments must be an array of { content, filename }" }, 400);
  }

  const replyTo = body.reply_to?.trim() ||
    Deno.env.get("RESEND_REPLY_TO")?.trim();

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(replyTo && { reply_to: replyTo }),
      attachments: attachments?.map((a) => ({
        content: a.content,
        filename: a.filename,
      })),
    });

    if (error) {
      console.error("Resend error:", error);
      return json({ error: error.message, details: error }, 422);
    }

    return json({ ok: true, id: data?.id });
  } catch (err) {
    console.error("send-email error:", err);
    return json({
      error: err instanceof Error ? err.message : "Failed to send email",
    }, 500);
  }
});
