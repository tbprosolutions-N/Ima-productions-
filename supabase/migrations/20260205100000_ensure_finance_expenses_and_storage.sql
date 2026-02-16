-- Ensure finance_expenses has all columns required for Save-and-show-after-upload flow.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT).
-- Run in Supabase SQL Editor if not using CLI migrations.

-- 1) Table columns (for projects that created finance_expenses before full schema)
ALTER TABLE finance_expenses
  ADD COLUMN IF NOT EXISTS vendor TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS amount DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS vat DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS expense_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS morning_status VARCHAR(20) DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS morning_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Backfill supplier_name from vendor if needed
UPDATE finance_expenses SET supplier_name = vendor WHERE supplier_name IS NULL AND vendor IS NOT NULL;

-- 2) Storage bucket (create if missing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expenses', 'expenses', false)
ON CONFLICT (id) DO NOTHING;

-- 3) RLS on finance_expenses (drop and recreate so this migration is idempotent; skip if you already have policies)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_expenses' AND policyname = 'Users can read agency finance_expenses') THEN
    CREATE POLICY "Users can read agency finance_expenses" ON finance_expenses
      FOR SELECT USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_expenses' AND policyname = 'Finance roles can insert finance_expenses') THEN
    CREATE POLICY "Finance roles can insert finance_expenses" ON finance_expenses
      FOR INSERT WITH CHECK (
        agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid() AND role IN ('owner','manager','finance'))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_expenses' AND policyname = 'Finance roles can update finance_expenses') THEN
    CREATE POLICY "Finance roles can update finance_expenses" ON finance_expenses
      FOR UPDATE USING (
        agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid() AND role IN ('owner','manager','finance'))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finance_expenses' AND policyname = 'Finance roles can delete finance_expenses') THEN
    CREATE POLICY "Finance roles can delete finance_expenses" ON finance_expenses
      FOR DELETE USING (
        agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid() AND role IN ('owner','manager','finance'))
      );
  END IF;
END $$;

-- 4) Storage policies for bucket 'expenses' (path: agencyId/expenseId/filename)
-- Drop existing if present so we can recreate (avoids duplicate policy errors in some setups)
DROP POLICY IF EXISTS "Agency members can read expenses files" ON storage.objects;
DROP POLICY IF EXISTS "Finance roles can upload expenses files" ON storage.objects;
DROP POLICY IF EXISTS "Finance roles can delete expenses files" ON storage.objects;

CREATE POLICY "Agency members can read expenses files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Finance roles can upload expenses files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );

CREATE POLICY "Finance roles can delete expenses files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'expenses'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('owner','manager','finance')
  );

NOTIFY pgrst, 'reload schema';
