
-- Add missing columns to notification_preferences table
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS email BOOLEAN DEFAULT true;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS sms BOOLEAN DEFAULT true;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS whatsapp BOOLEAN DEFAULT false;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS document_notifications BOOLEAN DEFAULT true;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS payment_reminders BOOLEAN DEFAULT true;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS notification_timing TEXT DEFAULT '24h';
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS notification_priority TEXT DEFAULT 'medium';
