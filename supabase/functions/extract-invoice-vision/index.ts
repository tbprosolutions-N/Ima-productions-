// Supabase Edge Function: extract-invoice-vision
// Extracts structured invoice data from an image using Claude 3.5 Sonnet Vision.
//
// Required secret: ANTHROPIC_API_KEY (set via `supabase secrets set ANTHROPIC_API_KEY=...`)
//
// Request body: { imageBase64: string, mimeType?: string }
// Response: { supplier_name?, amount?, vat?, expense_date?, vendor_id? } or { error: string }
//
// Used by Finance upload flow; frontend falls back to OCR when this returns error or is unavailable.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-3-5-sonnet-20241022";

const PROMPT = `You are an expert at extracting data from invoices and receipts. The document may be in Hebrew (RTL), English, or both.

Extract the following fields and return ONLY a valid JSON object, no markdown or explanation:
- supplier_name: string (name of vendor/supplier/company)
- vendor_id: string or null (company ID: H.P. / ח.פ. / ע.מ. if present)
- expense_date: string in YYYY-MM-DD format (invoice/receipt date)
- amount: number (total amount to pay; use decimal point)
- vat: number or null (VAT amount or percentage if clearly stated)

If a field is not found, use null for numbers and "" for strings. For date, if only partial (e.g. month/year), use the first day of that month.
Return only the JSON object, no other text.`;

function corsHeaders(origin = "*") {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!ANTHROPIC_API_KEY?.trim()) {
    console.error("extract-invoice-vision: ANTHROPIC_API_KEY not set");
    return json(
      { error: "Vision extraction not configured", code: "NO_API_KEY", hint: "Set ANTHROPIC_API_KEY in Supabase secrets" },
      503
    );
  }

  let body: { imageBase64?: string; mimeType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const imageBase64 = body?.imageBase64;
  const mimeType = body?.mimeType || "image/jpeg";

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return json({ error: "Missing imageBase64", code: "BAD_REQUEST" }, 400);
  }
  const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
  if (cleanBase64.length > 12_000_000) {
    return json({ error: "Image too large (max ~8MB)", code: "PAYLOAD_TOO_LARGE" }, 400);
  }

  const content: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: /^image\//.test(mimeType) ? mimeType : "image/jpeg",
        data: cleanBase64,
      },
    },
    { type: "text", text: PROMPT },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error", res.status, errText);
      return json(
        { error: "Vision API error", status: res.status },
        502
      );
    }

    let data: { content?: Array<{ type: string; text?: string }> };
    try {
      data = (await res.json()) as typeof data;
    } catch {
      return json({ error: "Invalid response from Vision API" }, 502);
    }
    const textBlock = data?.content?.find((b) => b.type === "text");
    const text = textBlock?.text?.trim() || "";

    if (!text) {
      return json({ error: "No extraction result" }, 502);
    }

    // Parse JSON from response (allow wrapped in markdown code block)
    let raw = text;
    const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) raw = codeMatch[1].trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return json({ error: "Could not parse extraction JSON" }, 502);
    }

    const out: Record<string, unknown> = {};
    if (parsed.supplier_name != null) out.supplier_name = String(parsed.supplier_name);
    if (parsed.vendor_id != null && parsed.vendor_id !== "") out.vendor_id = String(parsed.vendor_id);
    if (parsed.expense_date != null && parsed.expense_date !== "") out.expense_date = String(parsed.expense_date);
    if (typeof parsed.amount === "number" && Number.isFinite(parsed.amount)) out.amount = parsed.amount;
    else if (typeof parsed.amount === "string") {
      const n = parseFloat(parsed.amount.replace(/,/g, ""));
      if (Number.isFinite(n)) out.amount = n;
    }
    if (typeof parsed.vat === "number" && Number.isFinite(parsed.vat)) out.vat = parsed.vat;
    else if (typeof parsed.vat === "string") {
      const n = parseFloat(parsed.vat.replace(/,/g, ""));
      if (Number.isFinite(n)) out.vat = n;
    }

    return json(out);
  } catch (e) {
    console.error("extract-invoice-vision error", e);
    return json(
      { error: e instanceof Error ? e.message : "Extraction failed", code: "EXTRACTION_ERROR" },
      500
    );
  }
});
