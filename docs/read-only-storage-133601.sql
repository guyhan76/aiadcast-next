-- Diagnostic only: no prompts, images, contacts, keys or session fields.
-- Exact incident job; only SELECTs inside a read-only snapshot.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SET LOCAL lock_timeout = '1000ms';
WITH checked AS MATERIALIZED (
 SELECT u.id, query_to_xml(format(
  'SELECT EXISTS(SELECT 1 FROM %I.generation_records WHERE id=%L) AS found',
  n.nspname, '66422340-91c1-4065-a65e-6d5fa8db64ff'),false,false,'') AS result
 FROM aiadcast_accounts.users u
 JOIN pg_namespace n ON n.nspname='aiadcast_user_'||replace(u.id,'-','')
 WHERE n.nspname ~ '^aiadcast_user_[a-f0-9]{32}$'
 AND EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace=n.oid AND c.relname='generation_records')
), owner AS MATERIALIZED (
 SELECT id FROM checked WHERE (xpath('/table/row/found/text()',result))[1]::text='true'
), totals AS (
 SELECT '앱 전체 / app total' AS scope, count(*) AS records,
        COALESCE(sum(bytes),0) AS bytes, 900000000::bigint AS cap_bytes
 FROM aiadcast_accounts.storage_objects
 UNION ALL
 SELECT '해당 작업 계정 / job owner', count(o.path), COALESCE(sum(o.bytes),0),100000000
 FROM owner u LEFT JOIN aiadcast_accounts.storage_objects o ON o.user_id=u.id
 UNION ALL
 SELECT '계정 이미지 / owner images', count(o.path), COALESCE(sum(o.bytes),0),NULL
 FROM owner u JOIN aiadcast_accounts.storage_objects o ON o.user_id=u.id
 WHERE o.path ~ '\.(png|jpeg|webp)$'
 UNION ALL
 SELECT '계정 프로젝트 JSON / owner project JSON', count(o.path),COALESCE(sum(o.bytes),0),NULL
 FROM owner u JOIN aiadcast_accounts.storage_objects o ON o.user_id=u.id
 WHERE o.path LIKE '%.json'
 UNION ALL
 SELECT '현재 프로젝트에서 참조 안 함 / unreferenced JSON (not proof of orphan)',count(o.path),COALESCE(sum(o.bytes),0),NULL
 FROM owner u JOIN aiadcast_accounts.storage_objects o ON o.user_id=u.id
 WHERE o.path LIKE '%.json' AND NOT EXISTS(
  SELECT 1 FROM aiadcast_accounts.projects p
  WHERE p.user_id=u.id AND p.json::jsonb->>'storagePath'=o.path)
)
SELECT scope, records, bytes AS tracked_bytes,
 round(bytes/1000000.0,2) AS decimal_mb, cap_bytes,
 CASE WHEN cap_bytes IS NOT NULL THEN cap_bytes-bytes END AS remaining_bytes,
 (SELECT count(*) FROM owner) AS matching_job_owners
FROM totals;
ROLLBACK;
