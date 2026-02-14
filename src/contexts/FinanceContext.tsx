/**
 * Global state for Finance page: expenses list and persistence.
 * OCR results are pushed to DB and state so the UI displays extracted data immediately.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getFinanceExpenses, setFinanceExpenses, type FinanceExpense } from '@/lib/financeStore';
import { isDemoMode } from '@/lib/demoStore';
import type { ExtractedExpense } from '@/services/invoiceExtraction';

type ExpenseItem = FinanceExpense;

export type ExpenseUploadErrorCode =
  | 'STORAGE_FORBIDDEN'   // 403 RLS or bucket
  | 'STORAGE_FAILED'      // other storage error
  | 'INSERT_FORBIDDEN'   // 403 RLS on finance_expenses
  | 'INSERT_SCHEMA'      // missing column / constraint
  | 'INSERT_FAILED';     // other DB error

export class ExpenseUploadError extends Error {
  constructor(
    message: string,
    public code: ExpenseUploadErrorCode,
    public statusCode?: number,
    public details?: string
  ) {
    super(message);
    this.name = 'ExpenseUploadError';
  }
}

interface FinanceContextType {
  expenses: ExpenseItem[];
  /** Set when loadExpenses fails in production (e.g. not authenticated, DB error). */
  expensesLoadError: string | null;
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseItem[]>>;
  loadExpenses: () => void;
  /** Push one expense from OCR: upload file, insert row with extracted data, update state. No review step. */
  addExpenseFromOcr: (args: {
    agencyId: string;
    userId: string | null;
    file: File;
    extracted: ExtractedExpense;
  }) => Promise<ExpenseItem>;
  updateExpense: (id: string, patch: Partial<ExpenseItem>) => void;
  deleteExpense: (id: string) => void;
  notifyExpensesChanged: (count?: number) => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

function rowToExpense(r: Record<string, unknown>): ExpenseItem {
  return {
    id: String(r.id),
    created_at: String(r.created_at),
    updated_at: r.updated_at ? String(r.updated_at) : undefined,
    filename: String(r.filename),
    filetype: String(r.filetype),
    size: Number(r.size) || 0,
    storage_path: String(r.storage_path),
    uploaded_by: r.uploaded_by ? String(r.uploaded_by) : undefined,
    vendor: (r.vendor ?? r.supplier_name) as string | undefined,
    supplier_name: r.supplier_name as string | undefined,
    amount: r.amount != null ? Number(r.amount) : undefined,
    expense_date: r.expense_date ? String(r.expense_date).slice(0, 10) : undefined,
    vat: r.vat != null ? Number(r.vat) : undefined,
    notes: r.notes as string | undefined,
    morning_status: (r.morning_status as ExpenseItem['morning_status']) ?? 'not_synced',
    file_store: 'supabase',
  };
}

