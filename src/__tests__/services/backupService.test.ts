/**
 * Jest tests for src/services/backupService.ts
 * Backup snapshot formatting, CSV generation, agency validation.
 */
import {
  snapshotToFlatSheets,
  generateCsvFromSnapshot,
  getCsvDownloadFilename,
  generateSnapshot,
  getDownloadCsv,
  type BackupSnapshotV1,
  type BackupSheetV1,
} from '@/services/backupService';

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
      }),
    },
  },
}));

jest.mock('@/lib/demoStore', () => ({
  isDemoMode: jest.fn().mockReturnValue(false),
  demoGetEvents: jest.fn().mockReturnValue([]),
  demoGetClients: jest.fn().mockReturnValue([]),
  demoGetArtists: jest.fn().mockReturnValue([]),
}));

jest.mock('@/lib/financeStore', () => ({
  getFinanceExpenses: jest.fn().mockReturnValue([]),
}));

jest.mock('@/services/sheetsSyncClient', () => ({
  fetchSyncDataForAgency: jest.fn().mockResolvedValue({
    events: [],
    clients: [],
    artists: [],
    expenses: [],
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function cell(he: string, en: string, value: string) {
  return { headers: { he, en }, value: String(value ?? '') };
}

function minimalSheet(nameHe: string, nameEn: string, cols: { he: string; en: string }[], rows: string[][]): BackupSheetV1 {
  const headerRow = cols.map((c) => cell(c.he, c.en, c.he));
  const dataRows = rows.map((r) => cols.map((c, i) => cell(c.he, c.en, r[i] ?? '')));
  return { name_he: nameHe, name_en: nameEn, headers: headerRow, rows: dataRows };
}

function minimalSnapshot(sheets: Partial<BackupSnapshotV1['sheets']> = {}): BackupSnapshotV1 {
  const defaultSheets = {
    events: minimalSheet('אירועים', 'Events', [{ he: 'תאריך', en: 'date' }, { he: 'סכום', en: 'amount' }], [
      ['2026-02-15', '5000'],
    ]),
    clients: minimalSheet('לקוחות', 'Clients', [{ he: 'שם', en: 'name' }], [['Acme']]),
    artists: minimalSheet('אמנים', 'Artists', [{ he: 'שם', en: 'name' }], [['Artist 1']]),
    expenses: minimalSheet('פיננסים', 'Expenses', [{ he: 'סכום', en: 'amount' }], [['100']]),
  };
  return {
    schema_version: 'backup_v1',
    exported_at: '2026-02-16T12:00:00.000Z',
    agency_id: 'agency-123',
    agency_name: 'Test Agency',
    sheets: { ...defaultSheets, ...sheets },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('snapshotToFlatSheets', () => {
  it('transforms snapshot to flat 2D arrays', () => {
    const snapshot = minimalSnapshot();
    const out = snapshotToFlatSheets(snapshot);
    expect(out['אירועים']).toBeDefined();
    expect(out['אירועים'].length).toBeGreaterThanOrEqual(3); // he row, en row, + data
    expect(out['אירועים'][0]).toContain('תאריך');
    expect(out['אירועים'][1]).toContain('date');
    expect(out['אירועים'][2]).toContain('2026-02-15');
  });

  it('handles empty rows', () => {
    const snapshot = minimalSnapshot({
      events: minimalSheet('אירועים', 'Events', [{ he: 'תאריך', en: 'date' }], []),
    });
    const out = snapshotToFlatSheets(snapshot);
    expect(out['אירועים']).toEqual([['תאריך'], ['date']]);
  });

  it('handles missing sheet gracefully', () => {
    const snapshot = minimalSnapshot();
    (snapshot.sheets as any).events = undefined;
    const out = snapshotToFlatSheets(snapshot);
    expect(out['אירועים']).toEqual([]);
  });
});

describe('generateCsvFromSnapshot', () => {
  it('produces valid CSV with title line', () => {
    const snapshot = minimalSnapshot();
    const csv = generateCsvFromSnapshot(snapshot);
    expect(csv).toContain('NPC Backup');
    expect(csv).toContain('Test Agency');
    expect(csv).toContain('2026-02-16');
  });

  it('includes Hebrew and English headers per sheet', () => {
    const snapshot = minimalSnapshot();
    const csv = generateCsvFromSnapshot(snapshot);
    expect(csv).toContain('תאריך');
    expect(csv).toContain('date');
    expect(csv).toContain('# אירועים / Events');
  });

  it('escapes commas in values', () => {
    const snapshot = minimalSnapshot({
      events: minimalSheet('אירועים', 'Events', [{ he: 'שם', en: 'name' }], [['Acme, Inc']]),
    });
    const csv = generateCsvFromSnapshot(snapshot);
    expect(csv).toContain('"Acme, Inc"');
  });

  it('escapes quotes in values', () => {
    const snapshot = minimalSnapshot({
      events: minimalSheet('אירועים', 'Events', [{ he: 'שם', en: 'name' }], [['Say "hello"']]),
    });
    const csv = generateCsvFromSnapshot(snapshot);
    expect(csv).toContain('""');
  });

  it('uses CRLF for Excel compatibility', () => {
    const snapshot = minimalSnapshot();
    const csv = generateCsvFromSnapshot(snapshot);
    expect(csv).toContain('\r\n');
  });
});

describe('getCsvDownloadFilename', () => {
  it('returns filename with date', () => {
    const name = getCsvDownloadFilename();
    expect(name).toMatch(/^npc-backup-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('generateSnapshot', () => {
  it('fails with empty agency_id', async () => {
    const result = await generateSnapshot('');
    expect(result.ok).toBe(false);
    expect((result as any).error).toBeDefined();
    expect((result as any).code).toBe('AGENCY_NOT_LOADED');
  });

  it('fails with whitespace-only agency_id', async () => {
    const result = await generateSnapshot('   ');
    expect(result.ok).toBe(false);
  });

  it('succeeds with valid agency_id', async () => {
    const result = await generateSnapshot('agency-123', 'My Agency');
    expect(result.ok).toBe(true);
    expect((result as any).snapshot).toBeDefined();
    expect((result as any).snapshot.schema_version).toBe('backup_v1');
    expect((result as any).snapshot.agency_name).toBe('My Agency');
    expect((result as any).json).toBeDefined();
    expect((result as any).csv).toBeDefined();
  });

  it('includes all sheet types in snapshot', async () => {
    const result = await generateSnapshot('agency-123');
    expect(result.ok).toBe(true);
    const snap = (result as any).snapshot;
    expect(snap.sheets.events).toBeDefined();
    expect(snap.sheets.clients).toBeDefined();
    expect(snap.sheets.artists).toBeDefined();
    expect(snap.sheets.expenses).toBeDefined();
  });
});

describe('getDownloadCsv', () => {
  it('returns error when generateSnapshot fails', async () => {
    const result = await getDownloadCsv('');
    expect(result.ok).toBe(false);
    expect((result as any).error).toBeDefined();
  });

  it('returns csv and filename when successful', async () => {
    const result = await getDownloadCsv('agency-123', 'Agency');
    expect(result.ok).toBe(true);
    expect((result as any).csv).toBeDefined();
    expect((result as any).suggestedFilename).toMatch(/npc-backup-.*\.csv/);
  });
});
