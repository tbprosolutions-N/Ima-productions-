export type FinanceExpense = {
  id: string;
  created_at: string;
  filename: string;
  filetype: string;
  size: number;
  dataUrl?: string;
  file_store?: 'idb' | 'supabase';
  storage_path?: string;
  uploaded_by?: string;
  updated_at?: string;
  vendor?: string;
  supplier_name?: string;
  amount?: number;
  vat?: number;
  expense_date?: string;
  notes?: string;
  morning_status?: 'not_synced' | 'syncing' | 'synced' | 'error';
  morning_synced_at?: string;
};

export function financeExpensesKey(agencyId: string) {
  return `ima_finance_${agencyId}_expenses`;
}

function dispatchExpensesChanged(agencyId: string, count: number) {
  window.dispatchEvent(
    new CustomEvent('ima:expenses', {
      detail: { agencyId, count, at: new Date().toISOString() },
    })
  );
}

export function getFinanceExpenses(agencyId: string): FinanceExpense[] {
  try {
    const raw = localStorage.getItem(financeExpensesKey(agencyId));
    const parsed = raw ? (JSON.parse(raw) as FinanceExpense[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setFinanceExpenses(
  agencyId: string,
  expenses: FinanceExpense[]
): { stored: FinanceExpense[]; didStripFiles: boolean } {
  const k = financeExpensesKey(agencyId);
  try {
    localStorage.setItem(k, JSON.stringify(expenses));
    dispatchExpensesChanged(agencyId, expenses.length);
    return { stored: expenses, didStripFiles: false };
  } catch (e) {
    // Fallback: persist metadata-only so the list + dashboard totals remain consistent.
    const slim = expenses.map((x) => ({
      ...x,
      dataUrl: undefined,
      morning_status: x.morning_status || 'not_synced',
      notes: x.notes?.includes('מגבלת נפח')
        ? x.notes
        : `${(x.notes || '').trim()}${x.notes ? ' · ' : ''}מגבלת נפח: הקובץ לא נשמר לצפייה בדמו (נשמרו פרטים בלבד).`,
    }));
    localStorage.setItem(k, JSON.stringify(slim));
    dispatchExpensesChanged(agencyId, slim.length);
    return { stored: slim, didStripFiles: true };
  }
}

// ---------- IndexedDB file storage (prevents localStorage quota loss) ----------
const DB_NAME = 'ima_finance_files_v1';
const STORE_NAME = 'files';

type StoredExpenseFile = {
  agencyId: string;
  expenseId: string;
  blob: Blob;
  filename?: string;
  filetype?: string;
  createdAt: string;
};

function idbKey(agencyId: string, expenseId: string) {
  return `${agencyId}:${expenseId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function setFinanceExpenseFile(args: {
  agencyId: string;
  expenseId: string;
  file: Blob;
  filename?: string;
  filetype?: string;
}): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const value: StoredExpenseFile = {
      agencyId: args.agencyId,
      expenseId: args.expenseId,
      blob: args.file,
      filename: args.filename,
      filetype: args.filetype,
      createdAt: new Date().toISOString(),
    };
    store.put(value, idbKey(args.agencyId, args.expenseId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
  });
}

export async function getFinanceExpenseFile(args: {
  agencyId: string;
  expenseId: string;
}): Promise<StoredExpenseFile | null> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(idbKey(args.agencyId, args.expenseId));
    req.onsuccess = () => resolve((req.result as StoredExpenseFile) || null);
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
  });
}

export async function deleteFinanceExpenseFile(args: {
  agencyId: string;
  expenseId: string;
}): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(idbKey(args.agencyId, args.expenseId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
  });
}

