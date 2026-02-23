/**
 * Storage-first backup system — backup_v1 schema.
 * Saves snapshots to Supabase Storage, bypassing Google Sheets for core data safety.
 *
 * TRANSCRIPTION (Editable Continuity Sheet):
 * 1. generateSnapshot() pulls latest Events, Artists, Clients, Expenses from DB.
 * 2. snapshotToFlatSheets() maps backup_v1 JSON into bilingual 2D arrays:
 *    Row 1 = Hebrew headers, Row 2 = English headers, Row 3+ = flattened data.
 * 3. syncSnapshotToEditableSheet() is deprecated; use Settings → Export to Sheets instead.
 * 4. Edge Function writes to Google Sheets with USER_ENTERED (dates/numbers stay editable).
 * Data formatting: dates as ISO strings (YYYY-MM-DD), amounts as numbers; cleanNotes() for notes.
 */

import { supabase } from '@/lib/supabase';
import { fetchSyncDataForAgency } from './sheetsSyncClient';
import { resyncEditableSheet } from './sheetsSyncService';
import { cleanNotes } from '@/lib/notesCleanup';
import { isDemoMode } from '@/lib/demoStore';
import { demoGetEvents, demoGetClients, demoGetArtists } from '@/lib/demoStore';
import { getFinanceExpenses } from '@/lib/financeStore';

// ── backup_v1 Schema ──────────────────────────────────────────────────────────

export type BilingualCell = { headers: { he: string; en: string }; value: string };
export type BilingualRow = BilingualCell[];

export type BackupSheetV1 = {
  name_he: string;
  name_en: string;
  headers: BilingualRow; // single row: [{headers:{he,en}, value}, ...]
  rows: BilingualRow[];
};

export type BackupSnapshotV1 = {
  schema_version: 'backup_v1';
  exported_at: string;
  agency_id: string;
  agency_name: string;
  sheets: {
    events: BackupSheetV1;
    clients: BackupSheetV1;
    artists: BackupSheetV1;
    expenses: BackupSheetV1;
  };
};

// ── Bilingual header definitions ───────────────────────────────────────────────

const EVENT_COLUMNS: { he: string; en: string }[] = [
  { he: 'תאריך', en: 'date' },
  { he: 'שם עסק', en: 'business_name' },
  { he: 'שם לחשבונית', en: 'invoice_name' },
  { he: 'סכום', en: 'amount' },
  { he: 'סטטוס', en: 'status' },
  { he: 'אמן', en: 'artist' },
  { he: 'לקוח', en: 'client' },
  { he: 'תאריך תשלום', en: 'payment_date' },
  { he: 'סוג מסמך', en: 'doc_type' },
  { he: 'הערות', en: 'notes' },
  { he: 'סנכרון Morning', en: 'morning_sync' },
  { he: 'עודכן', en: 'updated_at' },
];

const CLIENT_COLUMNS: { he: string; en: string }[] = [
  { he: 'שם', en: 'name' },
  { he: 'איש קשר', en: 'contact_person' },
  { he: 'טלפון', en: 'phone' },
  { he: 'אימייל', en: 'email' },
  { he: 'ח.פ/עוסק', en: 'vat_id' },
  { he: 'כתובת', en: 'address' },
  { he: 'הערות', en: 'notes' },
];

const ARTIST_COLUMNS: { he: string; en: string }[] = [
  { he: 'שם', en: 'name' },
  { he: 'שם מלא', en: 'full_name' },
  { he: 'חברה', en: 'company' },
  { he: 'טלפון', en: 'phone' },
  { he: 'אימייל', en: 'email' },
  { he: 'ח.פ/עוסק', en: 'vat_id' },
  { he: 'בנק', en: 'bank' },
  { he: 'סניף', en: 'branch' },
  { he: 'חשבון', en: 'account' },
  { he: 'הערות', en: 'notes' },
];

const EXPENSE_COLUMNS: { he: string; en: string }[] = [
  { he: 'קובץ', en: 'filename' },
  { he: 'ספק', en: 'vendor' },
  { he: 'סכום', en: 'amount' },
  { he: 'מע״מ', en: 'vat' },
  { he: 'תאריך הוצאה', en: 'expense_date' },
  { he: 'סנכרון Morning', en: 'morning_sync' },
  { he: 'הערות', en: 'notes' },
];

