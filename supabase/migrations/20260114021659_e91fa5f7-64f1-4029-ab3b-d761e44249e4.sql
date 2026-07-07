
-- Add missing columns to folders table
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS parent_folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS entity_id UUID;
