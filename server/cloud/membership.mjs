import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {cloudSchema} from './postgres.mjs';
import {ApiFailure} from '../generation-service.mjs';

const fail=(code,status)=>{throw new ApiFailure(code,status);};
const mb=1000000;
const projectId = id=>typeof id==='string' && /^[A-Za-z0-9_-]{8,100}$/.test(id);
export class Membership {
 constructor(store,storage){this.store=store;this.db=store.db;this.storage=storage;this.active=new Map();this.jobs=new Map();this.cleaning=new Set();}
 async initialize(){await this.db.transaction(()=>this.db.exec(readFileSync(new URL('./membership.sql',import.meta.url),'utf8')));}
 // Authentication and lease acquisition are separated by an await. Reject a lease
 // while cleanup holds the owner, and recheck access after taking it.
 async enter(user){
  if(this.cleaning.has(user.id))await this.running;
  if(this.cleaning.has(user.id))fail('ACCOUNT_MAINTENANCE',503);
  this.active.set(user.id,(this.active.get(user.id)??0)+1);
  const leave=()=>{const n=this.active.get(user.id)-1;if(n)this.active.set(user.id,n);else this.active.delete(user.id);};
  try{if(!await this.db.prepare('SELECT id FROM users WHERE id=? AND disabled=0').get(user.id))fail('AUTH_REQUIRED',401);}catch(e){leave();throw e;}
  return leave;
 }
 async policy(user){
  const member=await this.db.prepare('SELECT role,storage_plan FROM users WHERE id=? AND disabled=0').get(user.id);
  if(!member)fail('AUTH_REQUIRED',401);
  const standard=member.role==='admin'||member.storage_plan==='standard';
  const usage=await this.db.prepare('SELECT COALESCE(SUM(bytes),0) bytes FROM projects WHERE user_id=? AND expires_at>now()').get(user.id);
  return {plan:standard?'standard':'free',limitBytes:standard?500*mb:0,usedBytes:usage.bytes};
 }
 async route(user,method,path,body){
  if(path==='/api/membership'&&method==='GET')return this.policy(user);
  if(path==='/api/membership/withdraw'&&method==='POST'){
   if(body?.confirm!=='delete-my-account')fail('CONFIRM_DELETION',400);
   return this.withdraw(user);
  }
  if(path==='/api/membership/remove-project'&&method==='POST'){
   if(!projectId(body?.id))fail('INVALID_PROJECT',400);
   await this.store.transaction(async()=>{
    const project=await this.db.prepare('DELETE FROM projects WHERE user_id=? AND id=? RETURNING json').get(user.id,body.id);
    if(project){const {storagePath}=JSON.parse(project.json);await this.db.prepare('UPDATE storage_objects SET expires_at=now() WHERE user_id=? AND path=?').run(user.id,storagePath);}
   });this.kick();return {removed:true};
  }
  if(path==='/api/membership/admin'&&method==='GET'){
   if(user.role!=='admin')fail('ADMIN_REQUIRED',403);
   return {events:await this.db.prepare('SELECT receipt,kind,happened_at FROM member_events ORDER BY happened_at DESC LIMIT 200').all(),members:await this.db.prepare('SELECT id,joined_at,storage_plan,role FROM users WHERE disabled=0').all()};
  }
  if(path==='/api/membership/plan'&&method==='POST'){
   if(user.role!=='admin')fail('ADMIN_REQUIRED',403);
   if(!['standard','free'].includes(body?.plan))fail('INVALID_STORAGE_PLAN',400);
   const result=await this.db.prepare("UPDATE users SET storage_plan=? WHERE id=? AND role='member' AND disabled=0").run(body.plan,body.userId);
   if(!result.changes)fail('USER_NOT_FOUND',404);
   return {updated:true};
  }
  fail('NOT_FOUND',404);
 }
 async withdraw(user){
  const receipt=randomUUID();
  await this.store.transaction(async()=>{
   const old=await this.db.prepare('SELECT receipt FROM deletion_requests WHERE user_id=?').get(user.id);
   if(old)fail('DELETION_ALREADY_REQUESTED',409);
   await this.db.prepare('INSERT INTO deletion_requests(user_id,receipt) VALUES(?,?)').run(user.id,receipt);
   await this.db.prepare("INSERT INTO member_events(receipt,kind) VALUES(?,'requested')").run(receipt);
   await this.db.prepare('UPDATE users SET disabled=1 WHERE id=?').run(user.id);
   await this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
   await this.db.prepare('DELETE FROM invites WHERE user_id=?').run(user.id);
  });
  this.kick();return {receipt,state:'requested'};
 }
 kick(){if(!this.stopped&&!this.kickTimer){this.kickTimer=setTimeout(()=>{this.kickTimer=null;void this.run();},100);this.kickTimer.unref();}}
 start(){this.timer=setInterval(()=>void this.run(),30000);this.timer.unref();this.kick();}
 async stop(){this.stopped=true;clearTimeout(this.kickTimer);clearInterval(this.timer);await this.running;}
 run(){if(this.stopped||this.running)return this.running;
  this.running=this.sweep().catch(()=>{console.error('Membership cleanup will retry');}).finally(()=>{this.running=null;});return this.running;
 }
 async sweep(){
  const rows=await this.db.prepare('SELECT id FROM users ORDER BY id').all();
  for(const {id} of rows){
   const service=this.jobs.get(id);
   if(this.active.has(id)||service?.tasks?.size||this.cleaning.has(id))continue;
   this.cleaning.add(id);
   try{
    const request=await this.db.prepare('SELECT receipt FROM deletion_requests WHERE user_id=?').get(id);
    if(request){try{await this.erase(id,request.receipt);}catch{await this.db.prepare("INSERT INTO member_events(receipt,kind) VALUES(?,'retry') ON CONFLICT DO NOTHING").run(request.receipt);}}
    else await this.expire(id);
   }catch{console.error('Member cleanup deferred');}finally{this.cleaning.delete(id);}
  }
  await this.db.prepare('DELETE FROM retired_generation_keys WHERE expires_at<=now()').run();
  await this.db.prepare('DELETE FROM protected_complaints WHERE erase_at<=now()').run();
  await this.db.prepare("DELETE FROM member_events e WHERE happened_at < now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM deletion_requests r WHERE r.receipt=e.receipt)").run();
 }
 async expire(id){
  const tenant=cloudSchema(id), q='"'+tenant+'".';
  const deadlines=await this.db.prepare("SELECT (SELECT started_at+interval '30 days' FROM retention_settings WHERE id=1) AS grace,(SELECT started_at FROM retention_settings WHERE id=1) AS cutover").get();
  // Saved project snapshots are self-contained. Originals used only for generation
  // have their own short delivery lease. Expiring one snapshot cannot destroy another.
  await this.db.prepare('DELETE FROM projects WHERE user_id=? AND expires_at<=now()').run(id);
  const objects=await this.db.prepare('SELECT path FROM storage_objects WHERE user_id=? AND expires_at<=now() LIMIT 200').all(id);
  for(const {path} of objects)await this.storage.remove(id,path);
  if(!await this.exists(tenant,'generation_records'))return;
  await this.store.transaction(async()=>{
   const expired='SELECT id FROM '+q+'generation_records WHERE (CASE WHEN to_timestamp(created_at/1000.0) < ?::timestamptz THEN ?::timestamptz ELSE to_timestamp(created_at/1000.0)+interval \'24 hours\' END)<=now()';
   const args=[deadlines.cutover,deadlines.grace];
   if(await this.exists(tenant,'recommendation_jobs')){
    const subset='SELECT id FROM '+q+'recommendation_jobs WHERE generation_id IN ('+expired+')';
    await this.db.prepare('DELETE FROM '+q+'recommendation_requests WHERE job_id IN ('+subset+')').run(...args);
    await this.db.prepare('DELETE FROM '+q+'recommendation_jobs WHERE generation_id IN ('+expired+')').run(...args);
   }
   await this.db.prepare("INSERT INTO protected_complaints(case_id,received_at,description,resolution,erase_at) SELECT id,to_timestamp(created_at/1000.0),description,resolution,to_timestamp(created_at/1000.0)+interval '3 years' FROM "+q+"defect_reports WHERE job_id IN ("+expired+") AND to_timestamp(created_at/1000.0)+interval '3 years'>now() ON CONFLICT DO NOTHING").run(...args);
   await this.db.prepare('DELETE FROM '+q+'defect_reports WHERE job_id IN ('+expired+')').run(...args);
   await this.db.prepare("INSERT INTO retired_generation_keys(digest,expires_at) SELECT encode(sha256(convert_to(?||':'||request_id,'UTF8')),'hex'),now()+interval '30 days' FROM "+q+"generation_keys WHERE job_id IN ("+expired+") ON CONFLICT DO NOTHING").run(id,...args);
   await this.db.prepare('DELETE FROM '+q+'generation_keys WHERE job_id IN ('+expired+')').run(...args);
   await this.db.prepare('DELETE FROM '+q+'generation_records WHERE id IN ('+expired+')').run(...args);
   await this.db.prepare("DELETE FROM "+q+"ad_batches b WHERE NOT EXISTS (SELECT 1 FROM json_array_elements_text(b.job_ids::json) j JOIN "+q+"generation_records g ON g.id=j.value)").run();
   await this.db.prepare('DELETE FROM '+q+'generation_assets a WHERE NOT EXISTS (SELECT 1 FROM storage_objects o WHERE o.user_id=? AND split_part(split_part(o.path,\'/\',2),\'.\',1)=a.hash)').run(id);
   await this.db.prepare("UPDATE "+q+"assistant_requests SET response_json=NULL WHERE response_json IS NOT NULL AND created_at<extract(epoch FROM now()-interval '24 hours')*1000 AND (created_at>=extract(epoch FROM ?::timestamptz)*1000 OR now()>=?::timestamptz)").run(...args);
  });
 }
 async exists(schema,table){return (await this.db.prepare('SELECT to_regclass(?) IS NOT NULL AS ok').get(schema+'.'+table)).ok;}
 async erase(id,receipt){
  const tenant=cloudSchema(id);
  // Enumerate the actual private prefix as well as upload reservations. Only an
  // empty physical listing after deletion permits removing the account.
  const rows=await this.db.prepare('SELECT path FROM storage_objects WHERE user_id=?').all(id);
  for(const row of rows)await this.storage.remove(id,row.path);
  for(let page=0;page<20;page++){
   const list=await this.storage.call('/storage/v1/object/list/'+this.storage.bucket,{method:'POST',body:{prefix:id+'/',limit:100,offset:0}});
   if(!list.ok)throw Error('STORAGE_LIST_FAILED');
   const objects=await list.json();if(!Array.isArray(objects))throw Error('INVALID_STORAGE_LIST');
   if(!objects.length)break;
   for(const item of objects){if(typeof item.name!=='string'||!item.name||item.name.includes('/'))throw Error('UNEXPECTED_STORAGE_OBJECT');await this.storage.remove(id,id+'/'+item.name);}
   if(page===19)throw Error('STORAGE_DELETE_CONTINUES');
  }
  const identity=await this.db.prepare('SELECT email FROM email_identities WHERE user_id=?').get(id);
  if(identity)await this.removeMailIdentity(identity.email);
  await this.store.transaction(async()=>{
   // The beta accepts test orders only. Any future real billing integration must
   // archive legally required transaction fields separately before enabling sales.
   if(await this.exists('aiadcast_accounts','dimension_analysis_calls'))await this.db.prepare('DELETE FROM dimension_analysis_calls WHERE actor_id=?').run(id);
   const owner=await this.db.prepare('SELECT role FROM users WHERE id=?').get(id);
   if(owner?.role==='admin')await this.db.prepare("INSERT INTO settings(key,value) VALUES('owner_withdrawn',1) ON CONFLICT(key) DO UPDATE SET value=1").run();
   if(identity){
    await this.db.prepare('DELETE FROM email_requests WHERE email=?').run(identity.email);
    await this.db.prepare('DELETE FROM test_auth_attempts WHERE email_hash=?').run(createHash('sha256').update(identity.email).digest('hex'));
   }
   await this.db.prepare('DELETE FROM google_requests WHERE state_hash IN (SELECT state_hash FROM google_link_requests WHERE user_id=?) OR state_hash IN (SELECT state_hash FROM google_native_requests WHERE claims IS NOT NULL AND (claims::json->>\'email\'=? OR claims::json->>\'subject\' IN (SELECT subject FROM google_identities WHERE user_id=?)))').run(id,identity?.email??'',id);
   for(const name of ['projects','google_link_requests','email_identities','google_identities','test_passwords','test_orders','invites','sessions'])await this.db.prepare('DELETE FROM '+name+' WHERE user_id=?').run(id);
   await this.db.prepare('DELETE FROM admin_grants WHERE user_id=? OR actor_id=?').run(id,id);
   await this.db.prepare('DELETE FROM admin_audit WHERE target_id=? OR actor_id=?').run(id,id);
   await this.db.prepare('DELETE FROM monthly_demo_support WHERE owner_id=? OR user_id=? OR period IN (SELECT period FROM monthly_budget_approvals WHERE user_id=?)').run(id,id,id);
   await this.db.prepare('DELETE FROM monthly_budget_approvals WHERE user_id=?').run(id);
   // Tenant name is generated exclusively from the authenticated account's UUID.
   if(await this.exists(tenant,'defect_reports')){
    await this.db.prepare('INSERT INTO protected_complaints(case_id,received_at,description,resolution,erase_at) SELECT id,to_timestamp(created_at/1000.0),description,resolution,to_timestamp(created_at/1000.0)+interval \'3 years\' FROM "'+tenant+'".defect_reports WHERE to_timestamp(created_at/1000.0)+interval \'3 years\'>now() ON CONFLICT DO NOTHING').run();
   }
   await this.db.exec('DROP SCHEMA IF EXISTS "'+tenant+'" CASCADE');
   await this.db.prepare('DELETE FROM deletion_requests WHERE user_id=? AND receipt=?').run(id,receipt);
   await this.db.prepare('DELETE FROM users WHERE id=?').run(id);
   await this.db.prepare("INSERT INTO member_events(receipt,kind) VALUES(?,'completed')").run(receipt);
  });
  this.jobs.delete(id);this.forgetService?.(id);
 }
 async removeMailIdentity(email){
  if(!await this.exists('auth','users'))return;
  const matches=await this.db.prepare('SELECT id FROM auth.users WHERE lower(email)=lower(?)').all(email);
  for(const row of matches){
   const response=await this.storage.call('/auth/v1/admin/users/'+encodeURIComponent(row.id),{method:'DELETE'});
   if(!response.ok&&response.status!==404)throw Error('AUTH_DELETE_FAILED');
  }
 }
}
