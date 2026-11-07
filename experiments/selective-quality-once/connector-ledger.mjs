// Dedicated SQL-tool protocol, NOT a pg.Pool implementation. No tool invocation on import.
import {OWNER,TRIAL_ID} from './runner.mjs';
export const PROJECT='sxpzbfapbizlmsuqlrfu';
const S='aiadcast_user_'+OWNER.replaceAll('-',''),J=TRIAL_ID,A=J+'-attempt1',R='synthetic-fixture/2.6-high-png/quality-once-v1';
const hex=v=>{if(!/^[a-f0-9]{64}$/.test(v??''))throw Error('INVALID_DIGEST');return v;};
const nonce=v=>{if(!/^[a-f0-9]{32}$/.test(v??''))throw Error('INVALID_NONCE');return v;};
const transaction=body=>`BEGIN; SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='1000ms'; SELECT pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1')); ${body} COMMIT;`;
const checkOwner=`IF NOT EXISTS(SELECT 1 FROM aiadcast_accounts.users WHERE id='${OWNER}' AND role='admin' AND disabled=0) THEN RAISE EXCEPTION 'OWNER_INVALID'; END IF;`;
export function claimSql(hash,token){hex(hash);nonce(token);return transaction(`
SELECT set_config('aiadcast_trial.receipt','false',true);
DO $trial$ DECLARE p record; old record; used bigint; held bigint; extused bigint; extheld bigint; current_used bigint; current_held bigint; lim bigint; v_period text:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM'); nowms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); BEGIN
${checkOwner}
SELECT * INTO p FROM ${S}.supplier_budget_policy WHERE id=1;
IF p.id IS NULL OR p.owner_id<>'${OWNER}' OR p.limit_micros<>100000000 OR p.history_mode<>'all-history' OR p.excluded_spent_micros<>0 OR p.activated_at<=0 OR p.activated_at>nowms THEN RAISE EXCEPTION 'POLICY_INVALID'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='${S}.budgets'::regclass AND tgname='cumulative_supplier_reservation' AND tgenabled='O') THEN RAISE EXCEPTION 'GUARD_MISSING'; END IF;
SELECT * INTO old FROM ${S}.jobs WHERE id='${J}';
IF old.id IS NOT NULL THEN
 IF old.user_id<>'${OWNER}' OR old.request_hash<>'${hash}' OR old.model_revision<>'${R}' OR NOT EXISTS(SELECT 1 FROM ${S}.admin_test_jobs WHERE job_id='${J}') THEN RAISE EXCEPTION 'TRIAL_CONFLICT'; END IF;
 RETURN;
END IF;
SELECT sum(spent_micros),sum(held_micros) INTO used,held FROM ${S}.budgets;
IF used IS NULL OR held IS NULL OR used<0 OR held<0 THEN RAISE EXCEPTION 'HISTORY_UNKNOWN'; END IF;
IF EXISTS(SELECT 1 FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id IS NULL OR actor_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'EXTERNAL_OWNER_UNKNOWN'; END IF;
IF EXISTS(SELECT 1 FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id='${OWNER}' AND (hold IS NULL OR hold<=0 OR state IS NULL OR state NOT IN ('reserved','uncertain','settled','exceeded') OR (state IN ('reserved','uncertain') AND actual IS NOT NULL) OR (state IN ('settled','exceeded') AND (actual IS NULL OR actual<0)))) THEN RAISE EXCEPTION 'EXTERNAL_HISTORY_INVALID'; END IF;
SELECT coalesce(sum(CASE WHEN state IN ('settled','exceeded') THEN actual ELSE 0 END),0),coalesce(sum(CASE WHEN state IN ('reserved','uncertain') THEN hold ELSE 0 END),0) INTO extused,extheld FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id='${OWNER}';
IF used+held+extused+extheld+500000>p.limit_micros THEN RAISE EXCEPTION 'BUDGET_UNAVAILABLE'; END IF;
INSERT INTO ${S}.wallets(user_id) VALUES('${OWNER}') ON CONFLICT DO NOTHING;
INSERT INTO ${S}.jobs(id,user_id,credits,request_hash,model_revision,kind,status,expires_at) VALUES('${J}','${OWNER}',1,'${hash}','${R}','image','reserved',nowms+86400000);
INSERT INTO ${S}.admin_test_jobs(job_id) VALUES('${J}');
INSERT INTO ${S}.credit_events VALUES('reserve:${J}','${OWNER}','${J}','admin-test-reserve',1);
SELECT coalesce(spent_micros,0),coalesce(held_micros,0) INTO current_used,current_held FROM ${S}.budgets WHERE budgets.period=v_period;
lim:=coalesce(current_used,0)+coalesce(current_held,0)+p.limit_micros-used-held-extused-extheld;
INSERT INTO ${S}.budgets(period,limit_micros) VALUES(v_period,lim) ON CONFLICT DO NOTHING;
UPDATE ${S}.budgets SET limit_micros=lim,held_micros=held_micros+500000 WHERE budgets.period=v_period AND spent_micros+held_micros+500000<=lim;
IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_FAILED'; END IF;
INSERT INTO ${S}.attempts(id,job_id,period,maximum_micros,status) VALUES('${A}','${J}',v_period,500000,'pending');
UPDATE ${S}.jobs SET status='running' WHERE id='${J}';
INSERT INTO ${S}.credit_events VALUES('dispatch-claim:${J}','${OWNER}','${J}','synthetic-claim:${token}',1);
PERFORM set_config('aiadcast_trial.receipt','true',true);
END $trial$;
SELECT '${J}' AS trial_id,'${token}' AS nonce,current_setting('aiadcast_trial.receipt')::boolean AS newly_claimed,pg_current_xact_id()::text AS writer_xid,(extract(epoch FROM clock_timestamp())*1000)::bigint AS server_issued_at;`);}
export function inspectSql(){return `BEGIN TRANSACTION READ ONLY; SELECT (SELECT role='admin' AND disabled=0 FROM aiadcast_accounts.users WHERE id='${OWNER}') AS owner_active_admin,j.id AS trial_id,j.request_hash,j.model_revision,j.user_id,j.status AS job_status,j.expires_at,(extract(epoch FROM clock_timestamp())*1000)::bigint AS observed_at,a.id AS attempt_id,a.status AS attempt_status,a.actual_micros,a.maximum_micros,e.kind AS claim FROM ${S}.jobs j LEFT JOIN ${S}.attempts a ON a.job_id=j.id LEFT JOIN ${S}.credit_events e ON e.event_key='dispatch-claim:${J}' WHERE j.id='${J}'; ROLLBACK;`;}
export function settleSql({hash,token,cost=null,artifact=null}){hex(hash);nonce(token);if(cost!==null&&(!Number.isSafeInteger(cost)||cost<0||cost>1e9))throw Error('INVALID_COST');if(artifact!==null)hex(artifact);if(cost===null&&artifact!==null)throw Error('UNKNOWN_COST_ARTIFACT');return transaction(`DO $trial$ DECLARE a record; j record; BEGIN
SELECT * INTO j FROM ${S}.jobs WHERE id='${J}';
IF j.id IS NULL OR j.user_id<>'${OWNER}' OR j.request_hash<>'${hash}' OR j.model_revision<>'${R}' OR NOT EXISTS(SELECT 1 FROM ${S}.admin_test_jobs WHERE job_id='${J}') OR NOT EXISTS(SELECT 1 FROM ${S}.credit_events WHERE event_key='dispatch-claim:${J}' AND kind='synthetic-claim:${token}' AND user_id='${OWNER}' AND job_id='${J}') THEN RAISE EXCEPTION 'CLAIM_MISMATCH'; END IF;
SELECT * INTO a FROM ${S}.attempts WHERE id='${A}' AND job_id='${J}';
IF a.id IS NULL OR a.maximum_micros<>500000 THEN RAISE EXCEPTION 'ATTEMPT_MISMATCH'; END IF;
${cost===null?`IF a.status IN ('pending','uncertain') THEN UPDATE ${S}.attempts SET status='uncertain' WHERE id='${A}'; UPDATE ${S}.jobs SET status='uncertain' WHERE id='${J}' AND status IN ('running','reserved'); END IF;`:`
IF a.status IN ('completed','failed') THEN
 IF a.status<>'completed' OR a.actual_micros<>${cost} THEN RAISE EXCEPTION 'SETTLEMENT_REPLAY_MISMATCH'; END IF; RETURN;
END IF;
IF a.status NOT IN ('pending','uncertain') OR a.actual_micros IS NOT NULL THEN RAISE EXCEPTION 'ATTEMPT_STATE_INVALID'; END IF;
UPDATE ${S}.budgets SET held_micros=held_micros-a.maximum_micros,spent_micros=spent_micros+${cost} WHERE period=a.period AND held_micros>=a.maximum_micros;
IF NOT FOUND THEN RAISE EXCEPTION 'HOLD_MISSING'; END IF;
UPDATE ${S}.attempts SET status='completed',actual_micros=${cost} WHERE id='${A}';
${artifact?`IF j.status IN ('reserved','running','uncertain','ready') AND j.expires_at>extract(epoch FROM clock_timestamp())*1000 THEN UPDATE ${S}.jobs SET status='ready',artifact_id='${artifact}' WHERE id='${J}'; ELSIF j.status IN ('reserved','running','uncertain','ready') THEN UPDATE ${S}.jobs SET status='released',reason='preview_expired' WHERE id='${J}'; INSERT INTO ${S}.credit_events VALUES('release:${J}','${OWNER}','${J}','admin-test-release',1) ON CONFLICT DO NOTHING; END IF;`:`IF j.status IN ('reserved','running','uncertain','ready') THEN UPDATE ${S}.jobs SET status='released',reason='system_error' WHERE id='${J}'; INSERT INTO ${S}.credit_events VALUES('release:${J}','${OWNER}','${J}','admin-test-release',1) ON CONFLICT DO NOTHING; END IF;`}`}
END $trial$; SELECT '${J}' AS trial_id,'settled' AS acknowledgement,pg_current_xact_id()::text AS writer_xid;`);}
// A claim response is permission to continue only in that uninterrupted run.
// Lost/denied/malformed result is STOP, never infer dispatch permission from inspect.
export function dispatchReceipt(rows,{hash,token},inspection){hex(hash);nonce(token);if(rows?.length!==1||rows[0].trial_id!==J||rows[0].nonce!==token||rows[0].newly_claimed!==true)return false;
 const r=inspection?.[0];return inspection?.length===1&&r.owner_active_admin===true&&r.trial_id===J&&r.request_hash===hash&&r.user_id===OWNER&&r.model_revision===R&&r.job_status==='running'&&Number(r.expires_at)>Number(r.observed_at)&&r.attempt_id===A&&r.attempt_status==='pending'&&Number(r.maximum_micros)===500000&&r.claim==='synthetic-claim:'+token;
}

export function commitProofSql(xid,token){
 if(typeof xid!=='string'||! /^[1-9][0-9]{0,19}$/.test(xid)||BigInt(xid)>18446744073709551615n)throw Error('INVALID_WRITER_XID');nonce(token);
 return `BEGIN TRANSACTION READ ONLY; SELECT '${xid}' AS writer_xid,'${token}' AS nonce,pg_xact_status('${xid}'::xid8) AS commit_status; ROLLBACK;`;
}
