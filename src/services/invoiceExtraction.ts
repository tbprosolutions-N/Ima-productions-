/**
 * Invoice data extraction: single interface with Vision (Claude) + OCR fallback.
 * - Tries Vision via Edge Function for images (and optionally PDF first page).
 * - Falls back to ocrService.processFile() on failure or when Vision unavailable.
 */

import { processFile } from '@/services/ocrService';
import type { ExtractedExpense } from '@/services/ocrService';

export type { ExtractedExpense };
import { supabase } from '@/lib/supabase';

const EXTRACT_VISION_FUNCTION = 'extract-invoice-vision';

function isImageType(mime: string): boolean {
  return /^image\/(jpeg|jpg|png|gif|webp)$/i.test(mime);
}

/**
 * Convert File to base64 and mime for the Edge Function.
 */
async function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Expected data URL'));
        return;
      }
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        reject(new Error('Invalid data URL'));
        return;
      }
      resolve({ data: match[2], mimeType: match[1].trim() });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Normalize Edge Function response to ExtractedExpense (with defaults).
 */
function normalizeVisionResponse(
  body: Record<string, unknown>,
  filename: string
): ExtractedExpense {
  const today = new Date().toISOString().slice(0, 10);
  const supplier_name =
    typeof body.supplier_name === 'string' && body.supplier_name.trim()
      ? body.supplier_name.trim()
      : filename.replace(/\.[^/.]+$/, '').slice(0, 80);
  let amount: number | undefined;
  if (typeof body.amount === 'number' && Number.isFinite(body.amount)) {
    amount = body.amount;
  } else if (typeof body.amount === 'string') {
    const n = parseFloat(body.amount.replace(/,/g, ''));
    if (Number.isFinite(n)) amount = n;
  }
  let vat: number | undefined;
  if (typeof body.vat === 'number' && Number.isFinite(body.vat)) {
    vat = body.vat;
  } else if (typeof body.vat === 'string') {
    const n = parseFloat(body.vat.replace(/,/g, ''));
    if (Number.isFinite(n)) vat = n;
  }
  let expense_date = today;
  if (typeof body.expense_date === 'string' && body.expense_date.trim()) {
    const d = body.expense_date.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) expense_date = d;
    else {
      const il = d.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
      if (il) {
        const [, day, month, year] = il;
        const y = (year?.length ?? 0) === 2 ? `20${year}` : year ?? '';
        expense_date = `${y}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
      }
    }
  }
  const vendor_id =
    typeof body.vendor_id === 'string' && body.vendor_id.trim()
      ? body.vendor_id.trim()
      : undefined;
  return {
    supplier_name,
    amount,
    vat,
    expense_date,
    ...(vendor_id ? { vendor_id } : {}),
  };
}

/** Safe default when extraction fails entirely. */
function defaultExtractedExpense(filename: string): ExtractedExpense {
  const base = filename.replace(/\.[^/.]+$/, '').slice(0, 80) || 'קובץ';
  return {
    supplier_name: base,
    amount: undefined,
    vat: undefined,
    expense_date: new Date().toISOString().slice(0, 10),
  };
}

/** Call Edge Function with timeout to avoid hanging. */
const VISION_TIMEOUT_MS = 60_000;

function invokeVisionWithTimeout(payload: { imageBase64: string; mimeType: string }): Promise<{ data: unknown; error: unknown }> {
  const invokePromise = supabase.functions.invoke(EXTRACT_VISION_FUNCTION, { body: payload });
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Vision timeout')), VISION_TIMEOUT_MS)
  );
  return Promise.race([invokePromise, timeoutPromise]);
}

/**
 * Single extraction interface: try Vision first for images, then fall back to OCR.
 * Never throws: on any failure returns a safe default or OCR result.
 */
export async function extractInvoiceData(file: File): Promise<ExtractedExpense> {
  const tryVision = isImageType(file.type);
  if (tryVision) {
    try {
      const { data, mimeType } = await fileToBase64(file);
      const { data: result, error } = await invokeVisionWithTimeout({ imageBase64: data, mimeType });
      if (!error && result && typeof result === 'object' && !('error' in result)) {
        try {
          return normalizeVisionResponse(result as Record<string, unknown>, file.name);
        } catch {
          void file;
        }
      } else {
        const errBody = result && typeof result === 'object' && 'error' in result ? (result as { error?: string; hint?: string }).error : error;
        const code = result && typeof result === 'object' && 'code' in result ? (result as { code?: string }).code : undefined;
        void { file: file.name, errBody, code, result };
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      void { file, err };
    }
  }

  try {
    return await processFile(file);
  } catch {
    return defaultExtractedExpense(file.name);
  }
}
