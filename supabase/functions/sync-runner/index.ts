// Supabase Edge Function: sync-runner
// Processes queued rows in public.sync_jobs (Sheets first).
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - SYNC_RUNNER_SECRET (shared secret for calling this endpoint)
//
// Google OAuth secrets required if processing Google jobs:
// - GOOGLE_OAUTH_CLIENT_ID
// - GOOGLE_OAUTH_CLIENT_SECRET
//
// Notes:
// - Tokens are stored server-only in public.integration_tokens (no client policies).
// - This runner is designed to be triggered by cron (Supabase Scheduled Functions) or manual POST.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type SyncJobRow = {
  id: string;
  agency_id: string;
  provider: "google" | "morning" | "sheets";
  kind: string;
  status: "pending" | "running" | "succeeded" | "failed";
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  last_error: string | null;
};

type IntegrationRow = {
  id: string;
  agency_id: string;
  provider: "google" | "morning" | "sheets";
  status: "disconnected" | "connected" | "error";
  token_ref: string | null;
  config: Record<string, unknown> | null;
};

type TokenRow = {
  id: string;
  agency_id: string;
  provider: "google";
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: string | null; // timestamptz
};

async function greeninvoiceRequest(args: { baseUrl: string; path: string; method?: string; token?: string; body?: any }) {
  const url = `${args.baseUrl}${args.path}`;
  const res = await fetch(url, {
    method: args.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(args.token ? { "authorization": `Bearer ${args.token}` } : {}),
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Morning API error ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function greeninvoiceGetJwt(args: { baseUrl: string; id: string; secret: string }) {
  const out = await greeninvoiceRequest({
    baseUrl: args.baseUrl,
    path: "/account/token",
    method: "POST",
    body: { id: args.id, secret: args.secret },
  }) as any;
  const token = String(out?.token || "");
  if (!token) throw new Error("Morning token missing (bad id/secret?)");
  return token;
}

function greeninvoiceDocType(docType: string): number {
  // GreenInvoice uses numeric document type codes.
  // This mapping is a pragmatic default (can be adjusted per account if needed).
  // - 320 is commonly used for invoice in examples.
  if (docType === "receipt") return 400;
  if (docType === "payment_request") return 320;
  return 320;
}

async function morningSyncEventDocument(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
  eventId: string;
}) {
  const { data: sec, error: secErr } = await args.supabaseAdmin
    .from("integration_secrets")
    .select("secret")
    .eq("agency_id", args.agencyId)
    .eq("provider", "morning")
    .maybeSingle();
  if (secErr) throw secErr;
  const secret = (sec as any)?.secret || {};
  const baseUrl = String(secret.base_url || "https://api.greeninvoice.co.il/api/v1");
  const id = String(secret.id || "");
  const apiSecret = String(secret.secret || "");
  if (!id || !apiSecret) throw new Error("Morning credentials missing (connect Morning first)");

  const jwt = await greeninvoiceGetJwt({ baseUrl, id, secret: apiSecret });

  const { data: ev, error: evErr } = await args.supabaseAdmin
    .from("events")
    .select("*")
    .eq("agency_id", args.agencyId)
    .eq("id", args.eventId)
    .single();
  if (evErr) throw evErr;

  const clientId = (ev as any)?.client_id as string | null;
  const artistId = (ev as any)?.artist_id as string | null;

  const [{ data: client }, { data: artist }] = await Promise.all([
    clientId ? args.supabaseAdmin.from("clients").select("*").eq("agency_id", args.agencyId).eq("id", clientId).maybeSingle() : Promise.resolve({ data: null } as any),
    artistId ? args.supabaseAdmin.from("artists").select("*").eq("agency_id", args.agencyId).eq("id", artistId).maybeSingle() : Promise.resolve({ data: null } as any),
  ]);

  const currency = "ILS";
  const lang = "he";
  const eventDate = new Date((ev as any).event_date).toISOString().slice(0, 10);
  const paymentDate = ((ev as any).payment_date ? new Date((ev as any).payment_date).toISOString().slice(0, 10) : eventDate);
  const amount = Number((ev as any).amount || 0);

  const docPayload: any = {
    type: greeninvoiceDocType(String((ev as any).doc_type || "tax_invoice")),
    description: `NPC · אירוע ${eventDate} · ${(ev as any).business_name || ""}`,
    lang,
    currency,
    client: {
      name: (client as any)?.business_name || (ev as any)?.invoice_name || (ev as any)?.business_name || "לקוח",
      emails: ((client as any)?.email ? [(client as any).email] : []),
      phone: (client as any)?.phone || undefined,
      address: (client as any)?.address || undefined,
    },
    income: [
      {
        description: `אירוע ${eventDate} · ${(ev as any).business_name || ""}` + ((artist as any)?.name ? ` · ${(artist as any).name}` : ""),
        quantity: 1,
        price: amount,
        currency,
      },
    ],
  };

  // For receipts, payment is usually required. We provide a minimal payment line.
  if (String((ev as any).doc_type) === "receipt") {
    docPayload.payment = [
      {
        price: amount,
        currency,
        date: paymentDate,
        type: "credit",
      },
    ];
  }

  const created = await greeninvoiceRequest({
    baseUrl,
    path: "/documents",
    method: "POST",
    token: jwt,
    body: docPayload,
  }) as any;

  const docId = created?.id ? String(created.id) : null;
  const docNumber = created?.number ? String(created.number) : null;
  const docUrl = created?.url?.origin ? String(created.url.origin) : null;

  await args.supabaseAdmin
    .from("events")
    .update({
      morning_sync_status: "synced",
      morning_document_id: docId,
      morning_document_number: docNumber,
      morning_document_url: docUrl,
      morning_last_error: null,
    } as any)
    .eq("agency_id", args.agencyId)
    .eq("id", args.eventId);

  return { ok: true, docId, docNumber, docUrl };
}

type FinanceExpenseRow = {
  id: string;
  agency_id: string;
  filename: string;
  vendor: string | null;
  supplier_name: string | null;
  amount: number | null;
  vat: number | null;
  expense_date: string | null;
  morning_status: string | null;
};

async function morningSyncExpenses(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
}) {
  const { data: sec, error: secErr } = await args.supabaseAdmin
    .from("integration_secrets")
    .select("secret")
    .eq("agency_id", args.agencyId)
    .eq("provider", "morning")
    .maybeSingle();
  if (secErr) throw secErr;
  const secret = (sec as any)?.secret || {};
  const baseUrl = String(secret.base_url || "https://api.greeninvoice.co.il/api/v1");
  const id = String(secret.id || "");
  const apiSecret = String(secret.secret || "");
  if (!id || !apiSecret) throw new Error("Morning credentials missing (connect Morning first)");

  const jwt = await greeninvoiceGetJwt({ baseUrl, id, secret: apiSecret });

  const { data: rows, error: listErr } = await args.supabaseAdmin
    .from("finance_expenses")
    .select("id,agency_id,filename,vendor,supplier_name,amount,vat,expense_date,morning_status")
    .eq("agency_id", args.agencyId)
    .in("morning_status", ["not_synced", "error"]);
  if (listErr) throw listErr;
  const expenses = (rows as FinanceExpenseRow[]) || [];
  let synced = 0;
  let errors = 0;

  const currency = "ILS";
  const lang = "he";

  for (const exp of expenses) {
    const amount = Number(exp.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      await args.supabaseAdmin
        .from("finance_expenses")
        .update({ morning_status: "error", updated_at: new Date().toISOString() } as any)
        .eq("id", exp.id);
      errors += 1;
      continue;
    }
    const supplierName = String(exp.supplier_name || exp.vendor || "ספק").trim() || "ספק";
    const expenseDate = exp.expense_date
      ? new Date(exp.expense_date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const description = `הוצאה: ${supplierName} · ${exp.filename || expenseDate}`;

    const docPayload: any = {
      type: 400,
      description,
      lang,
      currency,
      client: { name: supplierName },
      income: [
        {
          description: description.slice(0, 200),
          quantity: 1,
          price: amount,
          currency,
        },
      ],
    };

    try {
      await greeninvoiceRequest({
        baseUrl,
        path: "/documents",
        method: "POST",
        token: jwt,
        body: docPayload,
      });
      const now = new Date().toISOString();
      await args.supabaseAdmin
        .from("finance_expenses")
        .update({
          morning_status: "synced",
          morning_synced_at: now,
          updated_at: now,
        } as any)
        .eq("id", exp.id);
      synced += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await args.supabaseAdmin
        .from("finance_expenses")
        .update({
          morning_status: "error",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", exp.id);
      errors += 1;
    }
  }

  return { ok: true, synced, errors, total: expenses.length };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function parseIsoDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isExpiredSoon(expiry: Date | null, skewSeconds = 120) {
  if (!expiry) return false;
  return expiry.getTime() - Date.now() <= skewSeconds * 1000;
}

async function refreshGoogleAccessToken(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      refresh_token: args.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  const json = await res.json() as { access_token?: string; expires_in?: number; scope?: string; token_type?: string };
  return {
    access_token: json.access_token || "",
    expires_in: json.expires_in || 3600,
    scope: json.scope,
    token_type: json.token_type,
  };
}

async function googleApiFetch(accessToken: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);
  return res;
}

async function googleStopChannel(accessToken: string, channelId: string, resourceId: string) {
  if (!channelId || !resourceId) return;
  // Google channels.stop (works for both Calendar and other Google watch channels)
  await googleApiFetch(accessToken, "https://www.googleapis.com/calendar/v3/channels/stop", {
    method: "POST",
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}

function addDaysIsoDate(dateIso: string, days: number) {
  const d = new Date(dateIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function googleCalendarUpsert(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
  accessToken: string;
  eventId: string;
  sendInvites?: boolean;
}) {
  // Read integration config for calendar id (default: primary)
  const { data: googleConn } = await args.supabaseAdmin
    .from("integrations")
    .select("*")
    .eq("agency_id", args.agencyId)
    .eq("provider", "google")
    .maybeSingle();
  const googleCfg = ((googleConn as IntegrationRow | null)?.config || {}) as any;
  const calendarId = String(googleCfg.company_calendar_id || "primary");

  // Fetch event + optional artist/client
  const { data: ev, error: evErr } = await args.supabaseAdmin
    .from("events")
    .select("*")
    .eq("agency_id", args.agencyId)
    .eq("id", args.eventId)
    .single();
  if (evErr) throw evErr;

  const artistId = (ev as any)?.artist_id as string | null;
  const clientId = (ev as any)?.client_id as string | null;

  const [{ data: artist }, { data: client }] = await Promise.all([
    artistId
      ? args.supabaseAdmin.from("artists").select("id,name,email,calendar_email,google_calendar_id").eq("agency_id", args.agencyId).eq("id", artistId).maybeSingle()
      : Promise.resolve({ data: null } as any),
    clientId
      ? args.supabaseAdmin.from("clients").select("id,business_name,email").eq("agency_id", args.agencyId).eq("id", clientId).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);

  const eventDate = new Date((ev as any).event_date).toISOString().slice(0, 10);
  const endDate = addDaysIsoDate(`${eventDate}T00:00:00.000Z`, 1);

  const summaryParts = [String((ev as any).business_name || "אירוע")];
  if ((artist as any)?.name) summaryParts.push(String((artist as any).name));
  const summary = summaryParts.join(" · ");

  const attendees: any[] = [];
  const artistEmail = String(((artist as any)?.calendar_email || (artist as any)?.email || "")).trim();
  if (artistEmail) attendees.push({ email: artistEmail });
  const clientEmail = ((client as any)?.email || "").trim();
  if (clientEmail) attendees.push({ email: clientEmail });

  const body = {
    summary,
    description:
      `NPC\n` +
      `Event ID: ${(ev as any).id}\n` +
      `Business: ${(ev as any).business_name}\n` +
      `Invoice name: ${(ev as any).invoice_name || ""}\n` +
      `Amount: ${(ev as any).amount || 0}\n` +
      `Status: ${(ev as any).status || ""}\n` +
      `Notes: ${(ev as any).notes || ""}\n`,
    start: { date: eventDate },
    end: { date: endDate },
    attendees: attendees.length > 0 ? attendees : undefined,
    // Allow artist to edit the event (two-way behavior when they have permissions in Google)
    guestsCanModify: true,
    extendedProperties: {
      private: {
        ima_agency_id: args.agencyId,
        ima_event_id: args.eventId,
      },
    },
  };

  const existingGoogleEventId = String((ev as any).google_event_id || "");
  const existingArtistGoogleEventId = String((ev as any).google_artist_event_id || "");
  const sendInvites = args.sendInvites !== false;
  const sendUpdates = sendInvites ? "all" : "none"; // "all" = send calendar invites to attendees

  let result: any;
  if (existingGoogleEventId) {
    const res = await googleApiFetch(
      args.accessToken,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingGoogleEventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    result = await res.json();
  } else {
    const res = await googleApiFetch(
      args.accessToken,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${encodeURIComponent(sendUpdates)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
    result = await res.json();
  }

  // Optional: also write into an admin-owned artist shared calendar, if configured
  let artistResult: any = null;
  const artistCalendarId = String((artist as any)?.google_calendar_id || "").trim();
  if (artistCalendarId) {
    if (existingArtistGoogleEventId) {
      const res = await googleApiFetch(
        args.accessToken,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(artistCalendarId)}/events/${encodeURIComponent(existingArtistGoogleEventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      artistResult = await res.json();
    } else {
      const res = await googleApiFetch(
        args.accessToken,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(artistCalendarId)}/events?sendUpdates=${encodeURIComponent(sendUpdates)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      artistResult = await res.json();
    }
  }

  // Persist back to events table
  await args.supabaseAdmin
    .from("events")
    .update({
      google_event_id: result?.id || null,
      google_event_html_link: result?.htmlLink || null,
      google_artist_event_id: artistResult?.id || (artistCalendarId ? null : undefined),
      google_artist_event_html_link: artistResult?.htmlLink || (artistCalendarId ? null : undefined),
      google_sync_status: "synced",
      google_synced_at: nowIso(),
    } as any)
    .eq("agency_id", args.agencyId)
    .eq("id", args.eventId);

  return {
    calendarId,
    google_event_id: result?.id,
    htmlLink: result?.htmlLink,
    artistCalendarId: artistCalendarId || null,
    google_artist_event_id: artistResult?.id || null,
    artistHtmlLink: artistResult?.htmlLink || null,
    attendees: attendees.map((a: any) => a.email),
  };
}

async function googleCalendarPull(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
  accessToken: string;
  watchId?: string;
}) {
  // Prefer per-calendar watch table (server-only). Fallback to legacy integrations.config.
  let calendarId = "primary";
  let syncToken = "";
  let watchRowId: string | null = null;

  if (args.watchId) {
    const { data: w } = await args.supabaseAdmin
      .from("google_calendar_watches")
      .select("id,calendar_id,sync_token")
      .eq("id", args.watchId)
      .maybeSingle();
    if (w?.calendar_id) calendarId = String((w as any).calendar_id);
    syncToken = String((w as any)?.sync_token || "");
    watchRowId = String((w as any)?.id || "");
  } else {
    const { data: googleConn } = await args.supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("agency_id", args.agencyId)
      .eq("provider", "google")
      .maybeSingle();
    const cfg = ((googleConn as IntegrationRow | null)?.config || {}) as any;
    calendarId = String(cfg.company_calendar_id || "primary");
    syncToken = String((cfg.calendar_watch || {})?.sync_token || "");
  }

  if (!syncToken) return { ok: false, reason: "missing_sync_token", calendarId };

  const listUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  listUrl.searchParams.set("singleEvents", "true");
  listUrl.searchParams.set("showDeleted", "true");
  listUrl.searchParams.set("syncToken", syncToken);

  let pageToken: string | null = null;
  let updated = 0;
  let skipped = 0;
  let deleted = 0;
  let nextSyncToken: string | null = null;

  // Pagination loop
  for (let i = 0; i < 10; i++) {
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);
    else listUrl.searchParams.delete("pageToken");

    let res: Response;
    try {
      res = await googleApiFetch(args.accessToken, listUrl.toString());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Sync token invalidated (Google returns 410). Reset token by doing a lightweight list.
      if (msg.includes(" 410") || msg.includes("410")) {
        const resetRes = await googleApiFetch(
          args.accessToken,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=1&singleEvents=true&showDeleted=true`,
        );
        const resetJson = await resetRes.json() as any;
        const fresh = String(resetJson.nextSyncToken || "");
        if (fresh) {
          if (watchRowId) {
            await args.supabaseAdmin
              .from("google_calendar_watches")
              .update({ sync_token: fresh, last_pulled_at: nowIso() } as any)
              .eq("id", watchRowId);
          }
          return { ok: false, reason: "sync_token_reset", reset: true };
        }
      }
      throw e;
    }

    const data = await res.json() as any;
    const items = (data.items as any[]) || [];
    pageToken = data.nextPageToken || null;
    nextSyncToken = data.nextSyncToken || nextSyncToken;

    for (const it of items) {
      const isDeleted = !!it.deleted || it.status === "cancelled";
      const imaEventId = String(it?.extendedProperties?.private?.ima_event_id || "");
      if (!imaEventId) {
        skipped += 1;
        continue;
      }

      if (isDeleted) {
        // Do not delete local event automatically; just mark as cancelled.
        await args.supabaseAdmin
          .from("events")
          .update({
            status: "cancelled",
            google_sync_status: "synced",
            google_synced_at: nowIso(),
          } as any)
          .eq("agency_id", args.agencyId)
          .eq("id", imaEventId);
        deleted += 1;
        continue;
      }

      // Apply safe fields from Google → NPC
      const startDate = it?.start?.date || (it?.start?.dateTime ? String(it.start.dateTime).slice(0, 10) : "");
      const patch: any = {
        google_event_id: it.id || null,
        google_event_html_link: it.htmlLink || null,
        google_sync_status: "synced",
        google_synced_at: nowIso(),
      };
      if (startDate) patch.event_date = startDate;

      await args.supabaseAdmin
        .from("events")
        .update(patch)
        .eq("agency_id", args.agencyId)
        .eq("id", imaEventId);
      updated += 1;
    }

    if (!pageToken) break;
  }

  if (nextSyncToken) {
    if (watchRowId) {
      await args.supabaseAdmin
        .from("google_calendar_watches")
        .update({ sync_token: nextSyncToken, last_pulled_at: nowIso() } as any)
        .eq("id", watchRowId);
    }
  }

  return { ok: true, calendarId, updated, skipped, deleted, nextSyncToken: !!nextSyncToken };
}

async function googleWatchCalendarEvents(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
  accessToken: string;
  calendarId: string;
  scope: "company" | "artist";
  artistId?: string;
}) {
  const WEBHOOK_URL = Deno.env.get("GOOGLE_CALENDAR_WEBHOOK_URL") || "";
  if (!WEBHOOK_URL) throw new Error("Missing GOOGLE_CALENDAR_WEBHOOK_URL");

  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomUUID();

  const listRes = await googleApiFetch(
    args.accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(args.calendarId)}/events?maxResults=1&singleEvents=true&showDeleted=true`,
  );
  const listJson = await listRes.json() as any;
  const syncToken = String(listJson.nextSyncToken || "");

  const ttlSeconds = 6 * 24 * 60 * 60;
  const watchRes = await googleApiFetch(
    args.accessToken,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(args.calendarId)}/events/watch`,
    {
      method: "POST",
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: WEBHOOK_URL,
        token: channelToken,
        params: { ttl: String(ttlSeconds) },
      }),
    },
  );
  const watch = await watchRes.json() as any;

  const { data: row, error } = await args.supabaseAdmin
    .from("google_calendar_watches")
    .insert([
      {
        agency_id: args.agencyId,
        scope: args.scope,
        artist_id: args.artistId || null,
        calendar_id: args.calendarId,
        channel_id: channelId,
        channel_token: channelToken,
        resource_id: watch.resourceId || null,
        expiration: watch.expiration ? new Date(Number(watch.expiration)).toISOString() : null,
        sync_token: syncToken || null,
      } as any,
    ])
    .select("id,channel_id,resource_id,expiration")
    .single();
  if (error) throw error;

  return { watch_id: (row as any)?.id, channel_id: channelId, resource_id: watch.resourceId || null, expiration: watch.expiration || null };
}

async function googleRenewWatches(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
  accessToken: string;
}) {
  const { data, error } = await args.supabaseAdmin
    .from("google_calendar_watches")
    .select("*")
    .eq("agency_id", args.agencyId);
  if (error) throw error;
  const list = (data as any[]) || [];

  const renewBeforeMs = 12 * 60 * 60 * 1000; // 12h
  const now = Date.now();

  let renewed = 0;
  let skipped = 0;
  let failed = 0;

  for (const w of list) {
    const exp = w?.expiration ? new Date(w.expiration).getTime() : null;
    const needs = !exp || exp - now <= renewBeforeMs;
    if (!needs) {
      skipped += 1;
      continue;
    }

    try {
      // Stop old channel (best-effort)
      if (w.channel_id && w.resource_id) {
        try {
          await googleStopChannel(args.accessToken, String(w.channel_id), String(w.resource_id));
        } catch {
          // ignore
        }
      }

      const WEBHOOK_URL = Deno.env.get("GOOGLE_CALENDAR_WEBHOOK_URL") || "";
      if (!WEBHOOK_URL) throw new Error("Missing GOOGLE_CALENDAR_WEBHOOK_URL");

      const channelId = crypto.randomUUID();
      const channelToken = crypto.randomUUID();
      const ttlSeconds = 6 * 24 * 60 * 60;

      // If sync token missing, establish one (lightweight list)
      let syncToken = String(w.sync_token || "");
      if (!syncToken) {
        const listRes = await googleApiFetch(
          args.accessToken,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(w.calendar_id))}/events?maxResults=1&singleEvents=true&showDeleted=true`,
        );
        const listJson = await listRes.json() as any;
        syncToken = String(listJson.nextSyncToken || "");
      }

      const watchRes = await googleApiFetch(
        args.accessToken,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(w.calendar_id))}/events/watch`,
        {
          method: "POST",
          body: JSON.stringify({
            id: channelId,
            type: "web_hook",
            address: WEBHOOK_URL,
            token: channelToken,
            params: { ttl: String(ttlSeconds) },
          }),
        },
      );
      const watch = await watchRes.json() as any;
      const expirationIso = watch.expiration ? new Date(Number(watch.expiration)).toISOString() : null;

      await args.supabaseAdmin
        .from("google_calendar_watches")
        .update({
          channel_id: channelId,
          channel_token: channelToken,
          resource_id: watch.resourceId || null,
          expiration: expirationIso,
          sync_token: syncToken || null,
          last_pulled_at: nowIso(),
        } as any)
        .eq("id", w.id);

      renewed += 1;
    } catch (e) {
      failed += 1;
      // keep going
      console.warn("renew watch failed", e);
    }
  }

  return { ok: true, total: list.length, renewed, skipped, failed };
}

async function googleCreateArtistCalendar(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
  accessToken: string;
  artistId: string;
}) {
  const { data: artist, error: aErr } = await args.supabaseAdmin
    .from("artists")
    .select("id,name,email,calendar_email,google_calendar_id")
    .eq("agency_id", args.agencyId)
    .eq("id", args.artistId)
    .single();
  if (aErr) throw aErr;

  const existing = String((artist as any)?.google_calendar_id || "").trim();
  if (existing) {
    return { ok: true, already: true, google_calendar_id: existing };
  }

  const summary = `NPC · ${(artist as any)?.name || "Artist"} (Shared)`;
  const createRes = await googleApiFetch(args.accessToken, "https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    body: JSON.stringify({ summary, description: `Shared calendar for artist ${(artist as any)?.id}` }),
  });
  const created = await createRes.json() as { id?: string; summary?: string };
  const calendarId = String(created.id || "").trim();
  if (!calendarId) throw new Error("Failed to create calendar (missing id)");

  // Share with artist email (writer)
  const shareEmail = String((artist as any)?.calendar_email || (artist as any)?.email || "").trim();
  let shared = false;
  if (shareEmail) {
    await googleApiFetch(
      args.accessToken,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/acl`,
      {
        method: "POST",
        body: JSON.stringify({
          role: "writer",
          scope: { type: "user", value: shareEmail },
        }),
      },
    );
    shared = true;
  }

  // Persist to artist
  await args.supabaseAdmin
    .from("artists")
    .update({ google_calendar_id: calendarId } as any)
    .eq("agency_id", args.agencyId)
    .eq("id", args.artistId);

  // Auto-enable webhook watch for this artist calendar (full two-way)
  let watchInfo: any = null;
  try {
    watchInfo = await googleWatchCalendarEvents({
      supabaseAdmin: args.supabaseAdmin,
      agencyId: args.agencyId,
      accessToken: args.accessToken,
      calendarId,
      scope: "artist",
      artistId: args.artistId,
    });
  } catch (e) {
    // Non-fatal; calendar still created.
    watchInfo = { error: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true, created: true, google_calendar_id: calendarId, shared, shared_with: shareEmail || null, watch: watchInfo };
}

function sheetsColumnHeaders() {
  // Keep stable columns so sheets stays consistent across updates.
  return [
    "event_id",
    "event_date",
    "business_name",
    "invoice_name",
    "amount",
    "payment_date",
    "artist_id",
    "artist_fee_amount",
    "status",
    "updated_at",
  ];
}

function toSheetRow(e: any) {
  const toDate = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "");
  return [
    String(e.id || ""),
    toDate(e.event_date),
    String(e.business_name || ""),
    String(e.invoice_name || ""),
    String(e.amount ?? ""),
    toDate(e.payment_date),
    String(e.artist_id || ""),
    String(e.artist_fee_amount ?? ""),
    String(e.status || ""),
    String(e.updated_at || ""),
  ];
}

async function ensureSpreadsheet(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
  accessToken: string;
}): Promise<{ spreadsheetId: string; sheetName: string }> {
  const sheetName = "Events";

  // Try to read from integrations(provider='sheets')
  const { data: existingConn } = await args.supabaseAdmin
    .from("integrations")
    .select("*")
    .eq("agency_id", args.agencyId)
    .eq("provider", "sheets")
    .maybeSingle();

  const cfg = (existingConn as IntegrationRow | null)?.config || {};
  const existingId = (cfg as any)?.spreadsheet_id as string | undefined;
  if (existingId) return { spreadsheetId: existingId, sheetName };

  // Create spreadsheet
  const createRes = await googleApiFetch(
    args.accessToken,
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      body: JSON.stringify({
        properties: { title: `NPC Events Backup (${args.agencyId})` },
        sheets: [{ properties: { title: sheetName } }],
      }),
    },
  );
  const created = await createRes.json() as { spreadsheetId?: string };
  const spreadsheetId = created.spreadsheetId;
  if (!spreadsheetId) throw new Error("Failed to create spreadsheet (missing spreadsheetId)");

  // Write headers
  await googleApiFetch(
    args.accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}!A1:Z1?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values: [sheetsColumnHeaders()] }),
    },
  );

  // Persist connection
  await args.supabaseAdmin.from("integrations").upsert(
    [
      {
        agency_id: args.agencyId,
        provider: "sheets",
        status: "connected",
        config: { spreadsheet_id: spreadsheetId, sheet_name: sheetName },
        connected_at: nowIso(),
      } as any,
    ],
    { onConflict: "agency_id,provider" },
  );

  return { spreadsheetId, sheetName };
}

async function sheetsFullSync(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
  accessToken: string;
}) {
  const { spreadsheetId, sheetName } = await ensureSpreadsheet(args);

  // Fetch events
  const { data: events, error } = await args.supabaseAdmin
    .from("events")
    .select("*")
    .eq("agency_id", args.agencyId)
    .order("event_date", { ascending: false });
  if (error) throw error;
  const list = (events as any[]) || [];

  // Replace sheet contents (simple + deterministic)
  const values = [sheetsColumnHeaders(), ...list.map(toSheetRow)];
  await googleApiFetch(
    args.accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values }) },
  );

  return { spreadsheetId, sheetName, count: list.length };
}

