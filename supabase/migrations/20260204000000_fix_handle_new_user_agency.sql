-- Fix "Database error saving new user": ensure default agency exists before creating user.
-- The trigger handle_new_user() fails when agencies table is empty (agency_id becomes NULL).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  resolved_agency_id UUID;
BEGIN
  -- Get existing IMA agency (by type or company_id for IMA001)
  SELECT id INTO resolved_agency_id
  FROM public.agencies
  WHERE type = 'ima' OR company_id = 'IMA001'
  LIMIT 1;

  -- If no agency exists (e.g. fresh project), create default so signup can succeed
  IF resolved_agency_id IS NULL THEN
    INSERT INTO public.agencies (name, type, company_id, settings)
    VALUES (
      'IMA Productions',
      'ima',
      'IMA001',
      '{"currency":"ILS","timezone":"Asia/Jerusalem"}'::jsonb
    )
    RETURNING id INTO resolved_agency_id;
  END IF;

  INSERT INTO public.users (id, email, full_name, role, agency_id, onboarded)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'producer'),
    resolved_agency_id,
    FALSE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger should already exist; ensure it uses the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
