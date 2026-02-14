/**
 * OCR / extraction service for expenses.
 * - extractFromFilename: parses supplier, amount, date from filename (no API).
 * - extractFromText: parses from raw text (e.g. PDF text layer or OCR result).
 * - processFile: runs extraction (PDFs via pdfjs-dist; images use filename only).
 */

import * as pdfjsLib from 'pdfjs-dist';
// Vite: resolve worker so it's copied and served correctly
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

let workerReady = false;
function ensurePdfWorker(): void {
  if (workerReady || typeof window === 'undefined') return;
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
    }
    workerReady = true;
  } catch {
    workerReady = true;
  }
}

export type ExtractedExpense = {
  supplier_name: string;
  amount: number | undefined;
  vat: number | undefined;
  expense_date: string;
  /** Optional vendor ID (e.g. H.P. / ח.פ.) from invoice extraction */
  vendor_id?: string;
};

const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})/;
const IL_DATE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/;
const NIS_PATTERN = /(?:nis|₪|שקל|סכום|total|amount)\s*[:=]?\s*([\d,.\s]+)/gi;

function parseAmountFromText(text: string): number | undefined {
  const nis = NIS_PATTERN.exec(text);
  if (nis) {
    const numStr = nis[1].replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(numStr);
    if (Number.isFinite(n) && n < 1e7) return n;
  }
  const matches = [...text.matchAll(/(\d{1,6})(?:[.,](\d{1,2}))?/g)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const num = last[2] ? `${last[1]}.${last[2]}` : last[1];
    const n = parseFloat(num);
    if (Number.isFinite(n) && n < 1e7) return n;
  }
  return undefined;
}

function parseDateFromText(text: string): string {
  const iso = text.match(ISO_DATE);
  if (iso) return iso[0];
  const il = text.match(IL_DATE);
  if (il) {
    const [, d, m, y] = il;
    const year = (y?.length ?? 0) === 2 ? `20${y}` : y ?? '';
    return `${year}-${m?.padStart(2, '0')}-${d?.padStart(2, '0')}`;
  }
  return '';
}

/**
 * Extract expense metadata from filename only (no OCR).
 */
export function extractFromFilename(filename: string): ExtractedExpense {
  const base = filename.replace(/\.[^/.]+$/, '');
  const amount = parseAmountFromText(base);
  const expense_date = parseDateFromText(base);
  const vendor = base
    .replace(/(\d{1,6})(?:[.,](\d{1,2}))?/g, '')
    .replace(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/g, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return {
    supplier_name: vendor || base.slice(0, 50),
    amount,
    vat: undefined,
    expense_date: expense_date || new Date().toISOString().slice(0, 10),
  };
}

/**
 * Extract from raw text (e.g. OCR result from backend).
 */
export function extractFromText(text: string): ExtractedExpense {
  const amount = parseAmountFromText(text);
  const expense_date = parseDateFromText(text);
  const supplierMatch = text.match(/(?:supplier|ספק|vendor|שם\s*הספק|ח\.פ\.|ע\.מ\.)\s*[:=]?\s*([^\n\r\d]{2,60})/i);
  const supplier_name = supplierMatch ? supplierMatch[1].trim() : '';
  const vatMatch = text.match(/(?:vat|מע["']?מ|מס\s*ערך)\s*[:=]?\s*([\d,.\s]+)%?/i);
  const vat = vatMatch ? parseFloat(vatMatch[1].replace(',', '.')) : undefined;
  return {
    supplier_name: supplier_name || extractFromFilename('').supplier_name,
    amount,
    vat: Number.isFinite(vat) ? vat : undefined,
    expense_date: expense_date || new Date().toISOString().slice(0, 10),
  };
}

/**
 * Extract text from a PDF file using PDF.js (text layer only; not scanned images).
 */
async function extractTextFromPdf(file: File): Promise<string> {
  ensurePdfWorker();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = Math.min(pdf.numPages, 5);
  const parts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    parts.push(pageText);
  }
  return parts.join('\n');
}

/**
 * Process a file: extract from PDF text (via PDF.js), plain text, or filename.
 */
export async function processFile(file: File): Promise<ExtractedExpense> {
  const fromFilename = extractFromFilename(file.name);

  if (file.type === 'application/pdf') {
    try {
      const text = await extractTextFromPdf(file);
      if (text && text.trim().length > 10) {
        const fromText = extractFromText(text);
        return {
          supplier_name: fromText.supplier_name || fromFilename.supplier_name,
          amount: fromText.amount ?? fromFilename.amount,
          vat: fromText.vat ?? fromFilename.vat,
          expense_date: fromText.expense_date || fromFilename.expense_date,
        };
      }
    } catch {
      // fall back to filename-only
    }
  }

  if (file.type.startsWith('text/')) {
    try {
      const text = await file.text();
      if (text.length > 20) {
        const fromText = extractFromText(text);
        return {
          supplier_name: fromText.supplier_name || fromFilename.supplier_name,
          amount: fromText.amount ?? fromFilename.amount,
          vat: fromText.vat ?? fromFilename.vat,
          expense_date: fromText.expense_date || fromFilename.expense_date,
        };
      }
    } catch {
      // ignore
    }
  }

  return fromFilename;
}