function cell(he: string, en: string, value: string): BilingualCell {
  return { headers: { he, en }, value: String(value ?? '') };
}

function row(cols: { he: string; en: string }[], values: string[]): BilingualRow {
  return cols.map((c, i) => cell(c.he, c.en, values[i] ?? ''));
}

// ── Data mappers ───────────────────────────────────────────────────────────────

/** Flatten date/amount for USER_ENTERED: ISO date string, plain number string. */
function eventToRow(e: any, artistMap: Map<string, string>, clientMap: Map<string, string>): BilingualRow {
  return row(EVENT_COLUMNS, [
    e.event_date || '',
    e.business_name || '',
    e.invoice_name || '',
    String(e.amount ?? ''), // number as string — USER_ENTERED parses
    e.status || '',
    artistMap.get(e.artist_id) || e.artist_id || '',
    clientMap.get(e.client_id) || e.client_id || '',
    e.payment_date || '',
    e.doc_type || '',
    cleanNotes(e.notes),
    e.morning_sync_status || '',
    e.updated_at || '',
  ]);
}

function clientToRow(c: any): BilingualRow {
  return row(CLIENT_COLUMNS, [
    c.name || '',
    c.contact_person || '',
    c.phone || '',
    c.email || '',
    c.vat_id || '',
    c.address || '',
    cleanNotes(c.notes),
  ]);
}

function artistToRow(a: any): BilingualRow {
  return row(ARTIST_COLUMNS, [
    a.name || '',
    a.full_name || '',
    a.company_name || '',
    a.phone || '',
    a.email || '',
    a.vat_id || '',
    a.bank_name || '',
    a.bank_branch || '',
    a.bank_account || '',
    cleanNotes(a.notes),
  ]);
}

function expenseToRow(f: any): BilingualRow {
  return row(EXPENSE_COLUMNS, [
    f.filename || '',
    f.vendor || f.supplier_name || '',
    String(f.amount ?? ''),
    String(f.vat ?? ''),
    f.expense_date || '',
    f.morning_status || '',
    f.notes || '',
  ]);
}

function toSheet(
  name_he: string,
  name_en: string,
  columns: { he: string; en: string }[],
  rows: BilingualRow[]
): BackupSheetV1 {
  const headers: BilingualRow = columns.map((c) => cell(c.he, c.en, c.he));
  return { name_he, name_en, headers, rows };
}

// ── Generate snapshot ──────────────────────────────────────────────────────────

export type GenerateSnapshotResult =
  | { ok: true; snapshot: BackupSnapshotV1; json: string; csv: string }
  | { ok: false; error: string; code?: string };

/**
 * Agency guard: do not proceed without validated agency_id.
 * Agency name is optional (defaults to 'Agency' in generateSnapshot).
 */
function validateAgency(agencyId: string): GenerateSnapshotResult | null {
  if (!agencyId || typeof agencyId !== 'string' || agencyId.trim().length === 0) {
    return { ok: false, error: 'טעינת הסוכנות נכשלה. ודא שהסוכנות נטענה ולחץ נסה שוב.', code: 'AGENCY_NOT_LOADED' };
  }
  return null;
}

/**
 * Fetch agency data and build backup_v1 snapshot. Returns JSON string and CSV string.
 */
