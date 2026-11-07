// Explicitly invoked read-only preflight. No initialization, provider import or automatic execution.
import {postgresConfiguration,cloudSchema} from '../../server/cloud/postgres.mjs';
export const PROJECT_REF='sxpzbfapbizlmsuqlrfu';
export const EXPECTED_OWNER='1cd5ecd6-19b6-4ee9-a735-764a490e0057';
const schema=cloudSchema(EXPECTED_OWNER),trial='synthetic-selective-quality-20261107-v1';
export function connectionConfiguration(env){
 if(env.SUPABASE_URL!==`https://${PROJECT_REF}.supabase.co`)throw Error('PROJECT_URL_MISMATCH');
 if(!env.DATABASE_URL)throw Error('DATABASE_CONNECTION_NOT_CONFIGURED');
 // Existing parser enforces postgres.<ref>, session pooler:5432, /postgres,
 // allowed query options and TLS rejectUnauthorized:true. Never return it to logs.
 return postgresConfiguration(env.DATABASE_URL,env.SUPABASE_URL,env);
}
export async function readOnlyPreflight(pool){
 const c=await pool.connect();let began=false;
 try{
  await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
  await c.query("SET LOCAL statement_timeout='5000ms'");await c.query("SET LOCAL lock_timeout='1000ms'");
  const identity=(await c.query('SELECT transaction_timestamp() AS observed_at_utc, current_setting(\'transaction_read_only\') AS read_only, role,disabled FROM aiadcast_accounts.users WHERE id=$1',[EXPECTED_OWNER])).rows[0];
  if(identity?.read_only!=='on'||identity.role!=='admin'||Number(identity.disabled)!==0)throw Error('OWNER_OR_READ_ONLY_MISMATCH');
  const policy=(await c.query(`SELECT owner_id,limit_micros,history_mode,excluded_spent_micros FROM ${schema}.supplier_budget_policy WHERE id=1`)).rows[0];
  if(policy?.owner_id!==EXPECTED_OWNER||Number(policy.limit_micros)!==100000000||policy.history_mode!=='all-history'||Number(policy.excluded_spent_micros)!==0)throw Error('CUMULATIVE_POLICY_MISMATCH');
  const budget=(await c.query(`SELECT sum(spent_micros) AS spent,sum(held_micros) AS held FROM ${schema}.budgets`)).rows[0];
  const analysis=(await c.query("SELECT count(*) AS rows FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id=$1 OR actor_id IS NULL OR actor_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'",[EXPECTED_OWNER])).rows[0];
  // Any nonempty external history requires full validated reconciliation, never assume zero.
  if(Number(analysis.rows)!==0)throw Error('EXTERNAL_HISTORY_RECONCILIATION_REQUIRED');
  const guard=(await c.query("SELECT count(*) AS n FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='cumulative_supplier_reservation' AND tgenabled='O'",[schema+'.budgets'])).rows[0];
  if(Number(guard.n)!==1)throw Error('CUMULATIVE_GUARD_REQUIRED');
  const prior=(await c.query(`SELECT j.status,a.status AS attempt_status FROM ${schema}.jobs j LEFT JOIN ${schema}.attempts a ON a.job_id=j.id WHERE j.id=$1`,[trial])).rows;
  const required=[['aiadcast_accounts.users','SELECT'],['aiadcast_accounts.dimension_analysis_calls','SELECT'],...Object.entries({budgets:['SELECT','INSERT','UPDATE'],jobs:['SELECT','INSERT','UPDATE'],attempts:['SELECT','INSERT','UPDATE'],wallets:['SELECT','INSERT'],admin_test_jobs:['SELECT','INSERT'],job_policies:['SELECT'],credit_events:['INSERT']}).flatMap(([t,ops])=>ops.map(op=>[schema+'.'+t,op]))];
  const privileges=(await c.query('SELECT t,op,has_table_privilege(current_user,t,op) AS allowed FROM unnest($1::text[],$2::text[]) AS required(t,op)',[required.map(x=>x[0]),required.map(x=>x[1])])).rows;
  if(privileges.some(x=>x.allowed!==true)||privileges.length!==required.length)throw Error('REQUIRED_LEDGER_PRIVILEGES_MISSING');
  if(budget?.spent==null||budget?.held==null)throw Error('INVALID_BUDGET_TOTALS');
  const spent=Number(budget.spent),held=Number(budget.held);if(!Number.isSafeInteger(spent)||!Number.isSafeInteger(held)||spent<0||held<0)throw Error('INVALID_BUDGET_TOTALS');
  return {observedAt:identity.observed_at_utc,ownerVerified:true,readOnly:true,spentMicros:spent,heldMicros:held,availableMicros:100000000-spent-held,trialAlreadyRecorded:prior.length>0,privilegesVerified:true};
 }finally{try{if(began)await c.query('ROLLBACK');}finally{c.release();}}
}
// Callers must report only an allowlisted error category, never a raw pg/config
// error, pool options, connectionConfiguration result or credential-bearing env.
export function safeFailure(error){const code=String(error?.message??'');return new Set(['PROJECT_URL_MISMATCH','DATABASE_CONNECTION_NOT_CONFIGURED','SUPABASE_SESSION_POOLER_REQUIRED','INVALID_DATABASE_URL_OPTIONS','OWNER_OR_READ_ONLY_MISMATCH','CUMULATIVE_POLICY_MISMATCH','EXTERNAL_HISTORY_RECONCILIATION_REQUIRED','CUMULATIVE_GUARD_REQUIRED','REQUIRED_LEDGER_PRIVILEGES_MISSING','INVALID_BUDGET_TOTALS']).has(code)?code:'CONNECTION_OR_PREFLIGHT_FAILED';}
