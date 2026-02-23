-- Automatic sync: enqueue sync_queue on events / finance_expenses INSERT or UPDATE.
-- Debounce: at most one pending/processing job per agency per 2 minutes.
-- Apply: npx supabase db push

CREATE OR REPLACE FUNCTION public.enqueue_auto_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Debounce: skip if this agency already has a pending/processing job in the last 2 minutes
  IF EXISTS (
    SELECT 1 FROM public.sync_queue
    WHERE agency_id = NEW.agency_id
      AND status IN ('pending', 'processing')
      AND created_at > now() - interval '2 minutes'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sync_queue (user_id, agency_id, data, status)
  VALUES (auth.uid(), NEW.agency_id, '{"action":"autoSync"}'::jsonb, 'pending');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_auto_sync_on_events ON public.events;
CREATE TRIGGER enqueue_auto_sync_on_events
  AFTER INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_auto_sync();

DROP TRIGGER IF EXISTS enqueue_auto_sync_on_finance_expenses ON public.finance_expenses;
CREATE TRIGGER enqueue_auto_sync_on_finance_expenses
  AFTER INSERT OR UPDATE ON public.finance_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_auto_sync();

COMMENT ON FUNCTION public.enqueue_auto_sync() IS 'Enqueues a sync_queue row with action autoSync when events or finance_expenses change; debounces to one job per agency per 2 minutes.';

