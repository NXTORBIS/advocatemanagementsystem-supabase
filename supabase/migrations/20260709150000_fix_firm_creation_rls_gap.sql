-- Bug fix: firm-role signups have never actually worked. There is no RLS
-- INSERT policy on public.firms for a regular (non-admin) user, so the
-- client-side firm creation in AuthContext.tsx's createFirmForUser() has
-- always failed RLS on the very first insert - silently, because the error
-- was only console.error'd, never surfaced to the user. Even if that insert
-- had succeeded, the follow-up "profiles.firm_id = new firm.id" update would
-- also have been silently no-op'd (0 rows matched, no error surfaced) by the
-- "Users can update their own profile" policy, which explicitly blocks
-- self-modifying firm_id to prevent privilege escalation (deliberately, per
-- migration 20260311201959 - a real security fix, not to be relaxed).
--
-- Fix: a narrowly-scoped SECURITY DEFINER function that performs both steps
-- atomically, only for a user who does not already have a firm_id (so it can
-- only ever be used once, at signup - not as a way to hop between firms).
-- User-approved: bypasses the self-modify-firm_id RLS rule intentionally,
-- within this tightly scoped, single-use-only function.
CREATE OR REPLACE FUNCTION public.create_firm_for_user(_firm_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _firm_id UUID;
    _current_firm_id UUID;
BEGIN
    SELECT firm_id INTO _current_firm_id FROM public.profiles WHERE user_id = auth.uid();

    IF _current_firm_id IS NOT NULL THEN
        RAISE EXCEPTION 'User is already linked to a firm';
    END IF;

    IF _firm_name IS NULL OR trim(_firm_name) = '' THEN
        RAISE EXCEPTION 'Firm name is required';
    END IF;

    INSERT INTO public.firms (name, created_by)
    VALUES (trim(_firm_name), auth.uid())
    RETURNING id INTO _firm_id;

    UPDATE public.profiles SET firm_id = _firm_id WHERE user_id = auth.uid();

    RETURN _firm_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_firm_for_user(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_firm_for_user(TEXT) FROM PUBLIC, anon;
