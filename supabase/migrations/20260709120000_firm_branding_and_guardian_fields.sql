-- Firm branding: logo for firm-type accounts, distinct from an individual
-- user's personal avatar (which lives in auth.users.user_metadata, not here).
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Firm users can update their own firm's row (name/contact/logo). Firms have
-- no owner-vs-member distinction today, so any user with role 'firm' in a
-- given firm can manage that firm's shared branding - matches how firm
-- membership already works elsewhere (e.g. viewing the firm row).
CREATE POLICY "Firm users can update their own firm" ON public.firms
FOR UPDATE TO authenticated
USING (id IN (SELECT profiles.firm_id FROM public.profiles WHERE profiles.user_id = auth.uid()) AND has_role(auth.uid(), 'firm'::app_role))
WITH CHECK (id IN (SELECT profiles.firm_id FROM public.profiles WHERE profiles.user_id = auth.uid()) AND has_role(auth.uid(), 'firm'::app_role));

-- Public bucket for firm logos (public-read like avatars; RLS restricts writes
-- to members of the owning firm, scoped by a {firm_id}/... path prefix).
INSERT INTO storage.buckets (id, name, public)
VALUES ('firm-logos', 'firm-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Firm logos are publicly accessible" ON storage.objects
FOR SELECT
USING (bucket_id = 'firm-logos');

CREATE POLICY "Firm users can upload their own firm logo" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'firm-logos'
    AND (storage.foldername(name))[1] = public.get_user_firm_id(auth.uid())::text
    AND has_role(auth.uid(), 'firm'::app_role)
);

CREATE POLICY "Firm users can update their own firm logo" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'firm-logos'
    AND (storage.foldername(name))[1] = public.get_user_firm_id(auth.uid())::text
    AND has_role(auth.uid(), 'firm'::app_role)
);

CREATE POLICY "Firm users can delete their own firm logo" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'firm-logos'
    AND (storage.foldername(name))[1] = public.get_user_firm_id(auth.uid())::text
    AND has_role(auth.uid(), 'firm'::app_role)
);

-- Guardian relation for legal drafting (e.g. "S/O John Doe" in petitioner
-- details). A single relation code + free-text name, matching standard
-- Indian court-filing convention, rather than separate father/mother/
-- guardian columns.
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS guardian_relation TEXT
    CHECK (guardian_relation IS NULL OR guardian_relation IN ('S/O', 'D/O', 'W/O', 'C/O'));
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS guardian_name TEXT;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS guardian_relation TEXT
    CHECK (guardian_relation IS NULL OR guardian_relation IN ('S/O', 'D/O', 'W/O', 'C/O'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS guardian_name TEXT;
