import {externalSupplierTotals} from '../external-supplier-budget.mjs';
import {cumulativeBudgetView} from '../cumulative-budget.mjs';
import {correctedOctoberOwnerLimit} from '../october-admin-budget.mjs';
import {IMAGE_MODEL} from '../openai-image-adapter.mjs';
import {ApiFailure} from '../generation-service.mjs';
import {customerBalanceSql,readOperatingCosts} from './customer-image-costs.mjs';
import {cloudSchema} from './postgres.mjs';
const fail=code=>{throw new ApiFailure(code,503);};
const localUser='aiadcast-next-local-developer';
// One consistent read-only snapshot; no per-account service/migration/recovery,
// advisory write lock, expiry, asset downloads, or provider calls.
export async function readAdminOverview({pool,guard=()=>{},actor,admin,enabled,providerConfigured,now=Date.now,maximumMembers=200,omitJobs=false}){
 if(actor?.role!=='admin')throw new ApiFailure('ADMIN_REQUIRED',403);
 guard();let client,timer,expired=false;
 const connection=pool.connect().then(c=>{if(expired){c.release();throw Error('ADMIN_READ_TIMEOUT');}return c;});
 try{client=await Promise.race([connection,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('ADMIN_READ_TIMEOUT'));},2000);})]);}
 catch{fail('ADMIN_OVERVIEW_UNAVAILABLE');}finally{clearTimeout(timer);}
 const timestamp=now(),period=new Date(timestamp).toISOString().slice(0,7);
 try{
  guard();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='2500ms'; SET LOCAL lock_timeout='750ms'; SET LOCAL idle_in_transaction_session_timeout='8000ms'");
  const {rows}=await client.query(`SELECT
   (SELECT COALESCE(json_agg(m),'[]') FROM (SELECT u.*,e.email,EXISTS(SELECT 1 FROM aiadcast_accounts.test_passwords t WHERE t.user_id=u.id) AS test_account,
    EXISTS(SELECT 1 FROM aiadcast_accounts.welcome_ad_eligibility w WHERE w.user_id=u.id) AS welcome_eligible,(SELECT COUNT(*) FROM aiadcast_accounts.projects p WHERE p.user_id=u.id) projects FROM aiadcast_accounts.users u LEFT JOIN aiadcast_accounts.email_identities e ON e.user_id=u.id ORDER BY u.id LIMIT $1) m) members,
   (SELECT row_to_json(a) FROM aiadcast_accounts.monthly_budget_approvals a WHERE period=$2) approval,
   (SELECT row_to_json(d) FROM aiadcast_accounts.monthly_demo_support d WHERE period=$2) support,
   (SELECT COALESCE(json_agg(o),'[]') FROM (SELECT id,user_id,credits,amount,state,created FROM aiadcast_accounts.test_orders ORDER BY created DESC LIMIT 50) o) orders,
   (SELECT COALESCE(json_agg(a),'[]') FROM (SELECT id,actor_id,action,target_id,details,created FROM aiadcast_accounts.admin_audit ORDER BY created DESC,id DESC LIMIT 50) a) audit`,[maximumMembers+1,period]);
  const {members,approval,support,orders,audit}=rows[0];
  if(members.length>maximumMembers)fail('ADMIN_OVERVIEW_MEMBER_LIMIT');
  const schemas=members.map(u=>cloudSchema(u.id));
  const catalog=await client.query('SELECT n.nspname, array_agg(c.relname) tables FROM pg_catalog.pg_namespace n LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid WHERE n.nspname=ANY($1::text[]) GROUP BY n.nspname',[schemas]);
  const existing=new Map(catalog.rows.map(r=>[r.nspname,r.tables]));
  const initialized=members.filter((u,i)=>{
   if(!existing.has(schemas[i]))return false;
   if(!['wallets','credit_wallets','budgets','generation_records','jobs'].every(t=>existing.get(schemas[i]).includes(t)))fail('ADMIN_OVERVIEW_INCOMPLETE');
   return true;
  });
  const values=[period,localUser];
  const customer=u=>Boolean(admin.store.customerGeneration && u.role==='member' && u.email && !u.test_account);
  const selects=initialized.map(u=>{const schema='"'+cloudSchema(u.id)+'"';values.push(u.id);return `SELECT $${values.length}::text id,
   (SELECT row_to_json(w) FROM ${schema}.wallets w WHERE user_id=$2) wallet,
   (SELECT row_to_json(w) FROM ${schema}.credit_wallets w WHERE user_id=$2) credits,
    ${customer(u)?`(SELECT row_to_json(balance) FROM (${customerBalanceSql(schema+'.','$'+values.length,existing.get(cloudSchema(u.id)).includes('customer_ad_jobs'))}) balance)`:'NULL::json'} AS customer_balance,
   (SELECT row_to_json(b) FROM ${schema}.budgets b WHERE period=$1) budget,
   ${existing.get(cloudSchema(u.id)).includes('supplier_budget_policy')?`(SELECT row_to_json(p) FROM ${schema}.supplier_budget_policy p WHERE id=1)`:'NULL::json'} supplier_policy,
   ${existing.get(cloudSchema(u.id)).includes('supplier_budget_policy')?`(SELECT json_build_object('spent',COALESCE(SUM(spent_micros),0),'held',COALESCE(SUM(held_micros),0)) FROM ${schema}.budgets)`:'NULL::json'} supplier_totals,
   ${omitJobs?"'[]'::json":`(SELECT COALESCE(json_agg(r),'[]') FROM (SELECT g.id,g.created_at,g.error_code,j.status,j.reason,g.request_json::json->>'mode' mode,g.request_json::json->'output'->>'format' format,g.metadata_json::json->>'model' model,g.metadata_json::json->'cost'->>'microUsd' cost FROM ${schema}.generation_records g JOIN ${schema}.jobs j ON j.id=g.id ORDER BY g.created_at DESC LIMIT 30) r)`} jobs`;});
  const summaries=new Map(selects.length?(await client.query(selects.join(' UNION ALL '),values)).rows.map(r=>[r.id,r]):[]);
  let shared;
  if(admin.store.sharedGenerationBudget?.active){
   const r=(await client.query('SELECT * FROM aiadcast_accounts.shared_generation_budget_totals()')).rows[0];
   if(!r)fail('ADMIN_OVERVIEW_INCOMPLETE');
   shared={scope:'lifetime',shared:true,historyMode:'all-history',activatedAt:r.activated_at,limitMicros:r.limit_micros,spentMicros:r.spent_micros,heldMicros:r.held_micros,availableMicros:Math.max(0,r.limit_micros-r.spent_micros-r.held_micros)};
  }
  let externalRows=[];
  if(!shared&&[...summaries.values()].some(s=>s.supplier_policy)){
   const inventory=await client.query("SELECT to_regclass('aiadcast_accounts.dimension_analysis_calls') IS NOT NULL AS present");
   if(!inventory.rows[0]?.present)fail('ADMIN_OVERVIEW_INCOMPLETE');
   externalRows=(await client.query("SELECT id,actor_id,state,hold,actual FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id=ANY($1::text[]) OR actor_id IS NULL OR actor_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'",[members.filter(u=>summaries.get(u.id)?.supplier_policy).map(u=>u.id)])).rows;
  }
  const operatingCosts=admin.store.customerGeneration?await readOperatingCosts(client):null;
  guard();await client.query('COMMIT');
  // Match the existing monthly allocation view; never change stored policy.
  const demo=period==='2026-10'&&timestamp>=Date.UTC(2026,9,19)&&members.some(u=>u.id==='a3c39e4d-8621-4f0d-9021-2621a8cecdee'&&u.role==='member'&&!u.disabled&&u.email==='guyhan76@gmail.com')&&members.filter(u=>u.email==='guyhan76@gmail.com').length===1;
  const jobs=[];
  const users=members.map(u=>{
   const baseline=approval?.user_id===u.id&&u.role==='admin'&&!u.disabled?approval.allocation_micros:u.budget;
   let limit=support?.owner_id===u.id?Math.min(baseline,approval.allocation_micros-support.micros):baseline+(support?.user_id===u.id?support.micros:0);
   limit=correctedOctoberOwnerLimit({now:timestamp,user:u,approval,support,ownerId:members.find(m=>m.email==='selluplabs@gmail.com')?.id,demo,limit});
   if(demo&&u.id==='a3c39e4d-8621-4f0d-9021-2621a8cecdee'){if(limit>10000000)fail('APPROVED_BUDGET_CONFLICT');limit=10000000;}
   const s=summaries.get(u.id);
   // An entirely absent namespace has never had a ledger. Its initial grant is
   // explicitly recorded in users. Partial schemas/failed reads are errors,
   // never silently replaced with zero balances.
   if(s&&!s.wallet)fail('ADMIN_OVERVIEW_INCOMPLETE');
   const wallet={...(s?.wallet??{available:u.credits,reserved:0}),credits:s?.credits??{available:0,reserved:0},kind:u.role==='admin'?'admin-test-unlimited':'test-credits',...(u.role==='admin'?{unlimited:true}:{})};
   if(customer(u)){
    wallet.kind='customer-ads';wallet.available=0;wallet.reserved=0;
    wallet.credits=s?{available:Math.min(s.credits?.available??0,s.customer_balance.available),reserved:s.customer_balance.reserved}:{available:u.welcome_eligible?10:0,reserved:0};
   }
   const spent=s?.budget?.spent_micros??0,held=s?.budget?.held_micros??0;
   const external=!shared&&s?.supplier_policy?externalSupplierTotals(externalRows,u.id):{spent:0,held:0};
   const totals=s?.supplier_policy?{spent:s.supplier_totals.spent+external.spent,held:s.supplier_totals.held+external.held}:null;
   const cumulative=customer(u)?null:shared??cumulativeBudgetView(s?.supplier_policy,totals,{ownerId:u.id,isAdmin:u.role==='admin'&&!u.disabled,now:timestamp});
   const reason=u.disabled?'ACCOUNT_DISABLED':!enabled?'GENERATION_DISABLED':!providerConfigured?'PROVIDER_NOT_CONFIGURED':!customer(u)&&(cumulative?.availableMicros??(limit-spent-held))<500000?'BUDGET_NOT_AVAILABLE':u.role!=='admin'&&wallet.available<1&&wallet.credits.available<10?'NO_TEST_CREDITS':null;
   for(const j of s?.jobs??[])jobs.push({id:j.id,userId:u.id,userLabel:u.label,state:j.error_code==='PROVIDER_UNCERTAIN'?'uncertain':j.error_code?'failed':j.status==='released'?(j.reason==='customer_rejected'?'rejected':'expired'):j.status==='reserved'?'running':j.status,createdAt:new Date(Number(j.created_at)).toISOString(),mode:j.mode,model:j.model??IMAGE_MODEL,outputFormat:j.format,errorCode:j.error_code,costMicros:j.cost==null?null:Number(j.cost)});
   return {id:u.id,customerFunded:customer(u),joinedAt:u.joined_at??null,label:u.label,email:u.email,role:u.role,disabled:Boolean(u.disabled),projects:Number(u.projects),wallet,budget:{limitMicros:limit,spentMicros:spent,heldMicros:held},...(cumulative?{supplierBudget:cumulative}:{}),generation:{enabled:reason===null,reason},ledgerInitialized:!!s};
  });
  const allocated=users.reduce((n,u)=>n+u.budget.limitMicros,0),baselineCap=approval?.total_micros??admin.store.cap;
  const owner=members.find(u=>u.email===admin.ownerEmail);
  return {mode:'invite-beta',operatingCosts,commercialReady:false,demoSupportAvailable:admin.ownerEmail==='selluplabs@gmail.com'&&period==='2026-10',readiness:{emailConfigured:Boolean(admin.accounts.sendMail),checkoutConfigured:admin.checkout.available(),imageProviderConfigured:providerConfigured,generationSwitch:enabled,verifiedLive:false},octoberApproval:{period:'2026-10',expiresAt:'2026-11-01T00:00:00.000Z',totalMicros:5000000,allocationMicros:5000000,eligible:owner?.id===actor.id&&period==='2026-10',active:approval?.user_id===actor.id,baselineTotalMicros:admin.store.cap},budget:{limitMicros:demo?Math.max(baselineCap,allocated):baselineCap,allocatedMicros:allocated,spentMicros:users.reduce((n,u)=>n+u.budget.spentMicros,0),heldMicros:users.reduce((n,u)=>n+u.budget.heldMicros,0),...(shared??{})},users,jobs:jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,60),orders:orders.map(o=>({id:o.id,userId:o.user_id,credits:o.credits,amount:o.amount,state:o.state,created:o.created,test:true})),audit:audit.map(a=>({id:a.id,actorId:a.actor_id,action:a.action,targetId:a.target_id,details:JSON.parse(a.details),created:a.created}))};
 }catch(error){try{await client.query('ROLLBACK');}catch{/* Preserve the read failure. */}if(error instanceof ApiFailure)throw error;fail('ADMIN_OVERVIEW_UNAVAILABLE');}
 finally{client.release();}
}
