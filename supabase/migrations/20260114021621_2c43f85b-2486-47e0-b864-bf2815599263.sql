
-- Add missing columns to hearings table
ALTER TABLE public.hearings ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.hearings ADD COLUMN IF NOT EXISTS previous_date DATE;
ALTER TABLE public.hearings ADD COLUMN IF NOT EXISTS case_number TEXT;
ALTER TABLE public.hearings ADD COLUMN IF NOT EXISTS court_complex TEXT;
ALTER TABLE public.hearings ADD COLUMN IF NOT EXISTS current_stage TEXT;

-- Add missing columns to case_notifications table
ALTER TABLE public.case_notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.case_notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.case_notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false;

-- Add type and size columns to documents (using different names if needed)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS size BIGINT;

-- Create case_timeline table
CREATE TABLE IF NOT EXISTS public.case_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on case_timeline
ALTER TABLE public.case_timeline ENABLE ROW LEVEL SECURITY;

-- RLS Policies for case_timeline
CREATE POLICY "Users can view timeline of their cases" ON public.case_timeline FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = case_timeline.case_id AND cases.user_id = auth.uid())
);
CREATE POLICY "Users can insert timeline to their cases" ON public.case_timeline FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = case_timeline.case_id AND cases.user_id = auth.uid())
);
CREATE POLICY "Users can delete timeline of their cases" ON public.case_timeline FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = case_timeline.case_id AND cases.user_id = auth.uid())
);

-- Add missing columns to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_cases INTEGER DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS documents_count INTEGER DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Create notification_delivery_logs table
CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    external_id TEXT,
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

-- RLS for notification_delivery_logs (only viewable by notification owner)
CREATE POLICY "Users can view their own delivery logs" ON public.notification_delivery_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.notifications WHERE notifications.id = notification_delivery_logs.notification_id AND notifications.user_id = auth.uid())
);

-- Add delivery_status and external_ids to notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS delivery_status JSONB DEFAULT '{}';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS external_ids JSONB DEFAULT '{}';