export async function generateSnapshot(
  agencyId: string,
  agencyName: string = 'Agency'
): Promise<GenerateSnapshotResult> {
  const guard = validateAgency(agencyId);
  if (guard) return guard;

  const trimmedId = agencyId.trim();
  let events: any[];
  let clients: any[];
  let artists: any[];
  let expenses: any[];

  if (isDemoMode()) {
    events = demoGetEvents(trimmedId);
    clients = demoGetClients(trimmedId);
    artists = demoGetArtists(trimmedId);
    expenses = getFinanceExpenses(trimmedId);
  } else {
    const data = await fetchSyncDataForAgency(trimmedId);
    events = data.events;
    clients = data.clients;
    artists = data.artists;
    expenses = data.expenses;
  }

  const artistMap = new Map(artists.map((a: any) => [a.id, a.name]));
  const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));
  const enrichedEvents = events.map((e: any) => ({
    ...e,
    artist_id: artistMap.get(e.artist_id) || e.artist_id || '',
    client_id: clientMap.get(e.client_id) || e.client_id || '',
  }));

  const snapshot: BackupSnapshotV1 = {
    schema_version: 'backup_v1',
    exported_at: new Date().toISOString(),
    agency_id: trimmedId,
    agency_name: agencyName,
    sheets: {
      events: toSheet('אירועים', 'Events', EVENT_COLUMNS, enrichedEvents.map((e) => eventToRow(e, artistMap, clientMap))),
      clients: toSheet('לקוחות', 'Clients', CLIENT_COLUMNS, clients.map(clientToRow)),
      artists: toSheet('אמנים', 'Artists', ARTIST_COLUMNS, artists.map(artistToRow)),
      expenses: toSheet('פיננסים', 'Expenses', EXPENSE_COLUMNS, expenses.map(expenseToRow)),
    },
  };

  const json = JSON.stringify(snapshot, null, 2);
  const csv = generateCsvFromSnapshot(snapshot);

  return { ok: true, snapshot, json, csv };
}

// ── CSV generation from snapshot ───────────────────────────────────────────────

function escapeCsv(val: string): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Transcription: Transform backup_v1 snapshot into bilingual 2D arrays for Google Sheets.
 * Structure per sheet:
 *   Row 1: Hebrew headers (תאריך, שם עסק, סכום, ...)
 *   Row 2: English headers (date, business_name, amount, ...)
 *   Row 3+: Flattened data — simple strings/numbers for USER_ENTERED mode.
 * Complex objects (dates, currency, categories) are pre-flattened in *ToRow mappers.
 */
export function snapshotToFlatSheets(snapshot: BackupSnapshotV1): {
  'אירועים': string[][];
  'לקוחות': string[][];
  'אמנים': string[][];
  'פיננסים': string[][];
} {
  const out: { 'אירועים': string[][]; 'לקוחות': string[][]; 'אמנים': string[][]; 'פיננסים': string[][] } = {
    'אירועים': [],
    'לקוחות': [],
    'אמנים': [],
    'פיננסים': [],
  };
  const keys = ['events', 'clients', 'artists', 'expenses'] as const;
  const names = ['אירועים', 'לקוחות', 'אמנים', 'פיננסים'] as const;
  for (let i = 0; i < keys.length; i++) {
    const sheet = snapshot.sheets[keys[i]];
    if (!sheet?.headers || !sheet.rows) continue;
    const heRow = sheet.headers.map((c) => c.headers.he);
    const enRow = sheet.headers.map((c) => c.headers.en);
    const dataRows = sheet.rows.map((r) => r.map((c) => c.value));
    out[names[i]] = [heRow, enRow, ...dataRows];
  }
  return out;
}

/**
 * Generate a clean, bilingual CSV from backup_v1 snapshot for direct download.
 * Format: title line (agency, date), then per-sheet blocks with Row 1 = Hebrew headers,
 * Row 2 = English headers, Row 3+ = data. Uses CRLF for Excel compatibility.
 */
export function generateCsvFromSnapshot(snapshot: BackupSnapshotV1): string {
  const CSV_NEWLINE = '\r\n';
  const title = `NPC Backup,${escapeCsv(snapshot.agency_name)},${escapeCsv(snapshot.exported_at)}`;
  const sections: string[] = [title];

  for (const [, sheet] of Object.entries(snapshot.sheets)) {
    if (!sheet || !sheet.headers || !sheet.rows) continue;
    const heRow = sheet.headers.map((c) => escapeCsv(c.headers.he)).join(',');
    const enRow = sheet.headers.map((c) => escapeCsv(c.headers.en)).join(',');
    const dataRows = sheet.rows.map((r) => r.map((c) => escapeCsv(c.value)).join(','));
    sections.push('');
    sections.push(`# ${sheet.name_he} / ${sheet.name_en}`);
    sections.push(heRow);
    sections.push(enRow);
    sections.push(...dataRows);
  }

  return sections.join(CSV_NEWLINE);
}

/** Suggested filename for CSV download (e.g. npc-backup-2026-02-16.csv). */
export function getCsvDownloadFilename(): string {
  return `npc-backup-${new Date().toISOString().slice(0, 10)}.csv`;
}

