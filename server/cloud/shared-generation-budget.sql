-- Installed under the existing cross-schema budget transaction lock.
-- Empty policy = no change. Activation reuses a verified lifetime owner policy.
CREATE TABLE IF NOT EXISTS aiadcast_accounts.shared_generation_budget_policy (
 id BIGINT PRIMARY KEY CHECK(id=1), owner_id TEXT NOT NULL,
 limit_micros BIGINT NOT NULL CHECK(limit_micros=100000000),
 activated_at BIGINT NOT NULL CHECK(activated_at>0)
);
-- No email, account ID, image or purchase details survive in this cost archive.
CREATE TABLE IF NOT EXISTS aiadcast_accounts.retired_supplier_totals (
 receipt TEXT PRIMARY KEY,
 spent_micros BIGINT NOT NULL CHECK(spent_micros>=0),
 held_micros BIGINT NOT NULL CHECK(held_micros>=0)
);
CREATE OR REPLACE FUNCTION aiadcast_accounts.shared_generation_budget_totals()
RETURNS TABLE(limit_micros BIGINT,spent_micros BIGINT,held_micros BIGINT,activated_at BIGINT)
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p record; owner_policy record; tenant record; used numeric:=0; held numeric:=0; s numeric; h numeric; owner_schema text;
BEGIN
 SELECT * INTO p FROM aiadcast_accounts.shared_generation_budget_policy WHERE id=1;
 IF NOT FOUND THEN RETURN; END IF;
 IF p.owner_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 OR p.limit_micros<>100000000 OR p.activated_at<=0 OR p.activated_at>extract(epoch FROM clock_timestamp())*1000
 OR NOT EXISTS(SELECT 1 FROM aiadcast_accounts.users WHERE id=p.owner_id AND role='admin' AND disabled=0)
 THEN RAISE EXCEPTION 'SHARED_BUDGET_POLICY_INVALID'; END IF;
 owner_schema:='aiadcast_user_'||replace(p.owner_id,'-','');
 IF to_regclass(format('%I.supplier_budget_policy',owner_schema)) IS NULL THEN RAISE EXCEPTION 'SHARED_BUDGET_POLICY_INVALID'; END IF;
 EXECUTE format('SELECT * FROM %I.supplier_budget_policy WHERE id=1',owner_schema) INTO owner_policy;
 IF owner_policy.id IS NULL OR owner_policy.owner_id<>p.owner_id OR owner_policy.limit_micros<>100000000
 OR owner_policy.history_mode<>'all-history' OR owner_policy.excluded_spent_micros<>0
 OR owner_policy.activated_at<=0 OR owner_policy.activated_at>p.activated_at
 THEN RAISE EXCEPTION 'SHARED_BUDGET_POLICY_INVALID'; END IF;
 -- Include every tenant ledger, even disabled accounts and schemas absent from users.
 FOR tenant IN SELECT nspname FROM pg_namespace WHERE nspname ~ '^aiadcast_user_[a-f0-9]{32}$' LOOP
  IF to_regclass(format('%I.budgets',tenant.nspname)) IS NOT NULL THEN
   EXECUTE format('SELECT COALESCE(SUM(spent_micros),0),COALESCE(SUM(held_micros),0) FROM %I.budgets',tenant.nspname) INTO s,h;
   IF s<0 OR h<0 THEN RAISE EXCEPTION 'SHARED_BUDGET_HISTORY_INVALID'; END IF;
   used:=used+s; held:=held+h;
  END IF;
 END LOOP;
 -- These costs are outside budgets. Recommendation/assistant costs are already inside it.
 IF to_regclass('aiadcast_accounts.dimension_analysis_calls') IS NULL THEN RAISE EXCEPTION 'EXTERNAL_SUPPLIER_HISTORY_UNVERIFIED'; END IF;
 IF EXISTS(SELECT 1 FROM aiadcast_accounts.dimension_analysis_calls WHERE
  actor_id IS NULL OR actor_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR hold IS NULL OR hold<=0 OR state IS NULL OR state NOT IN ('reserved','uncertain','settled','exceeded')
  OR (state IN ('reserved','uncertain') AND actual IS NOT NULL)
  OR (state IN ('settled','exceeded') AND (actual IS NULL OR actual<0)))
 THEN RAISE EXCEPTION 'EXTERNAL_SUPPLIER_RECORD_INVALID'; END IF;
 SELECT COALESCE(SUM(CASE WHEN state IN ('settled','exceeded') THEN actual ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN state IN ('reserved','uncertain') THEN hold ELSE 0 END),0)
 INTO s,h FROM aiadcast_accounts.dimension_analysis_calls;
 used:=used+s; held:=held+h;
 SELECT COALESCE(SUM(r.spent_micros),0),COALESCE(SUM(r.held_micros),0) INTO s,h FROM aiadcast_accounts.retired_supplier_totals r;
 used:=used+s; held:=held+h;
 IF used+held>9007199254740991 THEN RAISE EXCEPTION 'SHARED_BUDGET_HISTORY_INVALID'; END IF;
 RETURN QUERY SELECT p.limit_micros,used::bigint,held::bigint,p.activated_at;
END $$;

CREATE OR REPLACE FUNCTION aiadcast_accounts.guard_shared_generation_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE delta bigint; totals record;
BEGIN
 delta:=NEW.held_micros-CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.held_micros END;
 IF delta<=0 THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'));
 SELECT * INTO totals FROM aiadcast_accounts.shared_generation_budget_totals();
 IF FOUND AND totals.spent_micros+totals.held_micros+delta>totals.limit_micros
 THEN RAISE EXCEPTION 'SHARED_BUDGET_UNAVAILABLE'; END IF;
 RETURN NEW;
END $$;

-- Historical analysis trials do not become a new customer benefit. Preserve settlement.
CREATE OR REPLACE FUNCTION aiadcast_accounts.guard_shared_analysis_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'));
 IF EXISTS(SELECT 1 FROM aiadcast_accounts.shared_generation_budget_policy WHERE id=1) THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'CUMULATIVE_BUDGET_TRIAL_DISABLED'; END IF;
  IF NEW.hold>OLD.hold OR NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN RAISE EXCEPTION 'CUMULATIVE_BUDGET_TRIAL_DISABLED'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION aiadcast_accounts.shared_generation_budget_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION aiadcast_accounts.guard_shared_generation_reservation() FROM PUBLIC;
REVOKE ALL ON FUNCTION aiadcast_accounts.guard_shared_analysis_reservation() FROM PUBLIC;
