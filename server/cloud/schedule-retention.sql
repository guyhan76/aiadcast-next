-- Wake the free Render service only when a cleanup is due.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION aiadcast_accounts.delivery_cleanup_due()
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog,aiadcast_accounts AS $due$
DECLARE member record; tenant text; due boolean; started timestamptz;
BEGIN
 SELECT started_at INTO started FROM retention_settings WHERE id=1;
 FOR member IN SELECT id FROM users LOOP
  IF member.id !~ '^[a-f0-9-]{36}$' THEN CONTINUE; END IF;
  tenant := 'aiadcast_user_'||replace(member.id,'-','');
  IF to_regclass(format('%I.generation_records',tenant)) IS NOT NULL THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.generation_records WHERE CASE WHEN to_timestamp(created_at/1000.0)<$1 THEN $1+interval ''30 days'' ELSE to_timestamp(created_at/1000.0)+interval ''24 hours'' END<=now())',tenant) INTO due USING started;
   IF due THEN RETURN true; END IF;
  END IF;
  IF to_regclass(format('%I.assistant_requests',tenant)) IS NOT NULL THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.assistant_requests WHERE response_json IS NOT NULL AND CASE WHEN to_timestamp(created_at/1000.0)<$1 THEN $1+interval ''30 days'' ELSE to_timestamp(created_at/1000.0)+interval ''24 hours'' END<=now())',tenant) INTO due USING started;
   IF due THEN RETURN true; END IF;
  END IF;
 END LOOP;
 RETURN false;
END $due$;
REVOKE ALL ON FUNCTION aiadcast_accounts.delivery_cleanup_due() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('aiadcast-retention-cleanup','* * * * *',$job$
SELECT net.http_get(url := 'https://aiadcast-next.onrender.com/api/health',timeout_milliseconds := 90000)
WHERE EXISTS(SELECT 1 FROM aiadcast_accounts.deletion_requests)
 OR EXISTS(SELECT 1 FROM aiadcast_accounts.storage_objects WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM aiadcast_accounts.projects WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM aiadcast_accounts.member_events WHERE happened_at<now()-interval '30 days')
 OR EXISTS(SELECT 1 FROM aiadcast_accounts.protected_complaints WHERE erase_at<=now())
 OR EXISTS(SELECT 1 FROM aiadcast_accounts.retired_generation_keys WHERE expires_at<=now())
 OR aiadcast_accounts.delivery_cleanup_due()
$job$);
