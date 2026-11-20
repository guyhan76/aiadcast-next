-- Remove ONLY temporary objects. Permanent cumulative guards/policy remain.
BEGIN;
SET LOCAL statement_timeout='10000ms';
SET LOCAL lock_timeout='1000ms';
SELECT pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'));
LOCK TABLE aiadcast_accounts.users IN SHARE ROW EXCLUSIVE MODE;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT schema_name,table_name FROM aiadcast_budget_cutover.targets ORDER BY schema_name,table_name LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger tr WHERE tr.tgrelid=to_regclass(format('%I.%I',r.schema_name,r.table_name)) AND tr.tgname='aiadcast_cutover_pause' AND tr.tgfoid='aiadcast_budget_cutover.reject_new()'::regprocedure AND tr.tgenabled='O') THEN RAISE EXCEPTION 'CUTOVER_TRIGGER_MISMATCH'; END IF;
  EXECUTE format('DROP TRIGGER aiadcast_cutover_pause ON %I.%I',r.schema_name,r.table_name);
 END LOOP;
END $$;
DROP FUNCTION aiadcast_budget_cutover.reject_new();
DROP TABLE aiadcast_budget_cutover.targets;
DROP SCHEMA aiadcast_budget_cutover;
COMMIT;
