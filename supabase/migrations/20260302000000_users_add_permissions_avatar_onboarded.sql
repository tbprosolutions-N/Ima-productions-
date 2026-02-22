-- Add optional User columns referenced by the app (TypeScript User type).
-- Required for AuthContext profile fetch when using specific column select.
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avatar_url   text,
  ADD COLUMN IF NOT EXISTS onboarded    boolean DEFAULT false;

COMMENT ON COLUMN public.users.permissions IS 'Fine-grained permissions (finance, users, integrations, etc.)';
COMMENT ON COLUMN public.users.avatar_url   IS 'Profile avatar URL';
COMMENT ON COLUMN public.users.onboarded    IS 'Whether user has completed onboarding';
