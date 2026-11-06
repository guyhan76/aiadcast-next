-- REVIEWED CUTOVER TEMPLATE: no provider call, no monetary/account row updates.
-- Requires verified-unused external ledger bootstrap in the SAME transaction when
-- that relation is absent. Caller must splice bootstrap DDL, not commit it early.
BEGIN;
SET LOCAL statement_timeout='10000ms';
SET LOCAL lock_timeout='1000ms';
SELECT pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'));
LOCK TABLE aiadcast_accounts.users IN SHARE ROW EXCLUSIVE MODE;
-- Refuse a repeated/foreign installation. Inspect existing manifest before action.
CREATE SCHEMA aiadcast_budget_cutover;
REVOKE ALL ON SCHEMA aiadcast_budget_cutover FROM PUBLIC;
CREATE TABLE aiadcast_budget_cutover.targets(schema_name TEXT NOT NULL,table_name TEXT NOT NULL,PRIMARY KEY(schema_name,table_name));
REVOKE ALL ON TABLE aiadcast_budget_cutover.targets FROM PUBLIC,anon,authenticated;
ALTER TABLE aiadcast_budget_cutover.targets ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION aiadcast_budget_cutover.reject_new() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='budgets' THEN
  IF NEW.held_micros <= (CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.held_micros END) THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'AIADCAST_TEMPORARY_MAINTENANCE';
END $$;
REVOKE ALL ON FUNCTION aiadcast_budget_cutover.reject_new() FROM PUBLIC;
DO $$ DECLARE u record; s text; t text; BEGIN
 IF to_regclass('aiadcast_accounts.dimension_analysis_calls') IS NULL THEN RAISE EXCEPTION 'VERIFIED_UNUSED_BOOTSTRAP_REQUIRED'; END IF;
 FOR u IN SELECT id FROM aiadcast_accounts.users ORDER BY id LOOP
  IF u.id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'INVALID_ACCOUNT_ID'; END IF;
  s:='aiadcast_user_'||replace(u.id,'-','');
  FOREACH t IN ARRAY ARRAY['budgets','jobs'] LOOP
   IF to_regclass(format('%I.%I',s,t)) IS NULL THEN RAISE EXCEPTION 'ACCOUNT_LEDGER_NOT_READY'; END IF;
   INSERT INTO aiadcast_budget_cutover.targets VALUES(s,t);
  END LOOP;
 END LOOP;
 INSERT INTO aiadcast_budget_cutover.targets VALUES('aiadcast_accounts','users'),('aiadcast_accounts','dimension_analysis_calls');
 FOR u IN SELECT schema_name,table_name FROM aiadcast_budget_cutover.targets ORDER BY schema_name,table_name LOOP
  EXECUTE format('CREATE TRIGGER aiadcast_cutover_pause BEFORE INSERT %s ON %I.%I FOR EACH ROW EXECUTE FUNCTION aiadcast_budget_cutover.reject_new()',CASE WHEN u.table_name='budgets' THEN 'OR UPDATE OF held_micros' ELSE '' END,u.schema_name,u.table_name);
 END LOOP;
END $$;
COMMIT;
