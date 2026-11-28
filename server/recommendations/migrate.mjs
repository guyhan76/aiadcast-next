import {readFileSync} from 'node:fs';
import '../cloud/postgres.mjs';
export const recommendationTables=['recommendation_jobs','recommendation_attempts','recommendation_requests','recommendation_supplier_costs'];
const columns={recommendation_jobs:['id','owner_id','generation_id','cache_key','snapshot_json','artifact_hash','locale','version','state','output_json','error_code','customer_policy','customer_charge','expires_at'],recommendation_attempts:['id','job_id','state','held_micros','actual_micros'],recommendation_requests:['owner_id','request_id','fingerprint','job_id'],recommendation_supplier_costs:['id','owner_id','category','period','held_micros','actual_micros','state','reservation_micros']};
export function recommendationMigrationPlan(schema){if(!/^aiadcast_user_[a-f0-9]{32}$/.test(schema))throw Error('EXISTING_OWNER_SCHEMA_REQUIRED');return {tables:[...recommendationTables],additive:true,enableRls:true,revokeFrom:['PUBLIC','anon','authenticated','service_role'],rollback:'Disable recommendation policy; retain all records and holds. No DROP or balance reset.'};}
export async function migrateRecommendations({pool,schema,apply=false,approveRlsRevoke=false,validateOnly=false}){
 const plan=recommendationMigrationPlan(schema);if(!apply&&!validateOnly)return plan;
 if(apply&&!approveRlsRevoke)throw Error('RLS_REVOKE_APPROVAL_REQUIRED');
 const client=await pool.connect();
 const query=(text,args=[])=>{let n=0;return client.query(text.replace(/\?/g,()=>'$'+(++n)).replace(/\bINTEGER\b/g,'BIGINT'),args);};
 const db={exec:text=>query(text),prepare:text=>({get:async(...args)=>(await query(text,args)).rows[0],all:async(...args)=>(await query(text,args)).rows})};
 try{
  await client.query('BEGIN');
  await db.exec("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('aiadcast-next-budget-transactions-v1'))");
  await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
  const owned=await db.prepare("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=? AND table_name IN ('generation_records','jobs','budgets')").get(schema);if(owned.n!==3)throw Error('EXISTING_OWNER_SCHEMA_REQUIRED');
  for(const table of recommendationTables){const existing=await db.prepare('SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema=? AND table_name=?').all(schema,table);if(existing.length){const names=existing.map(x=>x.column_name),expected=columns[table];if(names.some(n=>!expected.includes(n))||expected.some(n=>n!=='expires_at'&&!names.includes(n)))throw Error('RECOMMENDATION_SCHEMA_CONFLICT');}}
  if(apply){await db.exec(readFileSync(new URL('./migration-draft.sql',import.meta.url),'utf8'));
   const roles=await db.prepare("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')").all();
   if(roles.length)await db.exec(`REVOKE ALL ON ${recommendationTables.join(',')} FROM ${roles.map(r=>'"'+r.rolname+'"').join(',')}`);
  }
  for(const table of recommendationTables){const present=await db.prepare('SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema=? AND table_name=?').all(schema,table);if(columns[table].some(n=>!present.some(p=>p.column_name===n&&(['output_json','error_code','expires_at','actual_micros'].includes(n)||p.is_nullable==='NO')&&p.data_type===(['customer_charge','expires_at','held_micros','actual_micros','reservation_micros'].includes(n)?'bigint':'text'))))throw Error('RECOMMENDATION_SCHEMA_REQUIRED');}
  const unique=await db.prepare("SELECT c.relname AS name, array_agg(a.attname ORDER BY k.ord)::text[] AS cols FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE n.nspname=? AND i.indisunique AND i.indisvalid AND i.indpred IS NULL GROUP BY c.relname,i.indexrelid").all(schema);
  const required={recommendation_jobs:[['id'],['owner_id','generation_id'],['owner_id','cache_key']],recommendation_attempts:[['id'],['job_id']],recommendation_requests:[['owner_id','request_id']],recommendation_supplier_costs:[['id']]};
  for(const [table,sets] of Object.entries(required))for(const cols of sets)if(!unique.some(u=>u.name===table&&JSON.stringify(u.cols)===JSON.stringify(cols)))throw Error('RECOMMENDATION_UNIQUE_REQUIRED');
  const checks=await db.prepare("SELECT c.relname AS name,pg_get_constraintdef(k.oid) AS def FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND k.contype='c'").all(schema);
  for(const [table,pattern] of [['recommendation_jobs',/customer_charge\s*=\s*0/],['recommendation_supplier_costs',/held_micros\s*>=\s*0/],['recommendation_supplier_costs',/actual_micros\s*>=\s*0/],['recommendation_supplier_costs',/reservation_micros\s*>\s*0/]])if(!checks.some(c=>c.name===table&&pattern.test(c.def)))throw Error('RECOMMENDATION_CONSTRAINT_REQUIRED');
  const rls=await db.prepare("SELECT COUNT(*) AS n FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname=? AND c.relname IN ('recommendation_jobs','recommendation_attempts','recommendation_requests','recommendation_supplier_costs') AND c.relrowsecurity=true").get(schema);if(rls.n!==4)throw Error('RECOMMENDATION_RLS_REQUIRED');
  const grants=await db.prepare("SELECT COUNT(*) AS n FROM information_schema.role_table_grants WHERE table_schema=? AND table_name IN ('recommendation_jobs','recommendation_attempts','recommendation_requests','recommendation_supplier_costs') AND grantee IN ('PUBLIC','anon','authenticated','service_role')").get(schema);if(grants.n!==0)throw Error('RECOMMENDATION_GRANTS_CONFLICT');
  await client.query('COMMIT');
  return {applied:apply,validated:true,tables:4,balanceChanges:0};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
