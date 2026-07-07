
-- Update handle_new_user function to use role from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    user_role app_role;
BEGIN
    -- Get the role from user metadata, default to 'individual' if not set
    user_role := COALESCE(
        (NEW.raw_user_meta_data->>'role')::app_role,
        'individual'::app_role
    );
    
    -- Insert profile with first_name and last_name from metadata
    INSERT INTO public.profiles (user_id, first_name, last_name, user_role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        user_role
    );
    
    -- Insert user role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, user_role);
    
    -- Insert notification preferences
    INSERT INTO public.notification_preferences (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$function$;
