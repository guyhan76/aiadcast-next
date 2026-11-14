-- Supabase wakes the free Render service only when it has actual cleanup work.
-- No user identifiers, customer content or credentials are sent.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
SELECT cron.schedule('aiadcast-retention-cleanup','* * * * *',$job$
SELECT net.http_get(url := 'https://aiadcast-next.onrender.com/api/health',timeout_milliseconds := 90000)
WHERE EXISTS(SELECT 1 FROM aiadcast_accounts.deletion_requests)
 OR EXISTS(SELECT 1 FROM aiadcast_accounts.storage_objects WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM aiadcast_accounts.projects WHERE expires_at<=now())
 OR EXISTS(SELECT 1 FROM aiadcast_accounts.member_events WHERE happened_at<now()-interval '30 days')
 OR EXISTS(SELECT 1 FROM aiadcast_accounts.protected_complaints WHERE erase_at<=now())
 OR (extract(minute FROM now())::int=0 AND EXISTS(SELECT 1 FROM aiadcast_accounts.users))
$job$);