/**
 * Generate a clean, bilingual CSV suitable for direct download to the user's device.
 * Uses generateSnapshot + generateCsvFromSnapshot; includes BOM when building the blob in the UI.
 */
export async function getDownloadCsv(
  agencyId: string,
  agencyName: string = 'Agency'
): Promise<{ ok: true; csv: string; suggestedFilename: string } | { ok: false; error: string; code?: string }> {
  const result = await generateSnapshot(agencyId, agencyName);
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  return { ok: true, csv: result.csv, suggestedFilename: getCsvDownloadFilename() };
}

// ── Upload to Storage ──────────────────────────────────────────────────────────

export type UploadResult =
  | { ok: true; jsonPath: string; csvPath: string }
  | { ok: false; error: string; code?: string };

const BUCKET = 'backups';

/**
 * Save snapshot to Supabase Storage. Path: backups/{agency_id}/{timestamp}_snapshot.json
 */
export async function uploadToStorage(
  agencyId: string,
  _snapshot: BackupSnapshotV1,
  json: string,
  csv: string
): Promise<UploadResult> {
  const guard = validateAgency(agencyId);
  if (guard && !guard.ok) return { ok: false, error: guard.error, code: guard.code };

  const trimmedId = agencyId.trim();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = `${trimmedId}/${ts}_snapshot.json`;
  const csvPath = `${trimmedId}/${ts}_snapshot.csv`;

  const jsonBlob = new Blob([json], { type: 'application/json' });
  const csvBlob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });

  const [jsonRes, csvRes] = await Promise.all([
    supabase.storage.from(BUCKET).upload(jsonPath, jsonBlob, { contentType: 'application/json', upsert: true }),
    supabase.storage.from(BUCKET).upload(csvPath, csvBlob, { contentType: 'text/csv;charset=utf-8', upsert: true }),
  ]);

  if (jsonRes.error) return { ok: false, error: jsonRes.error.message, code: 'STORAGE_JSON_FAILED' };
  if (csvRes.error) return { ok: false, error: csvRes.error.message, code: 'STORAGE_CSV_FAILED' };

  return { ok: true, jsonPath, csvPath };
}

// ── Editable Continuity Sheet ───────────────────────────────────────────────────

export type SyncEditableResult =
  | { ok: true; queued: true; queueId: string }
  | { ok: true }
  | { ok: false; error: string; code?: string };

/**
 * Push backup_v1 snapshot to client's Google Sheet as flat, bilingual, editable data.
 * Transcription flow: generateSnapshot → snapshotToFlatSheets. (Legacy sync_queue removed.)
 * Edge Function uses USER_ENTERED, ensures sheet tabs exist, bypasses RLS via Service Role.
 * Guards: agency_id, agencyName, spreadsheetId, userId. Circuit breaker blocks empty payloads.
 */
export async function syncSnapshotToEditableSheet(
  agencyId: string,
  spreadsheetId: string,
  agencyName: string = 'Agency',
  userId: string
): Promise<SyncEditableResult> {
  const guard = validateAgency(agencyId);
  if (guard) return guard;

  if (!spreadsheetId || typeof spreadsheetId !== 'string' || spreadsheetId.trim().length === 0) {
    return { ok: false, error: 'חסר מזהה גיליון. צור גיליון גיבוי תחילה.', code: 'NO_SPREADSHEET' };
  }
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return { ok: false, error: 'חסר משתמש. התחבר/י מחדש.', code: 'NO_USER' };
  }
  if (!agencyName || typeof agencyName !== 'string' || agencyName.trim().length === 0) {
    return { ok: false, error: 'חסר שם סוכנות. ודא שהסוכנות נטענה.', code: 'AGENCY_NAME_MISSING' };
  }

  try {
    const gen = await generateSnapshot(agencyId, agencyName);
    if (!gen.ok) return { ok: false, error: gen.error, code: gen.code };

    const flatSheets = snapshotToFlatSheets(gen.snapshot);
    const result = await resyncEditableSheet(agencyId, spreadsheetId.trim(), flatSheets, userId.trim());

    if (result.ok && 'queued' in result && result.queued) {
      return { ok: true, queued: true, queueId: result.queueId };
    }
    if (result.ok) return { ok: true };
    return { ok: false, error: result.error, code: result.code };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return { ok: false, error: msg, code: 'SYNC_FAILED' };
  }
}