export const FinanceProvider: React.FC<{ children: React.ReactNode; agencyId: string }> = ({ children, agencyId }) => {
  const [expenses, setExpensesState] = useState<ExpenseItem[]>([]);
  const [expensesLoadError, setExpensesLoadError] = useState<string | null>(null);

  const loadExpenses = useCallback(() => {
    if (!agencyId) return;
    setExpensesLoadError(null);
    if (isDemoMode()) {
      setExpensesState(getFinanceExpenses(agencyId));
      return;
    }
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('finance_expenses')
          .select('*')
          .eq('agency_id', agencyId)
          .order('created_at', { ascending: false })
          .limit(1000);
        if (error) {
          console.error('[Finance] loadExpenses failed', error.code, error.message, error.details);
          setExpensesLoadError(error.code === 'PGRST301' ? 'לא מאומת — התחבר/י מחדש' : error.message || 'שגיאה בטעינת הוצאות');
          setExpensesState([]);
          return;
        }
        const rows = ((data as any[]) || []).map((x) => ({
          id: String(x.id),
          created_at: String(x.created_at),
          updated_at: x.updated_at ? String(x.updated_at) : undefined,
          filename: String(x.filename),
          filetype: String(x.filetype),
          size: Number(x.size) || 0,
          storage_path: String(x.storage_path),
          uploaded_by: x.uploaded_by ? String(x.uploaded_by) : undefined,
          vendor: x.vendor ?? x.supplier_name ?? undefined,
          supplier_name: x.supplier_name ?? undefined,
          amount: x.amount === null || x.amount === undefined ? undefined : Number(x.amount),
          vat: x.vat === null || x.vat === undefined ? undefined : Number(x.vat),
          expense_date: x.expense_date ? String(x.expense_date).slice(0, 10) : undefined,
          notes: x.notes ?? undefined,
          morning_status: x.morning_status ?? 'not_synced',
          morning_synced_at: x.morning_synced_at ? String(x.morning_synced_at) : undefined,
          file_store: 'supabase' as const,
        })) as ExpenseItem[];
        setExpensesState(rows);
      } catch (e) {
        console.error('[Finance] loadExpenses exception', e);
        setExpensesLoadError(e instanceof Error ? e.message : 'שגיאה בטעינת הוצאות');
        setExpensesState([]);
      }
    })();
  }, [agencyId]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const setExpenses = useCallback((action: React.SetStateAction<ExpenseItem[]>) => {
    setExpensesState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (isDemoMode() && agencyId) {
        setFinanceExpenses(agencyId, next);
      }
      return next;
    });
  }, [agencyId]);

  const notifyExpensesChanged = useCallback((count?: number) => {
    try {
      window.dispatchEvent(
        new CustomEvent('ima:expenses', {
          detail: { count, at: new Date().toISOString() },
        })
      );
    } catch {
      // ignore
    }
  }, []);

  /** Push OCR result to DB and update state so the list displays the new expense with extracted data. */
  const addExpenseFromOcr = useCallback(
    async (args: {
      agencyId: string;
      userId: string | null;
      file: File;
      extracted: ExtractedExpense;
    }): Promise<ExpenseItem> => {
      const { agencyId: aid, userId, file, extracted } = args;
      const reviewId = globalThis.crypto?.randomUUID?.() ?? `exp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
      const storage_path = `${aid}/${reviewId}/${safeName}`;

      const up = await supabase.storage
        .from('expenses')
        .upload(storage_path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
      if (up.error) {
        const msg = up.error.message || 'Storage upload failed';
        const code = msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('policy')
          ? 'STORAGE_FORBIDDEN'
          : 'STORAGE_FAILED';
        console.error('[Finance] Storage upload failed', { code, message: msg, path: storage_path }, up.error);
        throw new ExpenseUploadError(msg, code, (up.error as any)?.statusCode, JSON.stringify(up.error));
      }

      const row: Record<string, unknown> = {
        agency_id: aid,
        uploaded_by: userId,
        filename: file.name,
        filetype: file.type || 'application/octet-stream',
        size: file.size,
        storage_path,
        vendor: extracted.supplier_name || null,
        supplier_name: extracted.supplier_name || null,
        amount: extracted.amount ?? null,
        notes: 'הועלה דרך המערכת',
        morning_status: 'not_synced',
      };
      if (extracted.expense_date) row.expense_date = extracted.expense_date;
      if (extracted.vat != null) row.vat = extracted.vat;

      const { data: inserted, error: insError } = await supabase
        .from('finance_expenses')
        .insert([row as any])
        .select('id, created_at, updated_at, filename, filetype, size, storage_path, uploaded_by, vendor, supplier_name, amount, expense_date, vat, notes, morning_status')
        .single();
      if (insError) {
        const msg = insError.message || 'Insert failed';
        const details = JSON.stringify({ code: insError.code, message: insError.message, details: insError.details });
        console.error('[Finance] finance_expenses insert failed', { code: insError.code, message: insError.message, details: insError.details });
        const code: ExpenseUploadErrorCode =
          insError.code === '42501' || msg.toLowerCase().includes('policy') || msg.toLowerCase().includes('forbidden')
            ? 'INSERT_FORBIDDEN'
            : insError.code === '42703' || msg.toLowerCase().includes('column') || msg.toLowerCase().includes('undefined')
              ? 'INSERT_SCHEMA'
              : 'INSERT_FAILED';
        throw new ExpenseUploadError(msg, code, 500, details);
      }

      const newItem = rowToExpense(inserted as Record<string, unknown>);
      setExpensesState((prev) => [newItem, ...prev]);
      notifyExpensesChanged();
      return newItem;
    },
    [notifyExpensesChanged]
  );

  const updateExpense = useCallback(
    (id: string, patch: Partial<ExpenseItem>) => {
      setExpensesState((prev) =>
        prev.map((e) => (e.id !== id ? e : { ...e, ...patch }))
      );
      if (!isDemoMode()) {
        const dbPatch: Record<string, unknown> = {};
        if (Object.prototype.hasOwnProperty.call(patch, 'vendor')) dbPatch.vendor = patch.vendor ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'supplier_name')) dbPatch.supplier_name = patch.supplier_name ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'amount')) dbPatch.amount = patch.amount ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'vat')) dbPatch.vat = patch.vat ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'expense_date')) dbPatch.expense_date = patch.expense_date ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'notes')) dbPatch.notes = patch.notes ?? null;
        if (Object.keys(dbPatch).length > 0) {
          dbPatch.updated_at = new Date().toISOString();
          supabase.from('finance_expenses').update(dbPatch).eq('id', id).then(({ error }) => {
            if (error) console.error(error);
          });
        }
      }
    },
    []
  );

  const deleteExpense = useCallback((id: string) => {
    setExpensesState((prev) => {
      const exp = prev.find((e) => e.id === id);
      if (!isDemoMode()) {
        if (exp?.storage_path) {
          supabase.storage.from('expenses').remove([exp.storage_path]).catch(() => {});
        }
        supabase.from('finance_expenses').delete().eq('id', id).then(({ error }) => {
          if (error) console.error(error);
        });
      }
      return prev.filter((e) => e.id !== id);
    });
    notifyExpensesChanged();
  }, [notifyExpensesChanged]);

  const value: FinanceContextType = {
    expenses,
    expensesLoadError,
    setExpenses,
    loadExpenses,
    addExpenseFromOcr,
    updateExpense,
    deleteExpense,
    notifyExpensesChanged,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export function useFinance(): FinanceContextType {
  const ctx = useContext(FinanceContext);
  if (ctx === undefined) throw new Error('useFinance must be used within a FinanceProvider');
  return ctx;
}
