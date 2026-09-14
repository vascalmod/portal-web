-- Duplicate / reuse audit for vouchers (Supabase SQL editor, read-only).
-- Background: code is PRIMARY KEY so exact duplicates cannot exist, BUT the
-- PK is case-sensitive while the app normalizes to UPPER — case variants
-- (Guest-1 vs GUEST-1) are the real app-level duplicates. All queries below
-- only READ; nothing is modified.

-- 1) App-level duplicates: same code after UPPER() normalization.
-- Any row here = two vouchers the app treats as one code. Fix by keeping
-- one (rename/delete the other from the dashboard).
SELECT UPPER(code) AS normalized, COUNT(*) AS n,
       array_agg(code ORDER BY code) AS variants
FROM public.vouchers
GROUP BY 1
HAVING COUNT(*) > 1;

-- 2) Exact duplicates (PK forbids these — expect zero rows; proves it).
SELECT code, COUNT(*) AS n
FROM public.vouchers
GROUP BY code
HAVING COUNT(*) > 1;

-- 3) One device holding multiple vouchers (shared MAC across codes).
SELECT bound_mac, COUNT(*) AS n, array_agg(code ORDER BY code) AS codes
FROM public.vouchers
WHERE bound_mac IS NOT NULL
GROUP BY bound_mac
HAVING COUNT(*) > 1;

-- 4) Single-code lookup across vouchers + its rate and history.
-- Replace 'YOUR-CODE' (case-insensitive), run both:
SELECT code, state, total_secs, used_secs,
       (total_secs - used_secs) AS remaining_secs,
       bound_mac, last_ip, last_auth, created_at
FROM public.vouchers
WHERE UPPER(code) = UPPER('YOUR-CODE');

SELECT id, decision, reason, mac, remaining_secs, created_at
FROM public.events
WHERE UPPER(code) = UPPER('YOUR-CODE')
ORDER BY id DESC
LIMIT 20;

-- 5) Events for codes no longer in vouchers (history kept by design).
SELECT DISTINCT e.code
FROM public.events e
LEFT JOIN public.vouchers v ON v.code = e.code
WHERE v.code IS NULL
LIMIT 50;

-- 6) Vouchers never seen in events (created but never claimed/touched).
SELECT v.code, v.state, v.created_at
FROM public.vouchers v
LEFT JOIN public.events e ON e.code = v.code
WHERE e.code IS NULL
ORDER BY v.created_at DESC;
