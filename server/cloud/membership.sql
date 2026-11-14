-- Run in the private accounts schema, inside the service's migration transaction.
CREATE TABLE IF NOT EXISTS retention_settings (
 id smallint PRIMARY KEY CHECK (id=1), started_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO retention_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE users ADD COLUMN IF NOT EXISTS joined_at timestamptz;
ALTER TABLE users ALTER COLUMN joined_at SET DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_plan text NOT NULL DEFAULT 'free' CHECK(storage_plan IN ('free','standard'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE projects SET expires_at=(SELECT started_at FROM retention_settings WHERE id=1)+interval '30 days' WHERE expires_at IS NULL;
ALTER TABLE projects ALTER COLUMN expires_at SET DEFAULT (now()+interval '30 days');
ALTER TABLE projects ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE storage_objects ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE storage_objects SET expires_at=(SELECT started_at FROM retention_settings WHERE id=1)+interval '30 days' WHERE expires_at IS NULL;
ALTER TABLE storage_objects ALTER COLUMN expires_at SET DEFAULT (now()+interval '24 hours');
ALTER TABLE storage_objects ALTER COLUMN expires_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS storage_expiry ON storage_objects(expires_at);
CREATE INDEX IF NOT EXISTS project_expiry ON projects(expires_at);
CREATE TABLE IF NOT EXISTS member_events (
 receipt uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('joined','requested','retry','completed')),
 happened_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(receipt,kind)
);
CREATE TABLE IF NOT EXISTS deletion_requests (
 user_id text PRIMARY KEY REFERENCES users(id), receipt uuid NOT NULL UNIQUE,
 requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION record_member_join() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,aiadcast_accounts AS $$
 BEGIN INSERT INTO member_events(receipt,kind) VALUES(gen_random_uuid(),'joined'); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS record_new_membership ON users;
CREATE TRIGGER record_new_membership AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION record_member_join();
CREATE TABLE IF NOT EXISTS protected_complaints (
 case_id text PRIMARY KEY, received_at timestamptz NOT NULL, description text NOT NULL,
 resolution text, erase_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS retired_generation_keys (
 digest text PRIMARY KEY, expires_at timestamptz NOT NULL
);
