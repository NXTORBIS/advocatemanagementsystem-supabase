
-- ============================================================
-- 1. CONVERT ALL 89 RESTRICTIVE RLS POLICIES TO PERMISSIVE
-- ============================================================

-- ai_messages (2 policies)
DROP POLICY IF EXISTS "Users can create their own messages" ON public.ai_messages;
CREATE POLICY "Users can create their own messages" ON public.ai_messages FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own messages" ON public.ai_messages;
CREATE POLICY "Users can view their own messages" ON public.ai_messages FOR SELECT TO public USING (auth.uid() = user_id);

-- activities (2 policies)
DROP POLICY IF EXISTS "Users can insert their own activities" ON public.activities;
CREATE POLICY "Users can insert their own activities" ON public.activities FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own activities" ON public.activities;
CREATE POLICY "Users can view their own activities" ON public.activities FOR SELECT TO public USING (auth.uid() = user_id);

-- notification_preferences (3 policies)
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert their own preferences" ON public.notification_preferences FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can update their own preferences" ON public.notification_preferences FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can view their own preferences" ON public.notification_preferences FOR SELECT TO public USING (auth.uid() = user_id);

-- folders (4 policies)
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;
CREATE POLICY "Users can delete their own folders" ON public.folders FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own folders" ON public.folders;
CREATE POLICY "Users can insert their own folders" ON public.folders FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
CREATE POLICY "Users can update their own folders" ON public.folders FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
CREATE POLICY "Users can view their own folders" ON public.folders FOR SELECT TO public USING (auth.uid() = user_id);

