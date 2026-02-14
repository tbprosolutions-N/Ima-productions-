-- Add OCR/extraction fields to finance_expenses for full expense flow
-- Run in Supabase SQL Editor if not using Supabase CLI migrations

ALTER TABLE finance_expenses
  ADD COLUMN IF NOT EXISTS expense_date DATE,
  ADD COLUMN IF NOT EXISTS vat DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS supplier_name TEXT;

-- Backfill: vendor -> supplier_name for consistency
UPDATE finance_expenses SET supplier_name = vendor WHERE supplier_name IS NULL AND vendor IS NOT NULL;

COMMENT ON COLUMN finance_expenses.expense_date IS 'Date on the receipt/invoice';
COMMENT ON COLUMN finance_expenses.vat IS 'VAT amount or rate as needed';
COMMENT ON COLUMN finance_expenses.supplier_name IS 'Extracted or manual supplier name (vendor alias)';
