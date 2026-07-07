
-- case_timeline UPDATE policy (owner via cases)
CREATE POLICY "Users can update timeline for their cases"
ON public.case_timeline
FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_timeline.case_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_timeline.case_id AND c.user_id = auth.uid()));

-- timeline_events UPDATE policy
CREATE POLICY "Users can update their own timeline events"
ON public.timeline_events
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- opponents: harden UPDATE with WITH CHECK so case_id can't be reassigned to another user's case
DROP POLICY IF EXISTS "Users can update opponents for their cases" ON public.opponents;
DROP POLICY IF EXISTS "Users can update their opponents" ON public.opponents;
CREATE POLICY "Users can update opponents for their cases"
ON public.opponents
FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = opponents.case_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = opponents.case_id AND c.user_id = auth.uid()));

-- Revoke public EXECUTE on SECURITY DEFINER functions that should only run from backend/triggers
REVOKE EXECUTE ON FUNCTION public.create_hearing_reminder_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_task_reminder_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
