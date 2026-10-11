import {randomUUID} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
const fail=(code,status=400)=>{throw new ApiFailure(code,status);};
export class AdminApi {
 constructor(store,{service,accounts,checkout,now=()=>Date.now()}){
  Object.assign(this,{store,db:store.db,service,accounts,checkout,now});
  this.db.exec(`CREATE TABLE IF NOT EXISTS admin_grants(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),credits INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created INTEGER NOT NULL,UNIQUE(actor_id,request_id));
   CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,target_id TEXT,details TEXT NOT NULL,created INTEGER NOT NULL);`);
 }
 require(user){if(user.role!=='admin')fail('ADMIN_REQUIRED',403);}
 user(id){if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(id))fail('USER_NOT_FOUND',404);const u=this.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(id);if(!u)fail('USER_NOT_FOUND',404);return u;}
 audit(actor,action,target,details,id=randomUUID()){this.db.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,actor.id,action,target,JSON.stringify(details),this.now());}
 overview(actor){
  this.require(actor);
  const members=this.db.prepare('SELECT u.*,e.email,(SELECT COUNT(*) FROM projects p WHERE p.user_id=u.id) projects FROM users u LEFT JOIN email_identities e ON e.user_id=u.id ORDER BY u.rowid').all();
  const jobs=[],users=members.map(u=>{
   const s=this.service(u),status=s.status();
   for(const j of s.history().jobs)jobs.push({id:j.id,userId:u.id,userLabel:u.label,state:j.state,createdAt:j.createdAt,mode:j.mode,model:j.model,outputFormat:j.outputFormat,errorCode:j.errorCode,costMicros:j.cost?.microUsd??null});
   return {id:u.id,label:u.label,email:u.email??null,role:u.role,disabled:Boolean(u.disabled),projects:u.projects,wallet:status.wallet,budget:status.budget,generation:status.generation};
  });
  const orders=this.db.prepare('SELECT id,user_id,credits,amount,state,created FROM test_orders ORDER BY created DESC LIMIT 50').all().map(r=>({id:r.id,userId:r.user_id,credits:r.credits,amount:r.amount,state:r.state,created:r.created,test:true}));
  const audit=this.db.prepare('SELECT id,actor_id,action,target_id,details,created FROM admin_audit ORDER BY created DESC,rowid DESC LIMIT 50').all().map(r=>({id:r.id,actorId:r.actor_id,action:r.action,targetId:r.target_id,details:JSON.parse(r.details),created:r.created}));
  return {mode:'invite-beta',commercialReady:false,readiness:{emailConfigured:Boolean(this.accounts.sendMail),checkoutConfigured:this.checkout.available(),imageProviderConfigured:members.some(u=>this.service(u).providerConfigured),generationSwitch:members.some(u=>this.service(u).enabled),verifiedLive:false},budget:{limitMicros:this.store.cap,allocatedMicros:members.reduce((n,u)=>n+u.budget,0),spentMicros:users.reduce((n,u)=>n+u.budget.spentMicros,0),heldMicros:users.reduce((n,u)=>n+u.budget.heldMicros,0)},users,jobs:jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,60),orders,audit};
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
 revoke(actor,body){
  this.require(actor);const user=this.user(body?.userId);
  if(user.role==='admin')fail('ADMIN_REVOKE_REQUIRES_CLI',409);
  this.store.transaction(()=>{this.store.revoke(user.id);this.audit(actor,'member-revoke',user.id,{});});
  return {revoked:true};
 }
}
