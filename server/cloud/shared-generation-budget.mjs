import {readFileSync} from 'node:fs';
import {cloudSchema} from './postgres.mjs';
import {cumulativeBudgetView} from '../cumulative-budget.mjs';
import {auditSupplierHistory} from '../cumulative-budget-audit.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const schemaPattern=/^aiadcast_user_[a-f0-9]{32}$/;
export class SharedGenerationBudget {
 constructor(db){this.db=db;}
 async exists(schema,table){return (await this.db.prepare('SELECT to_regclass(?) IS NOT NULL AS ok').get(schema+'.'+table)).ok;}
 async tenants(){return this.db.prepare("SELECT nspname AS schema FROM pg_namespace WHERE nspname ~ '^aiadcast_user_[a-f0-9]{32}$' ORDER BY nspname").all();}
 async protectTenant(schema){
  if(!schemaPattern.test(schema))throw Error('INVALID_CLOUD_USER');
  if(await this.exists(schema,'budgets'))await this.db.exec(`CREATE OR REPLACE TRIGGER shared_generation_reservation BEFORE INSERT OR UPDATE OF held_micros ON "${schema}".budgets FOR EACH ROW EXECUTE FUNCTION aiadcast_accounts.guard_shared_generation_reservation()`);
 }
 async initialize(ownerId){
  if(ownerId!==undefined&&!uuid.test(ownerId))throw Error('SHARED_BUDGET_OWNER_INVALID');
  let active=false;
  await this.db.transaction(async()=>{
   await this.db.exec(readFileSync(new URL('./shared-generation-budget.sql',import.meta.url),'utf8'));
   let policy=await this.db.prepare('SELECT * FROM shared_generation_budget_policy WHERE id=1').get();
   if(policy&&ownerId&&policy.owner_id!==ownerId)throw Error('SHARED_BUDGET_OWNER_CHANGED');
   if(!policy&&ownerId){
    const schema=cloudSchema(ownerId);
    if(!await this.exists(schema,'supplier_budget_policy'))throw Error('SHARED_BUDGET_OWNER_POLICY_REQUIRED');
    const prior=await this.db.prepare(`SELECT * FROM "${schema}".supplier_budget_policy WHERE id=1`).get();
    const owner=await this.db.prepare('SELECT role,disabled FROM users WHERE id=?').get(ownerId);
    cumulativeBudgetView(prior,{spent:0,held:0},{ownerId,isAdmin:owner?.role==='admin'&&!owner.disabled});
    if(!prior)throw Error('SHARED_BUDGET_OWNER_POLICY_REQUIRED');
    // Reconcile every existing ledger before enabling any zero-allocation member.
    await this.audit();
    await this.db.prepare('INSERT INTO shared_generation_budget_policy VALUES(1,?,100000000,?)').run(ownerId,Date.now());
    policy=await this.db.prepare('SELECT * FROM shared_generation_budget_policy WHERE id=1').get();
   }
   active=Boolean(policy);
   if(active){
    await this.snapshot(); // Missing/invalid history fails closed, including on restart.
    for(const tenant of await this.tenants())await this.protectTenant(tenant.schema);
    await this.db.exec('CREATE OR REPLACE TRIGGER shared_analysis_reservation BEFORE INSERT OR UPDATE OF hold,actor_id ON dimension_analysis_calls FOR EACH ROW EXECUTE FUNCTION aiadcast_accounts.guard_shared_analysis_reservation()');
   }
  });
  this.active=active;
  return this;
 }
 async audit(){
  if(!await this.exists('aiadcast_accounts','dimension_analysis_calls'))throw Error('EXTERNAL_SUPPLIER_HISTORY_UNVERIFIED');
  const external=await this.db.prepare('SELECT id,actor_id,state,hold,actual FROM dimension_analysis_calls').all();
  if(external.some(r=>!uuid.test(r.actor_id??'')))throw Error('EXTERNAL_SUPPLIER_OWNER_UNKNOWN');
  const checked=new Set();
  for(const {schema} of await this.tenants()){
   const hex=schema.slice('aiadcast_user_'.length),owner=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
   const rows=async table=>await this.exists(schema,table)?this.db.prepare(`SELECT * FROM "${schema}".${table}`).all():[];
   auditSupplierHistory({budgets:await rows('budgets'),attempts:await rows('attempts'),assistants:await rows('assistant_requests'),recommendations:await rows('recommendation_supplier_costs'),externalRows:external,ownerId:owner});
   checked.add(owner);
  }
  for(const owner of new Set(external.map(r=>r.actor_id)))if(!checked.has(owner))auditSupplierHistory({budgets:[],attempts:[],assistants:[],recommendations:[],externalRows:external,ownerId:owner});
 }
 async snapshot(){
  const row=await this.db.prepare('SELECT * FROM aiadcast_accounts.shared_generation_budget_totals()').get();
  if(!row)throw Error('SHARED_BUDGET_POLICY_REQUIRED');
  return {scope:'lifetime',historyMode:'all-history',activatedAt:row.activated_at,limitMicros:row.limit_micros,spentMicros:row.spent_micros,heldMicros:row.held_micros,availableMicros:Math.max(0,row.limit_micros-row.spent_micros-row.held_micros)};
 }
 async view(ownerId,period){
  const schema=cloudSchema(ownerId),view=await this.snapshot();
  const current=await this.db.prepare(`SELECT spent_micros,held_micros FROM "${schema}".budgets WHERE period=?`).get(period);
  return {...view,monthlyLimitMicros:(current?.spent_micros??0)+(current?.held_micros??0)+view.availableMicros};
 }
 async archive(ownerId,receipt){
  // Called in the same transaction that removes both ledgers and the account.
  const schema=cloudSchema(ownerId);
  const row=await this.exists(schema,'budgets')?await this.db.prepare(`SELECT COALESCE(SUM(spent_micros),0) spent,COALESCE(SUM(held_micros),0) held FROM "${schema}".budgets`).get():{spent:0,held:0};
  if(await this.exists('aiadcast_accounts','dimension_analysis_calls')){
   const rows=await this.db.prepare('SELECT id,actor_id,state,hold,actual FROM dimension_analysis_calls WHERE actor_id=?').all(ownerId);
   const totals=auditSupplierHistory({budgets:[],attempts:[],assistants:[],recommendations:[],externalRows:rows,ownerId});
   row.spent+=totals.spentMicros;row.held+=totals.heldMicros;
  }
  await this.db.prepare('INSERT INTO retired_supplier_totals VALUES(?,?,?)').run(receipt,row.spent,row.held);
 }
}
