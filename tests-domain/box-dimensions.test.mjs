import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {PostgresDatabase} from '../server/cloud/postgres.mjs';
import {boxDimensions} from '../server/box-dimensions.mjs';
async function poolFixture(){
 const engine=new PGlite();await engine.waitReady;let tail=Promise.resolve();
 return {engine,async connect(){let unlock;const before=tail;tail=new Promise(r=>unlock=r);await before;return {async query(sql,args=[]){
  const r=!args.length&&sql.trim().split(';').filter(s=>s.trim()).length>1?(await engine.exec(sql)).at(-1):await engine.query(sql,args);
  const rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>{const f=r.fields.find(f=>f.name===k);return [k,v!==null&&[20,1700].includes(f?.dataTypeID)?pg.types.getTypeParser(f.dataTypeID)(String(v)):v];})));
  return {...r,rows,rowCount:r.command==='SELECT'?rows.length:r.affectedRows};},release:unlock};},async end(){await tail;await engine.close();}};
}

const proposal=()=>({located:true,product:[.1,.2,.4,.35],axes:{width:[[.12,.5],[.36,.5]],depth:[[.36,.5],[.48,.4]],height:[[.48,.4],[.48,.22]]},protectedText:[[.1,.04,.8,.08]],existingAnnotations:[],inset:[.65,.35,.3,.4]});
async function setup(t){
 const pool=await poolFixture();t.after(()=>pool.end());const db=await new PostgresDatabase(pool,'aiadcast_accounts').initialize();
 const bytes=await sharp({create:{width:80,height:100,channels:3,background:'white'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
 await db.exec('CREATE TABLE budgets(period TEXT PRIMARY KEY,limit_micros INTEGER NOT NULL,spent_micros INTEGER NOT NULL DEFAULT 0,held_micros INTEGER NOT NULL DEFAULT 0)');
 await db.exec('CREATE TABLE generation_records(id TEXT PRIMARY KEY,request_json TEXT,artifact_hash TEXT)');
 const req={mode:'creative',productProfile:{category:'boxes',specType:'rectangular'}};
 await db.prepare('INSERT INTO generation_records VALUES(?,?,?)').run('owned-job-1',JSON.stringify(req),hash);
 const user={id:'owner-user-1'},body={jobId:'owned-job-1',sourceHash:hash,requestId:'request-0001'};
 let calls=0,kind='ready';
 const approval={id:'mock-approval-1',userId:user.id,hashes:[hash],expiresAt:Date.now()+60000,maxCalls:2,maxMicros:60000};
 const service=async u=>({period:()=> '2026-10',budgetLimit:async()=>1000000,db:u.id===user.id?db:{prepare:()=>({get:async()=>null})},job:async()=>({state:'ready',composition:'complete-ad',artifact:{dataUrl:'data:image/png;base64,'+bytes.toString('base64'),sha256:hash,width:80,height:100}})});
 const analyze=async o=>{calls++;assert.deepEqual(o.bytes,bytes);assert.match(o.analysisInstruction,/excluding open flaps/);const id=await o.ledger.reserve();await o.ledger.settle(id,kind==='uncertain'?null:10000);return {sourceHash:hash,...(kind==='ready'?{proposal:proposal()}:{})};};
 const options={db,service,approval,apiKey:'mock-existing-key',analyze};const make=()=>boxDimensions(options);
 return {db,user,body,options,make,api:make(),calls:()=>calls,kind:v=>kind=v};
}
test('default off, owned result, shape, approval hash and payload restrictions precede paid dispatch',async t=>{
 const s=await setup(t);const off=boxDimensions({...s.options,approval:null});assert.equal(off.capability(s.user).available,false);await assert.rejects(off.request(s.user,s.body),/NOT_APPROVED/);
 await assert.rejects(s.api.request({id:'another-user'},s.body),/JOB_NOT_FOUND/);
 await assert.rejects(s.api.request(s.user,{...s.body,source:'data:secret'}),/INVALID_BOX_ANALYSIS/);
 await assert.rejects(s.api.request(s.user,{...s.body,sourceHash:'a'.repeat(64)}),/JOB_NOT_FOUND/);
 await s.db.prepare('UPDATE generation_records SET request_json=?').run(JSON.stringify({mode:'creative',productProfile:{category:'bags',specType:'rectangular'}}));await assert.rejects(s.api.request(s.user,s.body),/BOX_SCOPE_REQUIRED/);assert.equal(s.calls(),0);
});
test('same request and process restart return saved coordinates; concurrent new request cannot duplicate a pending call',async t=>{
 const s=await setup(t);let release,entered;const started=new Promise(r=>entered=r),wait=new Promise(r=>release=r),original=s.options.analyze;
 s.options.analyze=async o=>{entered();await wait;return original(o);};const api=s.make(),first=api.request(s.user,s.body);await started;
 const pending=await api.request(s.user,s.body);assert.equal(pending.state,'uncertain');await assert.rejects(api.request(s.user,{...s.body,requestId:'request-0002'}),/RECONCILIATION/);
 release();const result=await first;assert.equal(result.state,'ready');assert.equal(result.verified,false);assert.deepEqual(await s.make().request(s.user,s.body),result);assert.equal(s.calls(),1);
});
test('known location failure can retry once on same image; uncertain cost blocks new requests across restart',async t=>{
 const s=await setup(t);s.kind('failed');assert.equal((await s.api.request(s.user,s.body)).state,'failed');s.kind('ready');assert.equal((await s.api.request(s.user,{...s.body,requestId:'request-0002'})).state,'ready');await assert.rejects(s.api.request(s.user,{...s.body,requestId:'request-0003'}),/LIMIT/);assert.equal(s.calls(),2);
});
test('unknown provider cost remains durable and no repeated request invokes provider again',async t=>{
 const s=await setup(t);s.kind('uncertain');const r=await s.api.request(s.user,s.body);assert.equal(r.state,'uncertain');assert.deepEqual(await s.make().request(s.user,s.body),r);await assert.rejects(s.make().request(s.user,{...s.body,requestId:'request-0002'}),/RECONCILIATION/);assert.equal(s.calls(),1);assert.equal((await s.db.prepare('SELECT state FROM box_dimension_calls').get()).state,'uncertain');
});
test('expired approval can recover a saved result but cannot dispatch another analysis',async t=>{
 const s=await setup(t),r=await s.api.request(s.user,s.body);s.options.approval.expiresAt=1;const api=s.make();assert.equal(api.capability(s.user).available,false);assert.deepEqual(await api.request(s.user,s.body),r);await assert.rejects(api.request(s.user,{...s.body,requestId:'request-0002'}),/NOT_APPROVED/);assert.equal(s.calls(),1);
});
test('existing transport uses only result pixels, strict box instruction and records malformed paid response cost',async t=>{
 const s=await setup(t);let sent=0;delete s.options.analyze;s.options.fetchImpl=async(url,options)=>{sent++;assert.equal(url,'https://api.openai.com/v1/chat/completions');const p=JSON.parse(options.body);assert.equal(p.store,false);assert.equal(p.n,1);assert.equal(p.max_completion_tokens,1500);assert.equal(p.messages[1].content.length,1);return new Response(JSON.stringify({usage:{prompt_tokens:1000,completion_tokens:100},choices:[{finish_reason:'stop',message:{content:JSON.stringify({located:false})}}]}),{headers:{'Content-Type':'application/json'}});};
 const r=await s.make().request(s.user,s.body);assert.equal(r.state,'failed');const row=await s.db.prepare('SELECT * FROM box_dimension_calls').get();assert.equal(row.state,'settled');assert.equal(row.actual,1200);assert.equal(sent,1);const b=await s.db.prepare('SELECT * FROM budgets').get();assert.equal(b.spent_micros,1200);assert.equal(b.held_micros,0);
});

test('analysis shares existing generation budget; insufficient funds do not dispatch and unknown holds remain',async t=>{
 const s=await setup(t);await s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',1000000,980000,0);
 await assert.rejects(s.api.request(s.user,s.body),/BUDGET_NOT_AVAILABLE/);assert.equal(s.calls(),0);assert.equal((await s.db.prepare('SELECT count(*) n FROM box_dimension_calls').get()).n,0);
 await s.db.prepare('UPDATE budgets SET spent_micros=0').run();s.kind('uncertain');await s.api.request(s.user,s.body);const b=await s.db.prepare('SELECT * FROM budgets').get();assert.equal(b.held_micros,30000);assert.equal(b.spent_micros,0);
});
