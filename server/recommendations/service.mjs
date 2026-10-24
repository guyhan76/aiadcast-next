import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {hash,snapshotOf,validateOutput} from './contracts.mjs';

// Local-only prototype. No HTTP route, production DB, wallet or provider wiring.
export class RecommendationService {
 constructor({path,resolveOwnedImage,adapter,enabled=false,version='mock-v1/prompt-v1',budgetMicros=10000,reservationMicros=1000,lookupEvidence}){
  if(!Number.isSafeInteger(budgetMicros)||budgetMicros<0||!Number.isSafeInteger(reservationMicros)||reservationMicros<1||!version)throw Error('INVALID_MOCK_POLICY');
  Object.assign(this,{resolveOwnedImage,adapter,enabled,version,budgetMicros,reservationMicros,lookupEvidence});
  this.db=new DatabaseSync(path);this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS recommendation_jobs(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,generation_id TEXT NOT NULL,cache_key TEXT NOT NULL,snapshot_json TEXT NOT NULL,artifact_hash TEXT NOT NULL,locale TEXT NOT NULL,version TEXT NOT NULL,state TEXT NOT NULL,output_json TEXT,error_code TEXT,customer_policy TEXT NOT NULL DEFAULT 'proposed-included-first',customer_charge INTEGER NOT NULL DEFAULT 0 CHECK(customer_charge=0),UNIQUE(owner_id,generation_id),UNIQUE(owner_id,cache_key));
   CREATE TABLE IF NOT EXISTS recommendation_attempts(id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE,state TEXT NOT NULL,held_micros INTEGER NOT NULL,actual_micros INTEGER);
   CREATE TABLE IF NOT EXISTS recommendation_requests(owner_id TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,job_id TEXT NOT NULL,PRIMARY KEY(owner_id,request_id));`);
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const out=fn();this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 principal(context){if(!context||typeof context.userId!=='string'||!context.userId)throw Error('AUTH_REQUIRED');return context.userId;}
 read(context,id){const row=this.db.prepare('SELECT * FROM recommendation_jobs WHERE id=? AND owner_id=?').get(id,this.principal(context));if(!row)throw Error('NOT_FOUND');return {id:row.id,state:row.state,output:row.output_json?JSON.parse(row.output_json):null,error:row.error_code,customerPolicy:row.customer_policy,customerCharge:0,version:row.version,locale:row.locale};}
 budget(){return this.db.prepare('SELECT COALESCE(SUM(held_micros),0) held,COALESCE(SUM(actual_micros),0) spent FROM recommendation_attempts').get();}
 async request(context,body){
  const owner=this.principal(context);
  if(!body||Object.keys(body).some(k=>!['generationId','requestId','locale'].includes(k))||typeof body.generationId!=='string'||!body.generationId||body.generationId.length>100||typeof body.requestId!=='string'||!body.requestId||body.requestId.length>100||!['ko','en'].includes(body.locale))throw Error('INVALID_REQUEST');
  // Resolver is an authenticated server repository dependency, never a client record.
  const record=await this.resolveOwnedImage(owner,body.generationId),snapshot=snapshotOf(record,owner);
  const key=hash([owner,record.artifactHash,hash(snapshot),body.locale,this.version]);
  const fingerprint=hash([body.generationId,key]);
  const outcome=this.transaction(()=>{
   const prior=this.db.prepare('SELECT * FROM recommendation_requests WHERE owner_id=? AND request_id=?').get(owner,body.requestId);
   if(prior){if(prior.fingerprint!==fingerprint)throw Error('IDEMPOTENCY_CONFLICT');return {id:prior.job_id,dispatch:false};}
   const old=this.db.prepare('SELECT * FROM recommendation_jobs WHERE owner_id=? AND (generation_id=? OR cache_key=?)').get(owner,body.generationId,key);
   if(old){if(old.cache_key!==key)throw Error('EXPLICIT_REFRESH_NOT_IMPLEMENTED');this.db.prepare('INSERT INTO recommendation_requests VALUES(?,?,?,?)').run(owner,body.requestId,fingerprint,old.id);return {id:old.id,dispatch:false};}
   if(!this.enabled||!this.adapter)throw Error('RECOMMENDATIONS_DISABLED');
   const b=this.budget();if(b.held+b.spent+this.reservationMicros>this.budgetMicros)throw Error('RECOMMENDATION_BUDGET_UNAVAILABLE');
   const id=randomUUID(),attempt=randomUUID();
   this.db.prepare('INSERT INTO recommendation_jobs(id,owner_id,generation_id,cache_key,snapshot_json,artifact_hash,locale,version,state) VALUES(?,?,?,?,?,?,?,?,?)').run(id,owner,body.generationId,key,JSON.stringify(snapshot),record.artifactHash,body.locale,this.version,'pending');
   this.db.prepare('INSERT INTO recommendation_attempts VALUES(?,?,?,?,NULL)').run(attempt,id,'pending',this.reservationMicros);
   this.db.prepare('INSERT INTO recommendation_requests VALUES(?,?,?,?)').run(owner,body.requestId,fingerprint,id);
   return {id,attempt,dispatch:true};
  });
  if(outcome.dispatch){
   try{const result=await this.adapter({snapshot:structuredClone(snapshot),imageBytes:Buffer.from(record.imageBytes),locale:body.locale,attemptId:outcome.attempt});this.finish(outcome.id,result);}
   catch(e){this.transaction(()=>{const a=this.db.prepare('SELECT * FROM recommendation_attempts WHERE job_id=?').get(outcome.id);if(a.state!=='pending')return;
    // Only a typed adapter proof of no dispatch permits a zero-cost release.
    const zero=e instanceof NotDispatched;
    this.db.prepare('UPDATE recommendation_attempts SET state=?,held_micros=?,actual_micros=? WHERE job_id=?').run(zero?'failed':'uncertain',zero?0:a.held_micros,zero?0:null,outcome.id);
    this.db.prepare('UPDATE recommendation_jobs SET state=?,error_code=? WHERE id=?').run(zero?'failed':'uncertain',zero?'NOT_DISPATCHED':'OUTCOME_UNKNOWN',outcome.id);
   });}
  }
  return this.read(context,outcome.id);
 }
 finish(id,result){
  let output;try{output=validateOutput(result?.output);}catch{}
  const cost=result?.actualMicros,known=Number.isSafeInteger(cost)&&cost>=0;
  this.transaction(()=>{
   const a=this.db.prepare('SELECT * FROM recommendation_attempts WHERE job_id=?').get(id);if(!a||!['pending','uncertain'].includes(a.state))return;
   const old=this.db.prepare('SELECT output_json FROM recommendation_jobs WHERE id=?').get(id);
   if(output&&old.output_json&&JSON.stringify(output)!==old.output_json)throw Error('EVIDENCE_CONFLICT');
   const json=output?JSON.stringify(output):old.output_json;
   this.db.prepare('UPDATE recommendation_jobs SET output_json=?,state=?,error_code=? WHERE id=?').run(json,known?(json?'completed':'failed'):(json?'output_ready_usage_pending':'uncertain'),known?(json?null:'INVALID_OUTPUT'):'USAGE_UNKNOWN',id);
   this.db.prepare('UPDATE recommendation_attempts SET state=?,held_micros=?,actual_micros=? WHERE job_id=?').run(known?'settled':'uncertain',known?0:a.held_micros,known?cost:null,id);
  });
 }
 async reconcile(context,id){this.read(context,id);if(!this.lookupEvidence)throw Error('READ_ONLY_EVIDENCE_UNAVAILABLE');const evidence=await this.lookupEvidence(id);if(evidence)this.finish(id,evidence);return this.read(context,id);}
 close(){this.db.close();}
}
export class NotDispatched extends Error {}
