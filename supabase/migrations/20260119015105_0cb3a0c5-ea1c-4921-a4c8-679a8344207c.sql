-- Add summary column to cases table
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS summary TEXT;