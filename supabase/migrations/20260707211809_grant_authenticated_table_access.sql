
-- The old Lovable-managed project had "Automatically expose new tables" enabled,
-- so Supabase silently granted API access to each table via a dashboard
-- side-effect that was never captured as SQL. This project was deliberately
-- created with that setting OFF (explicit access per table, safer default), so
-- these baseline grants never existed here - PostgREST rejects requests before
-- RLS is even evaluated without them. RLS policies remain the real row-level
-- security boundary; these grants only permit the authenticated role to attempt
-- the operation at all.
--
-- anon is intentionally NOT granted here: every table in this app requires
-- login (enforced by ProtectedRoute), so anonymous requests should keep being
-- rejected, exactly as verified during migration.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- Ensure this gap can't silently reappear the next time a migration adds a
-- table - future tables/sequences/functions get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;
