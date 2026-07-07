-- Create firms table for firm management
CREATE TABLE IF NOT EXISTS public.firms (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on firms
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;

-- Add firm_id to profiles for firm association
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES public.firms(id);

-- Create audit_logs table for tracking admin actions
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for firms table

-- Admins can do everything with firms
CREATE POLICY "Admins can manage all firms"
ON public.firms FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Firm users can view their own firm
CREATE POLICY "Firm users can view their own firm"
ON public.firms FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT firm_id FROM public.profiles WHERE user_id = auth.uid()
    )
);

-- RLS Policies for audit_logs

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can insert audit logs
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Firm users can view audit logs for their firm's users
CREATE POLICY "Firm users can view their firm audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
    public.has_role(auth.uid(), 'firm') AND
    user_id IN (
        SELECT p.user_id FROM public.profiles p 
        WHERE p.firm_id = (SELECT firm_id FROM public.profiles WHERE user_id = auth.uid())
    )
);

-- Update trigger for firms
CREATE TRIGGER update_firms_updated_at
BEFORE UPDATE ON public.firms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Function to get user's firm_id
CREATE OR REPLACE FUNCTION public.get_user_firm_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT firm_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;