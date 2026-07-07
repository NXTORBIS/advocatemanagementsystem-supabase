
-- Add missing columns to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone_mobile TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone_home TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone_office TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address_zip_code TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_paid DECIMAL DEFAULT 0;

-- Add missing columns to prospects table
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS phone_mobile TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS phone_home TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS phone_office TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS address_street TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS address_city TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS address_state TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS address_zip_code TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS date_of_birth DATE;
