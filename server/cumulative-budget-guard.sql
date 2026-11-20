-- LOCAL/REVIEW TEMPLATE ONLY: replace __SCHEMA__ with the verified tenant schema.
-- Install while generation is quiesced, before separately approved policy insertion.
-- No policy row is inserted here. No historical amounts are rewritten.
BEGIN;
SET LOCAL statement_timeout='5000ms';
SET LOCAL lock_timeout='1000ms';
SELECT pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'));
CREATE OR REPLACE FUNCTION __SCHEMA__.guard_supplier_budget_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p record; used numeric; held numeric; delta bigint; external_spent numeric; external_held numeric;
BEGIN
 delta := NEW.held_micros - CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.held_micros END;
 IF delta<=0 THEN RETURN NEW; END IF;
 -- Same lock as current application transactions. Also covers older app writers.
 PERFORM pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'));
 EXECUTE format('SELECT * FROM %I.supplier_budget_policy WHERE id=1',TG_TABLE_SCHEMA) INTO p;
 IF p.id IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM aiadcast_accounts.users WHERE id=p.owner_id AND role='admin' AND disabled=0) OR p.activated_at<=0 OR p.activated_at>extract(epoch from clock_timestamp())*1000 THEN RAISE EXCEPTION 'CUMULATIVE_BUDGET_POLICY_INVALID'; END IF;
 IF p.limit_micros<>100000000 OR p.history_mode<>'all-history' OR p.excluded_spent_micros<>0
 OR 'aiadcast_user_'||replace(p.owner_id,'-','')<>TG_TABLE_SCHEMA THEN
   RAISE EXCEPTION 'CUMULATIVE_BUDGET_POLICY_INVALID';
 END IF;
 EXECUTE format('SELECT COALESCE(SUM(spent_micros),0),COALESCE(SUM(held_micros),0) FROM %I.budgets',TG_TABLE_SCHEMA) INTO used,held;
 IF EXISTS(SELECT 1 FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id IS NULL OR actor_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'EXTERNAL_SUPPLIER_OWNER_UNKNOWN'; END IF;
 IF EXISTS(SELECT 1 FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id=p.owner_id AND (hold IS NULL OR hold<=0 OR state IS NULL OR state NOT IN ('reserved','uncertain','settled','exceeded') OR (state IN ('reserved','uncertain') AND actual IS NOT NULL) OR (state IN ('settled','exceeded') AND (actual IS NULL OR actual<0)))) THEN RAISE EXCEPTION 'EXTERNAL_SUPPLIER_RECORD_INVALID'; END IF;
 SELECT COALESCE(SUM(CASE WHEN state IN ('settled','exceeded') THEN actual ELSE 0 END),0),COALESCE(SUM(CASE WHEN state IN ('reserved','uncertain') THEN hold ELSE 0 END),0) INTO external_spent,external_held FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id=p.owner_id;
 IF used+held+external_spent+external_held+delta>p.limit_micros THEN RAISE EXCEPTION 'CUMULATIVE_BUDGET_UNAVAILABLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cumulative_supplier_reservation ON __SCHEMA__.budgets;
CREATE TRIGGER cumulative_supplier_reservation BEFORE INSERT OR UPDATE OF held_micros
ON __SCHEMA__.budgets FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.guard_supplier_budget_reservation();
REVOKE ALL ON FUNCTION __SCHEMA__.guard_supplier_budget_reservation() FROM PUBLIC;
-- Historical trial writes use a different ledger. Block new reservations for
-- this policy even on old code; existing late actual-cost updates remain allowed.
CREATE OR REPLACE FUNCTION __SCHEMA__.guard_historical_analysis_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE owner text;
BEGIN
 SELECT owner_id INTO owner FROM __SCHEMA__.supplier_budget_policy WHERE id=1;
 IF owner IS NULL THEN RETURN NEW; END IF;
 IF NEW.actor_id IS NULL OR NEW.actor_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR NEW.actor_id=owner OR (TG_OP='UPDATE' AND OLD.actor_id=owner) THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'CUMULATIVE_BUDGET_TRIAL_DISABLED'; END IF;
  IF NEW.hold>OLD.hold OR NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN RAISE EXCEPTION 'CUMULATIVE_BUDGET_TRIAL_DISABLED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS __SCHEMA___analysis_guard ON aiadcast_accounts.dimension_analysis_calls;
CREATE TRIGGER __SCHEMA___analysis_guard BEFORE INSERT OR UPDATE OF hold,actor_id
ON aiadcast_accounts.dimension_analysis_calls FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.guard_historical_analysis_reservation();
REVOKE ALL ON FUNCTION __SCHEMA__.guard_historical_analysis_reservation() FROM PUBLIC;
COMMIT;
