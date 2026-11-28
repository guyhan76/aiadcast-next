import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {CloudGenerationService} from '../server/cloud/beta.mjs';
import {GenerationService as OldHistory} from '../server/cloud/generation-base.mjs';
import {PostgresDatabase} from '../server/cloud/postgres.mjs';
async function fixture(t){
 const engine=new PGlite();await engine.waitReady;let tail=Promise.resolve();const statements=[];
 const pool={async connect(){let unlock;const before=tail;tail=new Promise(r=>unlock=r);await before;return {async query(sql,args=[]){statements.push(sql);const r=!args.length&&sql.trim().split(';').filter(Boolean).length>1?(await engine.exec(sql)).at(-1):await engine.query(sql,args);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>{const f=r.fields.find(f=>f.name===k);return [k,v!==null&&[20,1700].includes(f?.dataTypeID)?pg.types.getTypeParser(f.dataTypeID)(String(v)):v];}))),rowCount:r.affectedRows};},release:unlock};}};
 t.after(()=>engine.close());const services=[];
 for(const suffix of ['a','b']){const schema='aiadcast_user_'+suffix.repeat(32);await engine.exec(`CREATE SCHEMA ${schema}`);const db=new PostgresDatabase(pool,schema);services.push(await new CloudGenerationService().initialize({db,enabled:true,providerConfigured:true,budgetMicros:2000000,adapter:{generate(){throw Error('no provider');}}}));}
 return {services,statements};
}
async function seed(s,n){
 for(let i=0;i<n;i++){
  const id='history-'+String(i).padStart(3,'0'),state=['reserved','running','uncertain','ready','accepted','released','refunded'][i%7];
  await s.db.prepare('INSERT INTO jobs(id,user_id,credits,request_hash,model_revision,kind,status,expires_at,artifact_id,reason) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'aiadcast-next-local-developer',1,'hash','fixture','image',state,1900000000000,'asset-'+i,i%2?'customer_rejected':'system_error');
  const request={mode:'creative',productName:'Fixture',output:{format:'9:16'},dimensionDisplay:{method:'ai',layout:'direct'},dimensionPlan:{fixture:i},inputMode:i%2?'text-example':undefined};
  const metadata={model:'fixture',revision:'fixture',usage:{output_tokens:1},cost:{microUsd:1},composition:'complete-ad',planarReport:{originalHash:'not-read'}};
  await s.db.prepare('INSERT INTO generation_records(id,project_id,fingerprint,request_json,artifact_hash,error_code,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,i%2?'project-one':'project-two','hash',JSON.stringify(request),'asset-'+i,i%8===0?'PROVIDER_UNCERTAIN':i%8===1?'PROVIDER_HTTP':null,JSON.stringify(metadata),1700000000000+i);
  if(i%3===0)await s.db.prepare('INSERT INTO job_policies VALUES(?,?,?,?)').run(id,'credit-v2','delivered-2026-10-18',i%2);
  if(i%4===0)await s.db.prepare('INSERT INTO admin_test_jobs VALUES(?)').run(id);
  if(i%5===0)await s.db.prepare('INSERT INTO defect_reports(id,job_id,description,created_at) VALUES(?,?,?,?)').run('report-'+i,id,'fixture',1);
  for(const prefix of ['z','a'])await s.db.prepare('INSERT INTO generation_keys VALUES(?,?,?)').run(prefix+'-request-'+i,'hash',id);
 }
}
const dataQueries=xs=>xs.filter(x=>!/^SET |^BEGIN|^COMMIT|^ROLLBACK/.test(x));
test('PostgreSQL batch preserves empty/full/filter/state/metadata/key order and uses three data queries',async t=>{
 const {services:[s],statements}=await fixture(t);
 statements.length=0;assert.deepEqual(await s.history(),{jobs:[],wallet:await s.wallet()});assert.equal(dataQueries(statements).length,5); // history 3 + comparison wallet 2
 await seed(s,35);
 for(const project of [undefined,'project-one','project-empty']){
  const expected=await OldHistory.prototype.history.call(s,project);statements.length=0;const actual=await s.history(project);
  assert.deepEqual(actual,expected);assert.equal(dataQueries(statements).length,3);
  assert.ok(actual.jobs.every(j=>j.artifact===null&&!j.planarOriginal));
 }
 assert.equal((await s.history()).jobs.length,30);
 assert.equal((await s.requestStatus('z-request-0','project-two')).state,'found'); // outside recent 30
 const before=statements.length;await assert.rejects(s.history("bad' project"),e=>e.code==='INVALID_PROJECT_ID');assert.equal(statements.length,before);
});
test('shared PostgreSQL pool keeps same job IDs tenant-scoped across interleaved reads and updates',async t=>{
 const {services:[a,b]}=await fixture(t);await seed(a,8);await seed(b,8);
 await b.db.prepare("UPDATE generation_records SET error_code='TENANT_B'").run();
 const [ra,rb]=await Promise.all([a.history(),b.history()]);assert.ok(ra.jobs.every(j=>j.errorCode!=='TENANT_B'));assert.ok(rb.jobs.every(j=>j.errorCode==='TENANT_B'));
 await a.db.prepare("UPDATE jobs SET status='accepted' WHERE id=?").run('history-007');
 assert.equal((await a.history()).jobs[0].state,'accepted');assert.equal((await b.history()).jobs[0].state,'failed');
 // A change after the metadata SELECT cannot mutate the already assembled snapshot.
 const all=a.db.prepare.bind(a.db);let changed=false;
 a.db.prepare=sql=>{const q=all(sql);if(sql.startsWith('WITH recent'))return {...q,all:async(...args)=>{const rows=await q.all(...args);if(!changed){changed=true;await all("UPDATE jobs SET status='refunded' WHERE id=?").run('history-007');}return rows;}};return q;};
 assert.equal((await a.history()).jobs[0].state,'accepted');assert.equal((await a.history()).jobs[0].state,'refunded');
});
test('missing billing row fails closed and does not invent a completed result',async()=>{
 const s=new CloudGenerationService();s.db={prepare:()=>({all:async()=>[{id:'history-001',history_billing_id:null}]})};s.wallet=()=>{throw Error('must stop before wallet');};
 await assert.rejects(s.history(),/Job not found/);
});
test('optional metadata and keys preserve defaults; malformed JSON and unsafe integers fail closed',async t=>{
 const {services:[s]}=await fixture(t);await seed(s,14);
 await s.db.prepare('DELETE FROM generation_keys WHERE job_id=?').run('history-013');
 await s.db.prepare('UPDATE generation_records SET metadata_json=NULL WHERE id=?').run('history-013');
 const expected=await OldHistory.prototype.history.call(s);const actual=await s.history();assert.deepEqual(actual,expected);
 const j=actual.jobs[0];assert.deepEqual(j.requestIds,[]);assert.equal(j.requestId,null);assert.equal(j.creditUnit,'legacy-ticket');assert.equal(j.usage,null);assert.equal(j.cost,null);
 const states=new Set(actual.jobs.map(j=>j.state));for(const state of ['uncertain','failed','ready','accepted','rejected','expired','refunded','running'])assert.ok(states.has(state),state);
 await s.db.prepare('UPDATE generation_records SET metadata_json=? WHERE id=?').run('{broken','history-013');
 await assert.rejects(s.history(),SyntaxError);
 await s.db.prepare('UPDATE generation_records SET metadata_json=NULL WHERE id=?').run('history-013');
 await s.db.prepare('UPDATE jobs SET expires_at=? WHERE id=?').run('9007199254740993','history-013');
 await assert.rejects(s.history(),/UNSAFE_DATABASE_INTEGER/);
});
test('persisted malformed IDs retain JOB_NOT_FOUND/404 before serialization',async t=>{
 const {services:[s]}=await fixture(t);
 const sameError=e=>e.code==='JOB_NOT_FOUND'&&e.status===404&&e.message==='JOB_NOT_FOUND';
 for(const id of ['x','bad id--','a'.repeat(101)]){
  await s.db.prepare('INSERT INTO jobs(id,user_id,credits,request_hash,model_revision,kind,status,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id,'aiadcast-next-local-developer',1,'hash','fixture','image','accepted',1900000000000);
  await s.db.prepare('INSERT INTO generation_records(id,project_id,fingerprint,request_json,created_at) VALUES(?,?,?,?,?)').run(id,'project-one','hash','{broken',1700000000000);
  // Malformed JSON must not mask the earlier identity error.
  await assert.rejects(s.job(id),sameError);
  await assert.rejects(OldHistory.prototype.history.call(s),sameError);
  await assert.rejects(s.history(),sameError);
  await assert.rejects(s.history('project-one'),sameError);
  await s.db.prepare('DELETE FROM generation_records WHERE id=?').run(id);
  await s.db.prepare('DELETE FROM jobs WHERE id=?').run(id);
 }
});
test('fixed response fixtures independently pin ready credit and uncertain admin history fields',async t=>{
 const {services:[s]}=await fixture(t);await seed(s,4);
 const {jobs,wallet}=await s.history();
 const common={dimensionDisplay:{method:'ai',layout:'direct'},planarReport:{originalHash:'not-read'},projectId:'project-one',mode:'creative',sourceHash:null,model:'fixture',quality:'high',outputFormat:'9:16',composition:'complete-ad',compositionKey:undefined,artifact:null,usage:{output_tokens:1},cost:{microUsd:1},providerRequestId:null,marketingPlan:null,review:'human-review-required',expiresAt:1900000000000};
 assert.deepEqual(jobs[0],{...common,id:'history-003',requestFingerprint:'0052cdfbb3a1cb17512034be557ce47bb1356fc63b06ac4dfb710262c650dd21',dimensionPlan:{fixture:3},inputMode:'text-example',creditUnit:'credit-v2',creditPolicy:'delivered-2026-10-18',creditCost:1,creditCaptured:true,requestId:'z-request-3',requestIds:['z-request-3','a-request-3'],state:'ready',createdAt:'2023-11-14T22:13:20.003Z',artifactId:'asset-3',errorCode:null,billingStatus:'ready'});
 assert.deepEqual(jobs[3],{...common,id:'history-000',requestFingerprint:'8e9c43f3c7efc7a199165cdd43df9abccd2a4326a5e5ecfea9525244be46d536',dimensionPlan:{fixture:0},projectId:'project-two',creditUnit:'credit-v2',creditPolicy:'admin-unlimited',creditCost:0,creditCaptured:false,defectReport:{state:'pending'},requestId:'z-request-0',requestIds:['z-request-0','a-request-0'],state:'uncertain',createdAt:'2023-11-14T22:13:20.000Z',artifactId:'asset-0',errorCode:'PROVIDER_UNCERTAIN',billingStatus:'reserved'});
 assert.deepEqual(wallet,{available:3,reserved:0,credits:{available:0,reserved:0},kind:'test-credits'});
});
