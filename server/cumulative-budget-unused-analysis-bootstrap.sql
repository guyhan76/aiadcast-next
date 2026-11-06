-- REVIEW TEMPLATE ONLY. Execute only after documented verification that this
-- historical trial was never used and its ledger was not deleted or restored.
-- This creates an EMPTY ledger, never a zero-cost historical event or policy.
-- Fail if the relation already exists; inspect it instead of replacing it.
BEGIN;
SET LOCAL statement_timeout='5000ms';
SET LOCAL lock_timeout='1000ms';
SELECT pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'));
CREATE TABLE aiadcast_accounts.dimension_analysis_calls (
 id TEXT PRIMARY KEY, approval TEXT NOT NULL, target TEXT NOT NULL,
 hash TEXT NOT NULL, state TEXT NOT NULL, hold INTEGER NOT NULL, actual INTEGER,
 request_id TEXT, actor_id TEXT, result_json TEXT
);
CREATE UNIQUE INDEX dimension_analysis_request_unique
 ON aiadcast_accounts.dimension_analysis_calls(approval,actor_id,request_id);
ALTER TABLE aiadcast_accounts.dimension_analysis_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE aiadcast_accounts.dimension_analysis_calls FROM PUBLIC,anon,authenticated;
COMMIT;
-- Install the tenant reservation guard AND historical-analysis guard before
-- inserting any cumulative policy. Do not enable trial calls to validate this.
