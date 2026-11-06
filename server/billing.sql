PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  available INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0)
);
CREATE TABLE IF NOT EXISTS purchases (
  purchase_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES wallets(user_id),
  credits INTEGER NOT NULL CHECK (credits > 0)
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES wallets(user_id),
  credits INTEGER NOT NULL CHECK (credits > 0),
  request_hash TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  status TEXT NOT NULL CHECK (status IN ('reserved','running','uncertain','ready','accepted','released','refunded')),
  expires_at INTEGER NOT NULL,
  artifact_id TEXT,
  reason TEXT
);
CREATE TABLE IF NOT EXISTS credit_events (
  event_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT,
  kind TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0)
);
-- Keep the quoted credit quantity and old metered jobs intact. Only trusted
-- server admission can mark a new administrator test as credit-exempt.
CREATE TABLE IF NOT EXISTS admin_test_jobs (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id)
);
CREATE TABLE IF NOT EXISTS budgets (
  period TEXT PRIMARY KEY,
  limit_micros INTEGER NOT NULL CHECK (limit_micros > 0),
  spent_micros INTEGER NOT NULL DEFAULT 0 CHECK (spent_micros >= 0),
  held_micros INTEGER NOT NULL DEFAULT 0 CHECK (held_micros >= 0)
);
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  period TEXT NOT NULL REFERENCES budgets(period),
  maximum_micros INTEGER NOT NULL CHECK (maximum_micros > 0),
  actual_micros INTEGER CHECK (actual_micros >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending','uncertain','completed','failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_attempt ON attempts(job_id)
WHERE status IN ('pending','uncertain');


-- Additive v2 migration: existing rows keep legacy ticket semantics.
CREATE TABLE IF NOT EXISTS credit_wallets(user_id TEXT PRIMARY KEY, available INTEGER NOT NULL DEFAULT 0 CHECK(available>=0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0));
CREATE TABLE IF NOT EXISTS purchase_units(purchase_id TEXT PRIMARY KEY REFERENCES purchases(purchase_id), unit TEXT NOT NULL CHECK(unit='credit-v2'));
CREATE TABLE IF NOT EXISTS job_policies(job_id TEXT PRIMARY KEY REFERENCES jobs(id), unit TEXT NOT NULL CHECK(unit='credit-v2'), policy TEXT NOT NULL, captured INTEGER NOT NULL DEFAULT 0 CHECK(captured IN (0,1)));
CREATE TABLE IF NOT EXISTS defect_reports(id TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id), description TEXT NOT NULL, created_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', reviewer TEXT, resolution TEXT, reviewed_at INTEGER);

-- Empty by default. Activation is a separately approved, quiesced operation.
CREATE TABLE IF NOT EXISTS supplier_budget_policy (
 id INTEGER PRIMARY KEY CHECK(id=1),
 owner_id TEXT NOT NULL,
 limit_micros INTEGER NOT NULL CHECK(limit_micros=100000000),
 history_mode TEXT NOT NULL CHECK(history_mode='all-history'),
 excluded_spent_micros INTEGER NOT NULL CHECK(excluded_spent_micros=0),
 activated_at INTEGER NOT NULL CHECK(activated_at>0),
 CHECK(history_mode<>'all-history' OR excluded_spent_micros=0)
);
