
-- Fix function search paths for security
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id)
    VALUES (NEW.id);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'individual');
    
    INSERT INTO public.notification_preferences (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add missing tables referenced in code

-- Create user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create case_notifications table
CREATE TABLE IF NOT EXISTS public.case_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create opponents table
CREATE TABLE IF NOT EXISTS public.opponents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    advocate TEXT,
    contact TEXT,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add missing columns to documents table
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS hearing_id UUID REFERENCES public.hearings(id) ON DELETE SET NULL;

-- Add missing columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contact_info JSONB DEFAULT '{}';

-- Add missing columns to prospects table
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Update case_precedents table to match expected structure
ALTER TABLE public.case_precedents ADD COLUMN IF NOT EXISTS precedent_title TEXT;
ALTER TABLE public.case_precedents ADD COLUMN IF NOT EXISTS points TEXT;
ALTER TABLE public.case_precedents ADD COLUMN IF NOT EXISTS relevance_notes TEXT;

-- Enable RLS on new tables
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opponents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_settings
CREATE POLICY "Users can view their own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for case_notifications
CREATE POLICY "Users can view their own case notifications" ON public.case_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own case notifications" ON public.case_notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own case notifications" ON public.case_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own case notifications" ON public.case_notifications FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for opponents (based on case ownership)
CREATE POLICY "Users can view opponents of their cases" ON public.opponents FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = opponents.case_id AND cases.user_id = auth.uid())
);
CREATE POLICY "Users can insert opponents to their cases" ON public.opponents FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = opponents.case_id AND cases.user_id = auth.uid())
);
CREATE POLICY "Users can update opponents of their cases" ON public.opponents FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = opponents.case_id AND cases.user_id = auth.uid())
);
CREATE POLICY "Users can delete opponents of their cases" ON public.opponents FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = opponents.case_id AND cases.user_id = auth.uid())
);

-- Create triggers for new tables
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create notification reminder functions
CREATE OR REPLACE FUNCTION public.create_task_reminder_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Placeholder for task reminder notification logic
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hearing_reminder_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Placeholder for hearing reminder notification logic
    NULL;
END;
$$;
