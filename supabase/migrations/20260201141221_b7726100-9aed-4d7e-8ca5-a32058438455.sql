-- Drop existing profile policies that may conflict
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Firm users can view firm profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Firm users can update firm profiles" ON public.profiles;

-- Allow admins to view all profiles for user management
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow firm users to view profiles within their firm
CREATE POLICY "Firm users can view firm profiles" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'firm'::app_role) 
  AND firm_id IS NOT NULL 
  AND firm_id = get_user_firm_id(auth.uid())
);

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow firm users to update profiles within their firm
CREATE POLICY "Firm users can update firm profiles" 
ON public.profiles 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'firm'::app_role) 
  AND firm_id IS NOT NULL 
  AND firm_id = get_user_firm_id(auth.uid())
);

-- Allow admins to view all user roles for user management
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles" 
ON public.user_roles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update user roles
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
CREATE POLICY "Admins can update user roles" 
ON public.user_roles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert user roles (for creating new admin users)
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
CREATE POLICY "Admins can insert user roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));