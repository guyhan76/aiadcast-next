-- Installed by the backend. Run SELECT only in the private Supabase SQL Editor.
-- No HTTP endpoint can call this. Postgres built-ins avoid extension prerequisites.
CREATE OR REPLACE FUNCTION aiadcast_accounts.create_owner_invitation(p_email text)
RETURNS TABLE(user_id text, invite text, expires bigint)
LANGUAGE plpgsql
SET search_path TO pg_catalog, aiadcast_accounts
AS $function$
DECLARE
  v_email text := lower(trim(p_email));
  v_id text;
  v_invite text;
  v_expires bigint := floor(extract(epoch FROM clock_timestamp())*1000)::bigint + 86400000;
  v_cap bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('aiadcast_accounts'));
  IF v_email IS NULL OR length(v_email)>254 OR v_email !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'INVALID_OWNER_EMAIL';
  END IF;
  SELECT u.id INTO v_id FROM aiadcast_accounts.users u
    JOIN aiadcast_accounts.email_identities e ON e.user_id=u.id
    WHERE e.email=v_email AND u.role='admin' AND u.disabled=0;
  IF v_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM aiadcast_accounts.users WHERE role='admin') THEN
      RAISE EXCEPTION 'OWNER_ALREADY_EXISTS';
    END IF;
    SELECT value INTO v_cap FROM aiadcast_accounts.settings WHERE key='budget';
    IF v_cap IS NULL OR v_cap < 500000 THEN RAISE EXCEPTION 'OWNER_TEST_BUDGET_REQUIRED'; END IF;
    SELECT e.user_id INTO v_id FROM aiadcast_accounts.email_identities e WHERE e.email=v_email;
    IF v_id IS NULL THEN
      IF (SELECT count(*) FROM aiadcast_accounts.users)>=20 THEN RAISE EXCEPTION 'BETA_ALLOCATION_EXCEEDED'; END IF;
      v_id := gen_random_uuid()::text;
      INSERT INTO aiadcast_accounts.users(id,label,budget,credits,role)
        VALUES(v_id,'셀업랩스 관리자',0,3,'admin');
      INSERT INTO aiadcast_accounts.email_identities VALUES(v_email,v_id);
    ELSE
      IF EXISTS(SELECT 1 FROM aiadcast_accounts.users WHERE id=v_id AND disabled<>0) THEN RAISE EXCEPTION 'OWNER_DISABLED'; END IF;
      UPDATE aiadcast_accounts.users SET role='admin' WHERE id=v_id;
    END IF;
    -- Allocate only unallocated cap. Already spent or held member allocations remain.
    UPDATE aiadcast_accounts.users SET budget=budget+v_cap-(SELECT coalesce(sum(budget),0) FROM aiadcast_accounts.users) WHERE id=v_id;
  END IF;
  -- Two cryptographic random UUIDs supply 244 random bits in a 43-character token.
  v_invite := rtrim(translate(encode(decode(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'hex'),'base64'),'+/','-_'),'=');
  DELETE FROM aiadcast_accounts.invites WHERE invites.user_id=v_id;
  DELETE FROM aiadcast_accounts.sessions WHERE sessions.user_id=v_id;
  INSERT INTO aiadcast_accounts.invites VALUES(encode(sha256(convert_to(v_invite,'UTF8')),'hex'),v_id,v_expires);
  RETURN QUERY SELECT v_id,v_invite,v_expires;
END;
$function$;
REVOKE ALL ON FUNCTION aiadcast_accounts.create_owner_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aiadcast_accounts.create_owner_invitation(text) TO postgres;
