-- Explicit reviewed migration only; never invoked by application startup.
-- Production application requires separate schema/RLS/revoke approval.
CREATE TABLE IF NOT EXISTS recommendation_jobs(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,generation_id TEXT NOT NULL,cache_key TEXT NOT NULL,snapshot_json TEXT NOT NULL,artifact_hash TEXT NOT NULL,locale TEXT NOT NULL,version TEXT NOT NULL,state TEXT NOT NULL,output_json TEXT,error_code TEXT,customer_policy TEXT NOT NULL DEFAULT 'proposed-included-first',customer_charge INTEGER NOT NULL DEFAULT 0 CHECK(customer_charge=0),UNIQUE(owner_id,generation_id),UNIQUE(owner_id,cache_key));
   CREATE TABLE IF NOT EXISTS recommendation_attempts(id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE,state TEXT NOT NULL,held_micros INTEGER NOT NULL,actual_micros INTEGER);
   CREATE TABLE IF NOT EXISTS recommendation_requests(owner_id TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,job_id TEXT NOT NULL,PRIMARY KEY(owner_id,request_id));
CREATE TABLE IF NOT EXISTS recommendation_supplier_costs(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN ('image','recommendation')),period TEXT NOT NULL,held_micros BIGINT NOT NULL CHECK(held_micros>=0),actual_micros BIGINT CHECK(actual_micros>=0),state TEXT NOT NULL,reservation_micros BIGINT NOT NULL CHECK(reservation_micros>0));

ALTER TABLE recommendation_jobs ADD COLUMN IF NOT EXISTS expires_at BIGINT;

-- Run only within the explicitly selected owner's schema in a reviewed migration.
-- No public policies; existing privileged application DB role owns access.
ALTER TABLE recommendation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_supplier_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recommendation_jobs,recommendation_attempts,recommendation_requests,recommendation_supplier_costs FROM PUBLIC;
