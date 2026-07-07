
-- Fix privilege escalation: prevent users from changing their own firm_id
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id 
  AND firm_id IS NOT DISTINCT FROM (SELECT p.firm_id FROM public.profiles p WHERE p.user_id = auth.uid())
);