async function sheetsUpsertEvent(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  agencyId: string;
  accessToken: string;
  eventId: string;
}) {
  const { spreadsheetId, sheetName } = await ensureSpreadsheet(args);

  // Fetch event
  const { data: ev, error } = await args.supabaseAdmin
    .from("events")
    .select("*")
    .eq("agency_id", args.agencyId)
    .eq("id", args.eventId)
    .single();
  if (error) throw error;

  // For simplicity (first real worker): run full sync when upsert requested.
  // This keeps sheet consistent without doing row-level lookup logic yet.
  const full = await sheetsFullSync({ supabaseAdmin: args.supabaseAdmin, agencyId: args.agencyId, accessToken: args.accessToken });
  return { ...full, upserted_event_id: args.eventId };
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("SYNC_RUNNER_SECRET") || "";
  if (!secret) return json({ error: "Server missing SYNC_RUNNER_SECRET" }, 500);

  // Allow either header or query param for schedulers
  const header = req.headers.get("x-sync-secret") || "";
  const url = new URL(req.url);
  const qp = url.searchParams.get("key") || "";
  if (header !== secret && qp !== secret) return json({ error: "Unauthorized" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Server missing Supabase env" }, 500);

  const GOOGLE_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
  const GOOGLE_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number((body as any)?.limit || 10), 1), 50);

  // Fetch pending jobs (FIFO-ish)
  const { data: jobs, error: jobsErr } = await admin
    .from("sync_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (jobsErr) return json({ error: jobsErr.message }, 500);

  const results: any[] = [];

  for (const j of (jobs as SyncJobRow[]) || []) {
    // Mark running
    await admin
      .from("sync_jobs")
      .update({ status: "running", started_at: nowIso(), last_error: null })
      .eq("id", j.id);

    try {
      // Google token (used for both sheets + calendar)
      const { data: tok, error: tokErr } = await admin
        .from("integration_tokens")
        .select("*")
        .eq("agency_id", j.agency_id)
        .eq("provider", "google")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tokErr) throw tokErr;
      const token = tok as TokenRow | null;
      if ((j.provider === "sheets" || j.provider === "google") && !token?.access_token) {
        throw new Error("No Google token found for this agency");
      }

      let accessToken = token?.access_token || "";
      const expiry = parseIsoDate(token?.expiry_date || null);
      if (token?.refresh_token && GOOGLE_ID && GOOGLE_SECRET && isExpiredSoon(expiry)) {
        const refreshed = await refreshGoogleAccessToken({
          clientId: GOOGLE_ID,
          clientSecret: GOOGLE_SECRET,
          refreshToken: token.refresh_token,
        });
        accessToken = refreshed.access_token;
        const nextExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        await admin
          .from("integration_tokens")
          .update({ access_token: accessToken, expiry_date: nextExpiry, scope: refreshed.scope || token.scope, token_type: refreshed.token_type || token.token_type })
          .eq("id", token.id);
      }

      let out: any;
      if (j.provider === "sheets") {
        if (j.kind === "events_full_sync") {
          out = await sheetsFullSync({ supabaseAdmin: admin, agencyId: j.agency_id, accessToken });
        } else if (j.kind === "events_upsert") {
          const eventId = String((j.payload as any)?.event_id || "");
          if (!eventId) throw new Error("Missing payload.event_id");
          out = await sheetsUpsertEvent({ supabaseAdmin: admin, agencyId: j.agency_id, accessToken, eventId });
        } else {
          throw new Error(`Unknown sheets job kind: ${j.kind}`);
        }
      } else if (j.provider === "google") {
        if (j.kind === "calendar_upsert") {
          const eventId = String((j.payload as any)?.event_id || "");
          if (!eventId) throw new Error("Missing payload.event_id");
          const sendInvites = (j.payload as any)?.send_invites !== false;
          out = await googleCalendarUpsert({ supabaseAdmin: admin, agencyId: j.agency_id, accessToken, eventId, sendInvites });
        } else if (j.kind === "calendar_pull") {
          const watchId = String((j.payload as any)?.watch_id || "");
          out = await googleCalendarPull({ supabaseAdmin: admin, agencyId: j.agency_id, accessToken, watchId: watchId || undefined });
        } else if (j.kind === "artist_calendar_create") {
          const artistId = String((j.payload as any)?.artist_id || "");
          if (!artistId) throw new Error("Missing payload.artist_id");
          out = await googleCreateArtistCalendar({ supabaseAdmin: admin, agencyId: j.agency_id, accessToken, artistId });
        } else if (j.kind === "calendar_watch_renew") {
          out = await googleRenewWatches({ supabaseAdmin: admin, agencyId: j.agency_id, accessToken });
        } else {
          throw new Error(`Unknown google job kind: ${j.kind}`);
        }
      } else {
        if (j.provider === "morning") {
          if (j.kind === "event_document_create") {
            const eventId = String((j.payload as any)?.event_id || "");
            if (!eventId) throw new Error("Missing payload.event_id");
            out = await morningSyncEventDocument({ supabaseAdmin: admin, agencyId: j.agency_id, eventId });
          } else if (j.kind === "expenses_sync") {
            out = await morningSyncExpenses({ supabaseAdmin: admin, agencyId: j.agency_id });
          } else {
            throw new Error(`Unknown morning job kind: ${j.kind}`);
          }
        } else {
          throw new Error(`Provider not implemented yet: ${j.provider}`);
        }
      }

      await admin
        .from("sync_jobs")
        .update({ status: "succeeded", finished_at: nowIso(), result: out, last_error: null })
        .eq("id", j.id);

      results.push({ id: j.id, status: "succeeded", result: out });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      // Best-effort: mark related records as error (Morning)
      try {
        if (j.provider === "morning" && j.kind === "event_document_create") {
          const eventId = String((j.payload as any)?.event_id || "");
          if (eventId) {
            await admin
              .from("events")
              .update({
                morning_sync_status: "error",
                morning_last_error: msg,
              } as any)
              .eq("agency_id", j.agency_id)
              .eq("id", eventId);
          }
        }
      } catch {
        // ignore – sync_job should still be marked failed
      }

      await admin
        .from("sync_jobs")
        .update({ status: "failed", finished_at: nowIso(), last_error: msg })
        .eq("id", j.id);
      results.push({ id: j.id, status: "failed", error: msg });
    }
  }

  return json({ processed: results.length, results });
});

