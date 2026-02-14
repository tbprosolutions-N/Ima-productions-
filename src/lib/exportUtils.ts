import * as XLSX from 'xlsx';
import type { Event } from '@/types';
import { formatDate } from '@/lib/utils';

export const exportEventsToExcel = (events: Event[], filename: string = 'events') => {
  // Prepare data for export
  const exportData = events.map(event => ({
    'תאריך': formatDate(event.event_date),
    'יום': event.weekday,
    'שם עסק': event.business_name,
    'שם בחשבונית': event.invoice_name,
    'סכום': event.amount,
    'סוג מסמך': event.doc_type === 'tax_invoice' ? 'חשבונית מס' : event.doc_type === 'receipt' ? 'קבלה' : 'חשבון עסקה',
    'מספר מסמך': event.doc_number || '',
    'תאריך תשלום': event.due_date ? formatDate(event.due_date) : '',
    'סטטוס': getStatusLabel(event.status),
    'הערות': event.notes || '',
  }));

  // Create workbook
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'אירועים');

  // Set column widths
  const colWidths = [
    { wch: 15 }, // תאריך
    { wch: 12 }, // יום
    { wch: 25 }, // שם עסק
    { wch: 25 }, // שם בחשבונית
    { wch: 12 }, // סכום
    { wch: 15 }, // סוג מסמך
    { wch: 15 }, // מספר מסמך
    { wch: 15 }, // תאריך תשלום
    { wch: 12 }, // סטטוס
    { wch: 30 }, // הערות
  ];
  ws['!cols'] = colWidths;

  // Generate file
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export function exportJsonToExcel(args: {
  data: Record<string, any>[];
  filename: string;
  sheetName?: string;
  colWidths?: number[]; // widths in "wch"
}) {
  const ws = XLSX.utils.json_to_sheet(args.data || []);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, args.sheetName || 'Report');
  if (args.colWidths && args.colWidths.length > 0) {
    ws['!cols'] = args.colWidths.map((wch) => ({ wch }));
  }
  XLSX.writeFile(wb, `${args.filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportJsonToCSV(args: {
  data: Record<string, any>[];
  filename: string;
}) {
  const rows = args.data || [];
  const keysSet = rows.reduce((s: Set<string>, r: Record<string, any>) => {
    Object.keys(r || {}).forEach((k) => s.add(k));
    return s;
  }, new Set<string>());
  const keys = Array.from(keysSet.values());
  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [keys.map(escape).join(','), ...rows.map((r) => keys.map((k) => escape(r?.[k])).join(','))].join('\n');

  // Add BOM for Excel UTF-8 support
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${args.filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    draft: 'טיוטה',
    pending: 'ממתין',
    approved: 'מאושר',
    paid: 'שולם',
    cancelled: 'בוטל',
  };
  return statusMap[status] || status;
};

export const exportToCSV = (events: Event[], filename: string = 'events') => {
  const headers = ['תאריך', 'יום', 'שם עסק', 'שם בחשבונית', 'סכום', 'סוג מסמך', 'מספר מסמך', 'תאריך תשלום', 'סטטוס', 'הערות'];
  
  const rows = events.map(event => [
    formatDate(event.event_date),
    event.weekday,
    event.business_name,
    event.invoice_name,
    event.amount.toString(),
    event.doc_type === 'tax_invoice' ? 'חשבונית מס' : event.doc_type === 'receipt' ? 'קבלה' : 'חשבון עסקה',
    event.doc_number || '',
    event.due_date ? formatDate(event.due_date) : '',
    getStatusLabel(event.status),
    event.notes || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  // Add BOM for Excel UTF-8 support
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
