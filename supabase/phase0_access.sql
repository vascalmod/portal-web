-- Phase 0 — dashboard database access (Supabase SQL editor, run top to bottom).
--
-- WHY: the Python backend connects as table owner (bypasses permission
-- checks) and the project runs with RLS off and no grants for anyone else,
-- so the dashboard's anon key currently has ZERO access. Without section 2,
-- every dashboard page reports "Database refused access."
--
-- Worker / Railway / EAP are untouched by this file.
-- All statements are idempotent (safe to re-run).
-- v1 is dev-only: a public URL with anon write access must not stay public.
-- Production upgrade = enable RLS + Supabase Auth (outline in section 4).

-- =====================================================================
-- Section 1 — INSPECT (run first, keep the output)
-- Expected: rls_on = false on both tables, no policy rows, no anon rows.
-- =====================================================================

SELECT relname, relrowsecurity AS rls_on
FROM pg_class
WHERE relname IN ('vouchers', 'events');

SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN ('vouchers', 'events');

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('vouchers', 'events')
  AND grantee IN ('anon', 'authenticated');

-- =====================================================================
-- Section 2 — APPLY v1 access (only if section 1 shows RLS off
-- and no anon grants, which is the expected state)
-- =====================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO anon;
GRANT SELECT ON public.events TO anon;

-- =====================================================================
-- Section 3 — VERIFY (run after section 2)
-- =====================================================================

-- anon can now read both tables (empty result is fine; errors are not):
SELECT count(*) AS vouchers_visible FROM public.vouchers;
SELECT count(*) AS events_visible FROM public.events;

-- =====================================================================
-- Section 4 — PRODUCTION UPGRADE PATH (later, NOT v1)
-- Enable RLS, add Supabase Auth, and replace the grants above with
-- authenticated-admin-only policies, e.g.:
--
--   ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "admin full" ON public.vouchers FOR ALL TO authenticated
--     USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
--   CREATE POLICY "admin read" ON public.events FOR SELECT TO authenticated
--     USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
--   REVOKE ALL ON public.vouchers FROM anon;
--   REVOKE ALL ON public.events FROM anon;
--
-- The dashboard code is already structured for this (useAdminUser hook).
-- =====================================================================

-- =====================================================================
-- ROLLBACK (only if v1 access must be revoked before the RLS upgrade)
-- =====================================================================
-- REVOKE ALL ON public.vouchers FROM anon;
-- REVOKE ALL ON public.events FROM anon;
