-- Storage bucket for backup snapshots (storage-first backup system)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('backups', 'backups', false)
  ON CONFLICT (id) DO NOTHING;

-- RLS: Agency members can read/write their own agency's backups
CREATE POLICY "Agency members can read backups" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'backups'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Agency members can upload backups" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'backups'
    AND split_part(name, '/', 1) IN (SELECT agency_id::text FROM public.users WHERE id = auth.uid())
  );
