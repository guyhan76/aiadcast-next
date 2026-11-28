-- Run in the existing Supabase project's SQL Editor, not a new database.
-- Exact observed job second: 2026-10-24 20:39:10 KST = 11:39:10 UTC.
-- Read-only snapshot. No keys, emails, prompts, image bytes or raw usage returned.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SET LOCAL lock_timeout = '1000ms';
SELECT query_to_xml(format($q$
 SELECT g.id AS job_id, to_timestamp(g.created_at / 1000.0) AS created_at,
        g.error_code, j.status AS billing_status,
        (g.artifact_hash IS NOT NULL) AS artifact_hash_present,
        EXISTS(SELECT 1 FROM %1$I.generation_assets a WHERE a.hash=g.artifact_hash) AS artifact_record_present,
        (g.metadata_json::jsonb->'usage' IS NOT NULL AND g.metadata_json::jsonb->'usage' <> 'null'::jsonb) AS usage_present,
        (g.metadata_json::jsonb->'cost' IS NOT NULL AND g.metadata_json::jsonb->'cost' <> 'null'::jsonb) AS cost_present,
        EXISTS(SELECT 1 FROM aiadcast_accounts.storage_objects o WHERE o.user_id=%2$L AND o.path LIKE '%%/' || g.artifact_hash || '.%%') AS storage_reservation_present,
        (SELECT string_agg(a.status, ',') FROM %1$I.attempts a WHERE a.job_id=g.id) AS attempt_status,
        (SELECT sum(a.maximum_micros) FROM %1$I.attempts a WHERE a.job_id=g.id AND a.status IN ('pending','uncertain')) AS held_micro_usd,
        (SELECT sum(a.actual_micros) FROM %1$I.attempts a WHERE a.job_id=g.id) AS actual_micro_usd
 FROM %1$I.generation_records g JOIN %1$I.jobs j ON j.id=g.id
 WHERE g.created_at >= extract(epoch FROM timestamptz '2026-10-24 11:39:10+00') * 1000
   AND g.created_at < extract(epoch FROM timestamptz '2026-10-24 11:39:11+00') * 1000
$q$, n.nspname, u.id), true, false, '') AS diagnostic
FROM pg_namespace n JOIN aiadcast_accounts.users u ON n.nspname='aiadcast_user_' || replace(u.id,'-','')
WHERE n.nspname ~ '^aiadcast_user_[a-f0-9]{32}$'
  AND EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace=n.oid AND c.relname='generation_records')
  AND EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace=n.oid AND c.relname='attempts');
ROLLBACK;
-- A storage reservation/asset record is NOT proof that a blob still exists.
-- Empty XML results mean no matching record in that schema; do not widen to a dump.
