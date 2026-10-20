import {randomUUID} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
const fail=(code,status=400)=>{throw new ApiFailure(code,status);};
export class AdminApi {
 constructor(store,{service,accounts,checkout,ownerEmail,overviewReader,now=()=>Date.now()}){
  Object.assign(this,{store,db:store.db,service,accounts,checkout,ownerEmail,overviewReader,now});
  this.db.exec(`CREATE TABLE IF NOT EXISTS admin_grants(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),credits INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created INTEGER NOT NULL,UNIQUE(actor_id,request_id));
   CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,target_id TEXT,details TEXT NOT NULL,created INTEGER NOT NULL);`);
 }
 require(user){if(user.role!=='admin')fail('ADMIN_REQUIRED',403);}
 user(id){if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(id))fail('USER_NOT_FOUND',404);const u=this.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(id);if(!u)fail('USER_NOT_FOUND',404);return u;}
 audit(actor,action,target,details,id=randomUUID()){this.db.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,actor.id,action,target,JSON.stringify(details),this.now());}
 octoberApproval(actor){
  this.require(actor);const owner=this.db.prepare('SELECT user_id FROM email_identities WHERE email=?').get(this.ownerEmail??'');
  const record=this.store.monthApproval(),eligible=owner?.user_id===actor.id&&this.store.budgetPeriod()==='2026-10';
  return {period:'2026-10',expiresAt:'2026-11-01T00:00:00.000Z',totalMicros:5000000,allocationMicros:5000000,eligible,active:record?.user_id===actor.id,baselineTotalMicros:this.store.cap};
 }
 activateOctoberBudget(actor,body){
  const approval=this.octoberApproval(actor);
  if(!approval.eligible)fail('MONTH_APPROVAL_NOT_AUTHORIZED',403);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)fail('INVALID_MONTH_APPROVAL');
  this.store.activateOctoberBudget(actor.id);
  return this.octoberApproval(actor);
 }
 overview(actor){
  this.require(actor);
  if(this.overviewReader)return this.overviewReader(actor,this);
  const members=this.db.prepare('SELECT u.*,e.email,(SELECT COUNT(*) FROM projects p WHERE p.user_id=u.id) projects FROM users u LEFT JOIN email_identities e ON e.user_id=u.id ORDER BY u.rowid').all();
  const jobs=[],users=members.map(u=>{
   const s=this.service(u),status=s.status();
   for(const j of s.history().jobs)jobs.push({id:j.id,userId:u.id,userLabel:u.label,state:j.state,createdAt:j.createdAt,mode:j.mode,model:j.model,outputFormat:j.outputFormat,errorCode:j.errorCode,costMicros:j.cost?.microUsd??null});
   return {id:u.id,label:u.label,email:u.email??null,role:u.role,disabled:Boolean(u.disabled),projects:u.projects,wallet:status.wallet,budget:status.budget,generation:status.generation};
  });
  const orders=this.db.prepare('SELECT id,user_id,credits,amount,state,created FROM test_orders ORDER BY created DESC LIMIT 50').all().map(r=>({id:r.id,userId:r.user_id,credits:r.credits,amount:r.amount,state:r.state,created:r.created,test:true}));
  const audit=this.db.prepare('SELECT id,actor_id,action,target_id,details,created FROM admin_audit ORDER BY created DESC,rowid DESC LIMIT 50').all().map(r=>({id:r.id,actorId:r.actor_id,action:r.action,targetId:r.target_id,details:JSON.parse(r.details),created:r.created}));
  return {mode:'invite-beta',commercialReady:false,demoSupportAvailable:Boolean(this.db.atomicSchemas)&&this.ownerEmail==='selluplabs@gmail.com'&&this.store.budgetPeriod()==='2026-10',readiness:{emailConfigured:Boolean(this.accounts.sendMail),checkoutConfigured:this.checkout.available(),imageProviderConfigured:members.some(u=>this.service(u).providerConfigured),generationSwitch:members.some(u=>this.service(u).enabled),verifiedLive:false},octoberApproval:this.octoberApproval(actor),budget:{limitMicros:this.store.effectiveCap(),allocatedMicros:users.reduce((n,u)=>n+u.budget.limitMicros,0),spentMicros:users.reduce((n,u)=>n+u.budget.spentMicros,0),heldMicros:users.reduce((n,u)=>n+u.budget.heldMicros,0)},users,jobs:jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,60),orders,audit};
 }
 grant(actor,body){
  this.require(actor);const {userId,credits,requestId}=body??{};
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)||!Number.isSafeInteger(credits)||credits<1||credits>30)fail('INVALID_TEST_GRANT');
  const user=this.user(userId);
  const grant=this.store.transaction(()=>{
   const old=this.db.prepare('SELECT * FROM admin_grants WHERE actor_id=? AND request_id=?').get(actor.id,requestId);
   if(old){if(old.user_id!==userId||old.credits!==credits)fail('GRANT_CONFLICT',409);return old;}
   const total=this.db.prepare('SELECT COALESCE(SUM(credits),0) n FROM admin_grants WHERE user_id=?').get(userId).n;
   if(total+credits>30)fail('TEST_GRANT_LIMIT',409);
   const id=randomUUID();this.db.prepare('INSERT INTO admin_grants(id,actor_id,request_id,user_id,credits,created) VALUES(?,?,?,?,?,?)').run(id,actor.id,requestId,userId,credits,this.now());
   return this.db.prepare('SELECT * FROM admin_grants WHERE id=?').get(id);
  });
  // Distinct admin-test ID: not a payment receipt. The ledger makes crash/retry safe.
  const wallet=this.service(user).recordTestPurchase({purchaseId:'admin-test:'+grant.id,credits:grant.credits});
  this.store.transaction(()=>{this.db.prepare("UPDATE admin_grants SET state='completed' WHERE id=?").run(grant.id);this.audit(actor,'test-credit-grant',userId,{credits},'grant-'+grant.id);});
  return {wallet,test:true,grantId:grant.id};
 }
 allocate(actor,body){
  this.require(actor);const user=this.user(body?.userId),micros=body?.budgetMicros;
  if(!Number.isSafeInteger(micros)||micros<user.budget||micros>this.store.cap)fail('INVALID_ALLOCATION');
  const s=this.service(user);
  this.store.setAllocation(user.id,micros);s.increaseBudget(micros);
  this.audit(actor,'allocation-increase',user.id,{fromMicros:user.budget,toMicros:micros});
  return {budget:s.status().budget};
 }
 prepareTest(actor,body){
  this.require(actor);const user=this.user(body?.userId),requestId=body?.requestId;
  if(user.role!=='member')fail('TEST_MEMBER_REQUIRED');
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(requestId))fail('INVALID_TEST_GRANT');
  const grantId='ready-'+requestId,s=this.service(user),status=s.status();
  if(!status.generation.enabled&&['GENERATION_DISABLED','PROVIDER_NOT_CONFIGURED'].includes(status.generation.reason))fail(status.generation.reason,503);
  // Replays cannot allocate another reservation or grant an extra credit.
  const old=this.db.prepare('SELECT * FROM admin_grants WHERE actor_id=? AND request_id=?').get(actor.id,grantId);
  if(!old){
   const reservation=Math.round(status.generation.perRequestReservationUsd*1e6);
   if(!Number.isSafeInteger(reservation)||reservation<1)fail('GENERATION_DISABLED',503);
   const required=Math.max(user.budget,status.budget.spentMicros+status.budget.heldMicros+reservation);
   if(required>this.store.cap)fail('BETA_ALLOCATION_EXCEEDED',409);
   if(required>user.budget)this.allocate(actor,{userId:user.id,budgetMicros:required});
  }
  this.grant(actor,{userId:user.id,credits:1,requestId:grantId});
  return {test:true,...s.status()};
 }
 revoke(actor,body){
  this.require(actor);const user=this.user(body?.userId);
  if(user.role==='admin')fail('ADMIN_REVOKE_REQUIRES_CLI',409);
  this.store.transaction(()=>{this.store.revoke(user.id);this.audit(actor,'member-revoke',user.id,{});});
  return {revoked:true};
 }
}
