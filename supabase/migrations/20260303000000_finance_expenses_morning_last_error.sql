-- Add morning_last_error to finance_expenses for auditable structured error logging.
-- Stores JSON: { "code": 123, "message": "...", "raw": "..." } or fallback { "message": "..." }

ALTER TABLE public.finance_expenses
  ADD COLUMN IF NOT EXISTS morning_last_error text;

COMMENT ON COLUMN public.finance_expenses.morning_last_error IS 'Last Morning sync error (JSON: code, message, raw) for audit';
