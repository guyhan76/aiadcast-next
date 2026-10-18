import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import sharp from 'sharp';
import {hashBytes} from '../server/openai-image-adapter.mjs';
import {BetaStore} from '../server/beta-store.mjs';
import {GenerationService} from '../server/generation-service.mjs';
import {AdminApi} from '../server/admin-api.mjs';
import {BetaStore as CloudStore} from '../server/cloud/beta-store-base.mjs';
import {CloudGenerationService as CloudGeneration} from '../server/cloud/beta.mjs';
import {AdminApi as CloudAdmin} from '../server/cloud/admin-api-base.mjs';
import {PostgresDatabase,cloudSchema} from '../server/cloud/postgres.mjs';

// Real PostgreSQL SQL/transactions via PGlite; no network or paid provider.
async function poolFixture(){
 const engine=new PGlite();await engine.waitReady;let tail=Promise.resolve();
 return {engine,async connect(){let unlock;const before=tail;tail=new Promise(r=>unlock=r);await before;return {async query(sql,args=[]){
  const r=!args.length&&sql.trim().split(';').filter(s=>s.trim()).length>1?(await engine.exec(sql)).at(-1):await engine.query(sql,args);
  const rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>{const f=r.fields.find(f=>f.name===k);return [k,v!==null&&[20,1700].includes(f?.dataTypeID)?pg.types.getTypeParser(f.dataTypeID)(String(v)):v];})));
  return {...r,rows,rowCount:r.command==='SELECT'?rows.length:r.affectedRows};},release:unlock};},async end(){await tail;await engine.close();}};
}
async function setup(t,cloud,{ownerBudget=1000000}={}){
 let time=Date.parse('2026-10-18T00:00:00Z'),store,service,admin;
 const now=()=>time,dir=mkdtempSync(join(tmpdir(),'october-budget-')),pool=cloud?await poolFixture():null;
 const accountDb=cloud?await new PostgresDatabase(pool,'aiadcast_accounts').initialize():null;
 const openStore=async()=>cloud?await new CloudStore().initialize(accountDb,{monthlyBudgetMicros:1000000,now}):new BetaStore(dir,{monthlyBudgetMicros:1000000,now});
 store=await openStore();const id=(await store.provision({label:'Owner',credits:0,budgetMicros:ownerBudget})).userId;await store.setRole(id,'admin');
 await store.db.exec('CREATE TABLE IF NOT EXISTS email_identities(email TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL REFERENCES users(id));');
 await store.db.prepare('INSERT INTO email_identities VALUES(?,?)').run('owner@example.com',id);
 const actor={id,role:'admin'},generationDb=cloud?await new PostgresDatabase(pool,cloudSchema(id)).initialize():null;
 const objects=new Map();
 const openService=async()=>{
  const options={databasePath:join(dir,'generation.sqlite'),db:generationDb,budgetMicros:ownerBudget,managedBudgetIncrease:true,testCredits:0,enabled:true,providerConfigured:true,budgetForPeriod:p=>store.effectiveBudget(id,p),now};
  if(cloud){service=new CloudGeneration();service.cloudUser=id;service.storage={put:async(user,key,bytes)=>objects.set(user+'/'+key,Buffer.from(bytes)),get:async(user,key)=>objects.get(key)};await service.initialize(options);}else service=new GenerationService(options);service.adminTestUnlimited=true;
  const config={ownerEmail:'owner@example.com',service:()=>service,accounts:{},checkout:{available:()=>false},now};
  admin=cloud?await new CloudAdmin().initialize(store,config):new AdminApi(store,config);
 };
 await openService();t.after(async()=>{await service.close();await store.close();if(pool)await pool.end();rmSync(dir,{recursive:true,force:true});});
 return {get store(){return store;},get service(){return service;},get admin(){return admin;},actor,id,now,advance:v=>{time=Date.parse(v);},async restart(){await service.close();await store.close();store=await openStore();await openService();}};
}
for(const cloud of [false,true]){
 const name=cloud?'PostgreSQL':'SQLite';
 test(name+': fixed October approval preserves usage/holds, survives restart and expires without changing baseline',async t=>{
  const s=await setup(t,cloud),db=s.service.db;
  await db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-09',1000000,300000,100000);
  await db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',1000000,527300,100000);
  assert.equal((await s.service.status()).generation.reason,'BUDGET_NOT_AVAILABLE');
  assert.equal((await s.admin.octoberApproval(s.actor)).eligible,true);
  await s.admin.activateOctoberBudget(s.actor,{});await s.admin.activateOctoberBudget(s.actor,{});
  let status=await s.service.status();assert.equal(status.budget.limitMicros,5000000);assert.equal(status.budget.spentMicros,527300);assert.equal(status.budget.heldMicros,100000);assert.equal(status.generation.enabled,true);assert.equal(status.assistant.available,false);
  assert.equal(s.store.cap,1000000);assert.equal((await s.store.db.prepare('SELECT budget FROM users WHERE id=?').get(s.id)).budget,1000000);
  assert.equal((await s.store.db.prepare('SELECT COUNT(*) n FROM monthly_budget_approvals').get()).n,1);
  const reserve=async(id,period,limit)=>{await s.service.ledger.reserve({jobId:id,userId:'owner',credits:1,creditExempt:true,requestHash:id,modelRevision:'fixture',expiresAt:s.now()+60000});return s.service.ledger.beginAttempt({jobId:id,attemptId:id,period,limitMicros:limit,maximumMicros:500000,periodScoped:true});};
  await reserve('october-job','2026-10',await s.service.budgetLimit('2026-10'));
  await s.service.ledger.settleAttempt('october-job',1000,'completed');
  const october=await s.service.ledger.budget('2026-10');assert.equal(october.spent_micros,528300);assert.equal(october.held_micros,100000);
  await s.restart();assert.equal((await s.service.status()).budget.limitMicros,5000000);assert.deepEqual(await s.service.ledger.budget('2026-10'),october);
  s.advance('2026-11-01T00:00:00Z');status=await s.service.status();assert.equal(status.budget.limitMicros,1000000);assert.equal(status.budget.spentMicros,0);assert.equal(status.budget.heldMicros,0);assert.equal(await s.store.effectiveCap(),1000000);
  await assert.rejects(async()=>s.admin.activateOctoberBudget(s.actor,{}),/MONTH_APPROVAL_NOT_AUTHORIZED/);
  await reserve('november-job','2026-11',await s.service.budgetLimit('2026-11'));
  assert.equal((await s.service.ledger.budget('2026-11')).limit_micros,1000000);assert.deepEqual(await s.service.ledger.budget('2026-10'),october);
  assert.deepEqual(await s.service.ledger.budget('2026-09'),{period:'2026-09',limit_micros:1000000,spent_micros:300000,held_micros:100000});
 });
 test(name+': owner identity, fixed amount, member isolation and role revocation protect the approved scope',async t=>{
  const s=await setup(t,cloud,{ownerBudget:0}),other=(await s.store.provision({label:'Other',credits:0})).userId;
  await assert.rejects(async()=>s.admin.activateOctoberBudget({id:other,role:'member'},{}),/ADMIN_REQUIRED/);
  await s.store.setRole(other,'admin');await assert.rejects(async()=>s.admin.activateOctoberBudget({id:other,role:'admin'},{}),/MONTH_APPROVAL_NOT_AUTHORIZED/);
  for(const body of [{totalMicros:10000000},{period:'2026-11'},{userId:other},null,[]])await assert.rejects(async()=>s.admin.activateOctoberBudget(s.actor,body),/INVALID_MONTH_APPROVAL/);
  await s.admin.activateOctoberBudget(s.actor,{});assert.equal(await s.store.effectiveBudget(other,'2026-10'),0);
  await assert.rejects(async()=>s.store.setAllocation(other,1),/BETA_ALLOCATION_EXCEEDED/);
  await assert.rejects(async()=>s.store.provision({label:'Oversubscription',budgetMicros:1}),/BETA_ALLOCATION_EXCEEDED/);
  await s.store.setRole(s.id,'member');assert.equal(await s.store.effectiveBudget(s.id,'2026-10'),0);
  await assert.rejects(async()=>s.store.setAllocation(other,1),/BETA_ALLOCATION_EXCEEDED/);
  assert.equal(await s.store.effectiveCap(),5000000);
 });
 test(name+': conflicting allocation is unchanged and no approval record is written',async t=>{
  const s=await setup(t,cloud,{ownerBudget:500000});await s.store.provision({label:'Funded member',budgetMicros:500000});
  await assert.rejects(async()=>s.admin.activateOctoberBudget(s.actor,{}),/MONTH_APPROVAL_CONFLICT/);
  assert.equal((await s.store.db.prepare('SELECT COUNT(*) n FROM monthly_budget_approvals').get()).n,0);assert.equal(await s.store.effectiveCap(),1000000);
 });
 test(name+': repeated activation and concurrent admissions cannot add five dollars or exceed the total',async t=>{
  const s=await setup(t,cloud);
  await Promise.all(Array.from({length:4},()=>s.admin.activateOctoberBudget(s.actor,{})));
  await s.service.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',1000000,4400000,100000);
  const reserve=async()=>{const id=randomUUID();await s.service.ledger.reserve({jobId:id,userId:'owner',credits:1,creditExempt:true,requestHash:id,modelRevision:'fixture',expiresAt:s.now()+60000});return s.service.ledger.beginAttempt({jobId:id,attemptId:id,period:'2026-10',limitMicros:await s.service.budgetLimit('2026-10'),maximumMicros:500000,periodScoped:true});};
  const results=await Promise.allSettled([reserve(),reserve(),reserve()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(results.filter(r=>r.status==='rejected').every(r=>/Provider budget unavailable/.test(r.reason.message)));
  const budget=await s.service.ledger.budget('2026-10');assert.equal(budget.limit_micros,5000000);assert.equal(budget.spent_micros+budget.held_micros,5000000);assert.equal((await s.service.status()).generation.enabled,false);
  await s.admin.activateOctoberBudget(s.actor,{});assert.deepEqual(await s.service.ledger.budget('2026-10'),budget);
 });
 test(name+': fake provider dispatch uses the approved limit, preserves credit exemption and stops when exhausted',async t=>{
  const s=await setup(t,cloud);let calls=0;
  const bytes=await sharp({create:{width:8,height:8,channels:4,background:'#eee'}}).png().toBuffer();
  s.service.adapter={generate:async()=>{calls++;return {bytes,mime:'image/png',width:8,height:8,sha256:hashBytes(bytes),role:'creative',usage:{},cost:{microUsd:1000},model:'local-fixture'};}};
  const request=()=>({requestId:randomUUID(),projectId:randomUUID(),request:{version:1,mode:'creative',operation:'image-ad-creative',subjectType:'service',productName:'Local fixture',brief:'',output:{format:'1:1',locale:'ko'},specifications:[]}});
  await s.service.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',1000000,527300,0);
  await assert.rejects(()=>s.service.create(request()),/BUDGET_NOT_AVAILABLE/);assert.equal(calls,0);
  await s.admin.activateOctoberBudget(s.actor,{});
  const body=request(),created=await s.service.create(body);await s.service.waitForIdle();
  assert.equal((await s.service.job(created.job.id)).state,'ready');assert.equal(calls,1);assert.equal((await s.service.create(body)).reused,true);assert.equal(calls,1);
  await s.service.accept(created.job.id,hashBytes(bytes));assert.equal((await s.service.wallet()).available,0);assert.equal((await s.service.wallet()).reserved,0);
  assert.equal((await s.service.ledger.budget('2026-10')).spent_micros,528300);assert.equal((await s.service.ledger.budget('2026-10')).held_micros,0);
  await s.service.db.prepare('UPDATE budgets SET spent_micros=? WHERE period=?').run(4500001,'2026-10');
  await assert.rejects(()=>s.service.create(request()),/BUDGET_NOT_AVAILABLE/);assert.equal(calls,1);
  s.service.assistantEnabled=true;assert.equal((await s.service.status()).assistant.available,false);
 });
 test(name+': text assistant remains limited to the baseline despite the image approval',async t=>{
  const s=await setup(t,cloud);let calls=0;s.service.assistantEnabled=true;
  s.service.assistantAdapter=async()=>{calls++;return {proposal:{title:'Local',description:'Fixture'},cost:{microUsd:1}};};
  await s.admin.activateOctoberBudget(s.actor,{});
  await s.service.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',500000,527300,0);
  const request=()=>({requestId:randomUUID(),kind:'suggest',sourceLocale:'ko',targetLocale:'ko',copy:{title:'Local',description:'Fixture'}});
  await s.service.assist(request());assert.equal(calls,1);assert.equal((await s.service.ledger.budget('2026-10')).spent_micros,527301);
  await s.service.db.prepare('UPDATE budgets SET spent_micros=? WHERE period=?').run(980000,'2026-10');
  assert.equal((await s.service.status()).generation.enabled,true);assert.equal((await s.service.status()).assistant.available,false);
  await assert.rejects(()=>s.service.assist(request()),/BUDGET_NOT_AVAILABLE/);assert.equal(calls,1);
 });
 test(name+': UTC rollover between authorization and reservation rejects stale October admission',async t=>{
  const s=await setup(t,cloud);await s.admin.activateOctoberBudget(s.actor,{});const limit=await s.service.budgetLimit('2026-10');
  await s.service.ledger.reserve({jobId:'boundary',userId:'owner',credits:1,creditExempt:true,requestHash:'boundary',modelRevision:'fixture',expiresAt:Date.parse('2026-11-02')});
  s.advance('2026-11-01T00:00:00Z');await assert.rejects(async()=>s.service.ledger.beginAttempt({jobId:'boundary',attemptId:'boundary',period:'2026-10',limitMicros:limit,maximumMicros:500000,periodScoped:true}),/BUDGET_PERIOD_CHANGED/);
  assert.equal(await s.service.ledger.budget('2026-10'),null);await assert.rejects(async()=>s.service.budgetLimit('2026-10'),/BUDGET_PERIOD_CHANGED/);
 });
}
