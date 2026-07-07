
-- Make the storage bucket private and add RLS policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('AdvMgmtSys', 'AdvMgmtSys', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Policy: Users can upload their own files (path starts with their user ID)
CREATE POLICY "Users can upload own files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'AdvMgmtSys' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can view their own files
CREATE POLICY "Users can view own files" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'AdvMgmtSys' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'AdvMgmtSys' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can update their own files
CREATE POLICY "Users can update own files" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'AdvMgmtSys' AND auth.uid()::text = (storage.foldername(name))[1]);
