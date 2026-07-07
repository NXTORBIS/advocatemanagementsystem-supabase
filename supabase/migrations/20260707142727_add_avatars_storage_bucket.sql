
-- Public bucket for user profile photos (public so avatars display everywhere
-- without needing signed-URL refresh logic; RLS still restricts who can write).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy: Anyone can view avatars (bucket is public-read by design)
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars');

-- Policy: Users can upload their own avatar (path starts with their user ID)
CREATE POLICY "Users can upload own avatar" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can update their own avatar
CREATE POLICY "Users can update own avatar" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can delete their own avatar
CREATE POLICY "Users can delete own avatar" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
