-- Finance expenses: ensure schema (idempotent)
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- Prerequisite: finance_expenses table exists (from schema-clean.sql or bootstrap).

-- Add any missing columns (for existing tables from older migrations)
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS expense_date DATE;
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS vat DECIMAL(10, 2);
ALTER TABLE finance_expenses ADD COLUMN IF NOT EXISTS supplier_name TEXT;

-- Backfill vendor -> supplier_name
UPDATE finance_expenses SET supplier_name = vendor WHERE supplier_name IS NULL AND vendor IS NOT NULL;

-- Enable RLS if not already
ALTER TABLE finance_expenses ENABLE ROW LEVEL SECURITY;

-- RLS policies: drop and recreate so this migration is idempotent
DROP POLICY IF EXISTS "Users can read agency finance_expenses" ON finance_expenses;
CREATE POLICY "Users can read agency finance_expenses" ON finance_expenses
  FOR SELECT USING (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Finance roles can insert finance_expenses" ON finance_expenses;
CREATE POLICY "Finance roles can insert finance_expenses" ON finance_expenses
  FOR INSERT WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM public.users
      WHERE id = auth.uid() AND role IN ('owner','manager','finance')
    )
  );

DROP POLICY IF EXISTS "Finance roles can update finance_expenses" ON finance_expenses;
CREATE POLICY "Finance roles can update finance_expenses" ON finance_expenses
  FOR UPDATE USING (
    agency_id IN (
      SELECT agency_id FROM public.users
      WHERE id = auth.uid() AND role IN ('owner','manager','finance')
    )
  );

DROP POLICY IF EXISTS "Finance roles can delete finance_expenses" ON finance_expenses;
CREATE POLICY "Finance roles can delete finance_expenses" ON finance_expenses
  FOR DELETE USING (
    agency_id IN (
      SELECT agency_id FROM public.users
      WHERE id = auth.uid() AND role IN ('owner','manager','finance')
    )
  );

-- Storage bucket "expenses" (create if missing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expenses', 'expenses', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for expenses bucket
DROP POLICY IF EXISTS "Agency members can read expenses files" ON storage.objects;
CREATE POLICY "Agency members can read expenses files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Finance roles can upload expenses files" ON storage.objects;
CREATE POLICY "Finance roles can upload expenses files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );

DROP POLICY IF EXISTS "Finance roles can delete expenses files" ON storage.objects;
CREATE POLICY "Finance roles can delete expenses files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );
