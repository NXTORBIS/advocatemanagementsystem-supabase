
-- Add missing columns to parties table
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Add missing columns to todos table
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS hearing_id UUID REFERENCES public.hearings(id) ON DELETE SET NULL;
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add missing columns to notifications table
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS date TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_id UUID;

-- Change points column type in case_precedents (store as JSONB for array)
ALTER TABLE public.case_precedents DROP COLUMN IF EXISTS points;
ALTER TABLE public.case_precedents ADD COLUMN IF NOT EXISTS points JSONB DEFAULT '[]';
