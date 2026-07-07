-- Add UNIQUE constraint on profiles.user_id to prevent multiple profile rows per user
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);

-- Drop the existing INSERT policy that allows arbitrary firm_id
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Re-create INSERT policy that forces firm_id to be NULL on self-insert
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = user_id
  AND firm_id IS NULL
);