-- opponents (4 policies)
DROP POLICY IF EXISTS "Users can delete opponents of their cases" ON public.opponents;
CREATE POLICY "Users can delete opponents of their cases" ON public.opponents FOR DELETE TO public USING (EXISTS (SELECT 1 FROM cases WHERE cases.id = opponents.case_id AND cases.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert opponents to their cases" ON public.opponents;
CREATE POLICY "Users can insert opponents to their cases" ON public.opponents FOR INSERT TO public WITH CHECK (EXISTS (SELECT 1 FROM cases WHERE cases.id = opponents.case_id AND cases.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update opponents of their cases" ON public.opponents;
CREATE POLICY "Users can update opponents of their cases" ON public.opponents FOR UPDATE TO public USING (EXISTS (SELECT 1 FROM cases WHERE cases.id = opponents.case_id AND cases.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view opponents of their cases" ON public.opponents;
CREATE POLICY "Users can view opponents of their cases" ON public.opponents FOR SELECT TO public USING (EXISTS (SELECT 1 FROM cases WHERE cases.id = opponents.case_id AND cases.user_id = auth.uid()));

-- ai_case_notes (4 policies)
DROP POLICY IF EXISTS "Users can create their own AI notes" ON public.ai_case_notes;
CREATE POLICY "Users can create their own AI notes" ON public.ai_case_notes FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own AI notes" ON public.ai_case_notes;
CREATE POLICY "Users can delete their own AI notes" ON public.ai_case_notes FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own AI notes" ON public.ai_case_notes;
CREATE POLICY "Users can update their own AI notes" ON public.ai_case_notes FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own AI notes" ON public.ai_case_notes;
CREATE POLICY "Users can view their own AI notes" ON public.ai_case_notes FOR SELECT TO public USING (auth.uid() = user_id);

-- cases (4 policies)
DROP POLICY IF EXISTS "Users can delete their own cases" ON public.cases;
CREATE POLICY "Users can delete their own cases" ON public.cases FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own cases" ON public.cases;
CREATE POLICY "Users can insert their own cases" ON public.cases FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own cases" ON public.cases;
CREATE POLICY "Users can update their own cases" ON public.cases FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own cases" ON public.cases;
CREATE POLICY "Users can view their own cases" ON public.cases FOR SELECT TO public USING (auth.uid() = user_id);

-- case_notifications (4 policies)
DROP POLICY IF EXISTS "Users can delete their own case notifications" ON public.case_notifications;
CREATE POLICY "Users can delete their own case notifications" ON public.case_notifications FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own case notifications" ON public.case_notifications;
CREATE POLICY "Users can insert their own case notifications" ON public.case_notifications FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own case notifications" ON public.case_notifications;
CREATE POLICY "Users can update their own case notifications" ON public.case_notifications FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own case notifications" ON public.case_notifications;
CREATE POLICY "Users can view their own case notifications" ON public.case_notifications FOR SELECT TO public USING (auth.uid() = user_id);

-- todos (4 policies)
DROP POLICY IF EXISTS "Users can delete their own todos" ON public.todos;
CREATE POLICY "Users can delete their own todos" ON public.todos FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own todos" ON public.todos;
CREATE POLICY "Users can insert their own todos" ON public.todos FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own todos" ON public.todos;
CREATE POLICY "Users can update their own todos" ON public.todos FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own todos" ON public.todos;
CREATE POLICY "Users can view their own todos" ON public.todos FOR SELECT TO public USING (auth.uid() = user_id);

-- parties (4 policies)
DROP POLICY IF EXISTS "Users can delete parties of their cases" ON public.parties;
CREATE POLICY "Users can delete parties of their cases" ON public.parties FOR DELETE TO public USING (EXISTS (SELECT 1 FROM cases WHERE cases.id = parties.case_id AND cases.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert parties to their cases" ON public.parties;
CREATE POLICY "Users can insert parties to their cases" ON public.parties FOR INSERT TO public WITH CHECK (EXISTS (SELECT 1 FROM cases WHERE cases.id = parties.case_id AND cases.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update parties of their cases" ON public.parties;
CREATE POLICY "Users can update parties of their cases" ON public.parties FOR UPDATE TO public USING (EXISTS (SELECT 1 FROM cases WHERE cases.id = parties.case_id AND cases.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view parties of their cases" ON public.parties;
CREATE POLICY "Users can view parties of their cases" ON public.parties FOR SELECT TO public USING (EXISTS (SELECT 1 FROM cases WHERE cases.id = parties.case_id AND cases.user_id = auth.uid()));

-- audit_logs (3 policies)
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Firm users can view their firm audit logs" ON public.audit_logs;
CREATE POLICY "Firm users can view their firm audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'firm'::app_role) AND user_id IN (SELECT p.user_id FROM profiles p WHERE p.firm_id = (SELECT profiles.firm_id FROM profiles WHERE profiles.user_id = auth.uid())));

-- case_precedents (4 policies)
DROP POLICY IF EXISTS "Users can delete their own precedents" ON public.case_precedents;
CREATE POLICY "Users can delete their own precedents" ON public.case_precedents FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own precedents" ON public.case_precedents;
CREATE POLICY "Users can insert their own precedents" ON public.case_precedents FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own precedents" ON public.case_precedents;
CREATE POLICY "Users can update their own precedents" ON public.case_precedents FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own precedents" ON public.case_precedents;
CREATE POLICY "Users can view their own precedents" ON public.case_precedents FOR SELECT TO public USING (auth.uid() = user_id);

-- documents (4 policies)
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
CREATE POLICY "Users can delete their own documents" ON public.documents FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own documents" ON public.documents;
CREATE POLICY "Users can insert their own documents" ON public.documents FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
CREATE POLICY "Users can update their own documents" ON public.documents FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
CREATE POLICY "Users can view their own documents" ON public.documents FOR SELECT TO public USING (auth.uid() = user_id);

-- user_settings (3 policies)
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
CREATE POLICY "Users can insert their own settings" ON public.user_settings FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
CREATE POLICY "Users can update their own settings" ON public.user_settings FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
CREATE POLICY "Users can view their own settings" ON public.user_settings FOR SELECT TO public USING (auth.uid() = user_id);

-- hearings (4 policies)
DROP POLICY IF EXISTS "Users can delete their own hearings" ON public.hearings;
CREATE POLICY "Users can delete their own hearings" ON public.hearings FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own hearings" ON public.hearings;
CREATE POLICY "Users can insert their own hearings" ON public.hearings FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own hearings" ON public.hearings;
CREATE POLICY "Users can update their own hearings" ON public.hearings FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own hearings" ON public.hearings;
CREATE POLICY "Users can view their own hearings" ON public.hearings FOR SELECT TO public USING (auth.uid() = user_id);

-- notification_delivery_logs (1 policy)
DROP POLICY IF EXISTS "Users can view their own delivery logs" ON public.notification_delivery_logs;
CREATE POLICY "Users can view their own delivery logs" ON public.notification_delivery_logs FOR SELECT TO public USING (EXISTS (SELECT 1 FROM notifications WHERE notifications.id = notification_delivery_logs.notification_id AND notifications.user_id = auth.uid()));

-- prospects (4 policies)
DROP POLICY IF EXISTS "Users can delete their own prospects" ON public.prospects;
CREATE POLICY "Users can delete their own prospects" ON public.prospects FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own prospects" ON public.prospects;
CREATE POLICY "Users can insert their own prospects" ON public.prospects FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own prospects" ON public.prospects;
CREATE POLICY "Users can update their own prospects" ON public.prospects FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own prospects" ON public.prospects;
CREATE POLICY "Users can view their own prospects" ON public.prospects FOR SELECT TO public USING (auth.uid() = user_id);

-- user_roles (4 policies)
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
CREATE POLICY "Admins can insert user roles" ON public.user_roles FOR INSERT TO public WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
CREATE POLICY "Admins can update user roles" ON public.user_roles FOR UPDATE TO public USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles" ON public.user_roles FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO public USING (auth.uid() = user_id);

-- ai_conversations (4 policies)
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.ai_conversations;
CREATE POLICY "Users can create their own conversations" ON public.ai_conversations FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.ai_conversations;
CREATE POLICY "Users can delete their own conversations" ON public.ai_conversations FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.ai_conversations;
CREATE POLICY "Users can update their own conversations" ON public.ai_conversations FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.ai_conversations;
CREATE POLICY "Users can view their own conversations" ON public.ai_conversations FOR SELECT TO public USING (auth.uid() = user_id);

-- case_timeline (3 policies)
DROP POLICY IF EXISTS "Users can delete timeline of their cases" ON public.case_timeline;
CREATE POLICY "Users can delete timeline of their cases" ON public.case_timeline FOR DELETE TO public USING (EXISTS (SELECT 1 FROM cases WHERE cases.id = case_timeline.case_id AND cases.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert timeline to their cases" ON public.case_timeline;
CREATE POLICY "Users can insert timeline to their cases" ON public.case_timeline FOR INSERT TO public WITH CHECK (EXISTS (SELECT 1 FROM cases WHERE cases.id = case_timeline.case_id AND cases.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view timeline of their cases" ON public.case_timeline;
CREATE POLICY "Users can view timeline of their cases" ON public.case_timeline FOR SELECT TO public USING (EXISTS (SELECT 1 FROM cases WHERE cases.id = case_timeline.case_id AND cases.user_id = auth.uid()));

-- clients (4 policies)
DROP POLICY IF EXISTS "Users can delete their own clients" ON public.clients;
CREATE POLICY "Users can delete their own clients" ON public.clients FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own clients" ON public.clients;
CREATE POLICY "Users can insert their own clients" ON public.clients FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own clients" ON public.clients;
CREATE POLICY "Users can update their own clients" ON public.clients FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
CREATE POLICY "Users can view their own clients" ON public.clients FOR SELECT TO public USING (auth.uid() = user_id);

-- notifications (4 policies)
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own notifications" ON public.notifications;
CREATE POLICY "Users can insert their own notifications" ON public.notifications FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO public USING (auth.uid() = user_id);

-- profiles (7 policies)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO public USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO public USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Firm users can update firm profiles" ON public.profiles;
CREATE POLICY "Firm users can update firm profiles" ON public.profiles FOR UPDATE TO public USING (has_role(auth.uid(), 'firm'::app_role) AND firm_id IS NOT NULL AND firm_id = get_user_firm_id(auth.uid()));
DROP POLICY IF EXISTS "Firm users can view firm profiles" ON public.profiles;
CREATE POLICY "Firm users can view firm profiles" ON public.profiles FOR SELECT TO public USING (has_role(auth.uid(), 'firm'::app_role) AND firm_id IS NOT NULL AND firm_id = get_user_firm_id(auth.uid()));
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO public WITH CHECK (auth.uid() = user_id AND firm_id IS NULL);
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO public USING (auth.uid() = user_id);

-- 2. FIX PRIVILEGE ESCALATION: Prevent user_role/user_type self-modification
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO public
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND NOT (firm_id IS DISTINCT FROM (SELECT p.firm_id FROM profiles p WHERE p.user_id = auth.uid()))
    AND NOT (user_role IS DISTINCT FROM (SELECT p.user_role FROM profiles p WHERE p.user_id = auth.uid()))
    AND NOT (user_type IS DISTINCT FROM (SELECT p.user_type FROM profiles p WHERE p.user_id = auth.uid()))
  );

-- firms (2 policies)
DROP POLICY IF EXISTS "Admins can manage all firms" ON public.firms;
CREATE POLICY "Admins can manage all firms" ON public.firms FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Firm users can view their own firm" ON public.firms;
CREATE POLICY "Firm users can view their own firm" ON public.firms FOR SELECT TO authenticated USING (id IN (SELECT profiles.firm_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- timeline_events (3 policies)
DROP POLICY IF EXISTS "Users can delete their own timeline" ON public.timeline_events;
CREATE POLICY "Users can delete their own timeline" ON public.timeline_events FOR DELETE TO public USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own timeline" ON public.timeline_events;
CREATE POLICY "Users can insert their own timeline" ON public.timeline_events FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view their own timeline" ON public.timeline_events;
CREATE POLICY "Users can view their own timeline" ON public.timeline_events FOR SELECT TO public USING (auth.uid() = user_id);

-- ============================================================
-- 3. ADD ADMIN CHECKS TO SECURITY DEFINER PLACEHOLDER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_task_reminder_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Unauthorized: Admin role required';
    END IF;
    -- Placeholder for task reminder notification logic
    NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_hearing_reminder_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Unauthorized: Admin role required';
    END IF;
    -- Placeholder for hearing reminder notification logic
    NULL;
END;
$function$;
