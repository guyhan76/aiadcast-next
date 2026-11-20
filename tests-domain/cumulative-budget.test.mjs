import test from 'node:test';
import assert from 'node:assert/strict';
import {BillingLedger} from '../server/billing.mjs';
import {GenerationService} from '../server/generation-service.mjs';
import {cumulativeBudgetView} from '../server/cumulative-budget.mjs';
import {auditSupplierHistory} from '../server/cumulative-budget-audit.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',start=Date.UTC(2026,10,6),user='aiadcast-next-local-developer';
function activate(l){l.budgetOwner=owner;l.budgetAdmin=true;l.db.prepare("INSERT INTO supplier_budget_policy VALUES(1,?,100000000,'all-history',0,?)").run(owner,start);}
function reserve(l,id,period,amount=500000){l.reserve({jobId:id,userId:user,kind:'image',credits:1,creditExempt:true,requestHash:id,modelRevision:'mock',expiresAt:start+1e12});return l.beginAttempt({jobId:id,attemptId:'attempt-'+id,period,maximumMicros:amount,limitMicros:1000000,periodScoped:true});}
function ledger(t){let now=start;const l=new BillingLedger(':memory:',()=>now);l.db.prepare('INSERT INTO wallets VALUES(?,0,0)').run(user);t.after(()=>l.close());return {l,setNow:n=>now=n};}
test('all historical usage and holds count across month/year; exact hold threshold and duplicate dispatch',t=>{
 const {l,setNow}=ledger(t);activate(l);l.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',100000000,99000000,500000);
 assert.equal(l.supplierBudget('2026-11',1000000).availableMicros,500000);assert.equal(reserve(l,'one','2026-11').shouldDispatch,true);
 assert.equal(l.beginAttempt({jobId:'one',attemptId:'attempt-one',period:'2026-11',maximumMicros:500000,limitMicros:1000000}).shouldDispatch,false);
 assert.throws(()=>reserve(l,'two','2026-11'),/Provider budget unavailable/);
 setNow(Date.UTC(2027,0,1));assert.equal(l.supplierBudget('2027-01',1000000).availableMicros,0);assert.throws(()=>reserve(l,'three','2027-01'),/Provider budget unavailable/);
 l.settleAttempt('attempt-one',200000,'completed');assert.equal(l.supplierBudget('2027-01',1000000).availableMicros,300000);
 l.settleAttempt('attempt-one',200000,'completed');assert.equal(l.supplierBudget('2027-01',1000000).spentMicros,99200000);assert.throws(()=>l.settleAttempt('attempt-one',1,'completed'),/replay/);
});
test('uncertain/cancel/expiry keep cost hold; late settlement preserves old period and can exceed cap',t=>{
 const {l,setNow}=ledger(t);activate(l);l.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',100000000,99500000,0);reserve(l,'uncertain','2026-11');l.markAttemptUncertain('attempt-uncertain');l.release('uncertain',user,'cancelled');setNow(start+2e12);l.expire();assert.equal(l.supplierBudget('2090-01',0).heldMicros,500000);
 l.settleAttempt('attempt-uncertain',700000,'completed');assert.equal(l.supplierBudget('2090-01',0).spentMicros,100200000);assert.equal(l.budget('2026-11').spent_micros,700000);assert.equal(l.supplierBudget('2090-01',0).availableMicros,0);
});
test('known failure releases reservation exactly once without resetting history',t=>{const {l}=ledger(t);activate(l);reserve(l,'failed','2026-11');l.settleAttempt('attempt-failed',0,'failed');l.settleAttempt('attempt-failed',0,'failed');assert.equal(l.supplierBudget('2026-11',0).heldMicros,0);});
test('owner mismatch, lost admin role, malformed/future policy fail closed; no policy preserves monthly cap',t=>{
 const {l}=ledger(t);assert.equal(l.supplierBudget('2026-11',1000000),null);activate(l);l.budgetOwner='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';assert.throws(()=>l.supplierBudget('2026-11',0),/POLICY_INVALID/);l.budgetOwner=owner;l.budgetAdmin=false;assert.throws(()=>l.supplierBudget('2026-11',0),/POLICY_INVALID/);
 const p=l.db.prepare('SELECT * FROM supplier_budget_policy').get();assert.throws(()=>cumulativeBudgetView({...p,history_mode:'from-activation'},{spent:0,held:0},{ownerId:owner,isAdmin:true,now:start}),/POLICY_INVALID/);assert.throws(()=>cumulativeBudgetView(p,{spent:0,held:0},{ownerId:owner,isAdmin:true,now:start-1}),/POLICY_INVALID/);
});
test('policy and accumulated usage survive ledger reopening',t=>{const dir=mkdtempSync(join(tmpdir(),'cumulative-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'ledger.db');let l=new BillingLedger(file,()=>start);activate(l);l.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-01',1000000,900000,50000);l.close();l=new BillingLedger(file,()=>start);l.budgetOwner=owner;l.budgetAdmin=true;assert.equal(l.supplierBudget('2026-11',1000000).availableMicros,99050000);l.close();});
test('status replaces monthly $1 gate only for explicit cumulative policy; no wallet or old ledger edits',t=>{
 const s=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:1000000,adapter:{generate(){throw Error('provider forbidden');}},now:()=>start});t.after(()=>s.close());s.cloudUser=owner;s.adminTestUnlimited=true;activate(s.ledger);s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',1000000,546000,0);s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-11',1000000,900000,0);
 const before=s.db.prepare('SELECT * FROM budgets ORDER BY period').all(),wallet=s.wallet();const r=s.status();assert.equal(r.generation.reason,null);assert.equal(r.budget.scope,'lifetime');assert.equal(r.budget.spentMicros,1446000);assert.equal(r.budget.limitMicros,100000000);assert.deepEqual(s.wallet(),wallet);assert.deepEqual(s.db.prepare('SELECT * FROM budgets ORDER BY period').all(),before);
});
test('complete history audit rejects missing/disagreeing records, absent evidence and invalid amounts',()=>{
 const snapshot={budgets:[{period:'2026-10',spent_micros:10,held_micros:50}],attempts:[{period:'2026-10',status:'completed',actual_micros:10},{period:'2026-10',status:'uncertain',maximum_micros:50,actual_micros:null}],assistants:[],recommendations:[],externalLedgersVerifiedEmpty:true};assert.equal(auditSupplierHistory(snapshot).availableMicros,99999940);
 assert.throws(()=>auditSupplierHistory({...snapshot,externalLedgersVerifiedEmpty:false}),/UNVERIFIED/);assert.throws(()=>auditSupplierHistory({...snapshot,attempts:[]}),/MISMATCH/);assert.throws(()=>auditSupplierHistory({...snapshot,budgets:[]}),/MISSING/);assert.throws(()=>auditSupplierHistory({...snapshot,assistants:undefined}),/INCOMPLETE/);
});

test('audit counts assistant/recommendation once and retains all historical uncertain holds',()=>{
 const input={budgets:[{period:'2026-01',spent_micros:30,held_micros:70}],attempts:[{period:'2026-01',status:'completed',actual_micros:10}],assistants:[{period:'2026-01',state:'uncertain',actual_micros:null,held_micros:50}],recommendations:[{period:'2026-01',category:'recommendation',state:'settled',actual_micros:20,held_micros:0},{period:'2026-01',category:'recommendation',state:'held',actual_micros:null,held_micros:20}],externalLedgersVerifiedEmpty:true};
 assert.deepEqual(auditSupplierHistory(input),{periods:1,spentMicros:30,heldMicros:70,limitMicros:100000000,availableMicros:99999900});
 assert.throws(()=>auditSupplierHistory({...input,recommendations:[{...input.recommendations[0],category:'image'}]}),/UNKNOWN_SUPPLIER_STATE/);
 assert.throws(()=>auditSupplierHistory({...input,attempts:[{period:'2026-01',status:'completed',actual_micros:null}]}),/INVALID_SUPPLIER_AMOUNT/);
});

test('independent SQLite worker connections race for the last reservation without overspending',async t=>{
 const {Worker}=await import('node:worker_threads');const dir=mkdtempSync(join(tmpdir(),'cumulative-race-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'ledger.db'),now=Date.now(),period=new Date(now).toISOString().slice(0,7);
 const l=new BillingLedger(file);activate(l);l.db.prepare('INSERT INTO wallets VALUES(?,0,0)').run(user);l.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2020-01',100000000,99500000,0);
 for(const jobId of ['race-one','race-two'])l.reserve({jobId,userId:user,kind:'image',credits:1,creditExempt:true,requestHash:jobId,modelRevision:'mock',expiresAt:now+60000});l.close();
 const barrier=new SharedArrayBuffer(4),view=new Int32Array(barrier);let ready=0;
 const source=`import {parentPort,workerData} from 'node:worker_threads';import {BillingLedger} from ${JSON.stringify(new URL('../server/billing.mjs',import.meta.url).href)};const l=new BillingLedger(workerData.file);l.budgetOwner=workerData.owner;l.budgetAdmin=true;parentPort.postMessage('ready');Atomics.wait(new Int32Array(workerData.barrier),0,0);try{const r=l.beginAttempt({jobId:workerData.id,attemptId:'attempt-'+workerData.id,period:workerData.period,maximumMicros:500000,limitMicros:1000000,periodScoped:true});parentPort.postMessage(r.shouldDispatch?'admitted':'reused');}catch(e){parentPort.postMessage(e.message);}finally{l.close();}`;
 const results=await Promise.all(['race-one','race-two'].map(id=>new Promise((resolve,reject)=>{const w=new Worker(source,{eval:true,workerData:{file,owner,id,period,barrier}});w.on('error',reject);w.on('message',m=>{if(m==='ready'){if(++ready===2){Atomics.store(view,0,1);Atomics.notify(view,0);}}else resolve(m);});})));
 assert.deepEqual(results.sort(),['Provider budget unavailable','admitted']);const after=new BillingLedger(file);assert.equal(after.budget(period).held_micros,500000);after.close();
});

test('real service mock dispatch holds uncertain cost; same request recovery does not redispatch at exhausted cap',async t=>{
 const {starterProject,prepareCampaign}=await import('../src/consumer-campaign.ts');const {withGenerationInput,generationInputs}=await import('../src/generation-input.ts');const {buildGenerationRequest}=await import('../src/generation.ts');const {randomUUID}=await import('node:crypto');let calls=0;
 const s=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:1000000,now:()=>start,adapter:{generate:async()=>{calls++;throw Error('mock response lost');}}});t.after(()=>s.close());s.cloudUser=owner;s.adminTestUnlimited=true;activate(s.ledger);s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',100000000,99500000,0);
 const body=()=>{let p=starterProject('other');p=withGenerationInput(prepareCampaign({...p,productName:'Fixture product',productProfile:{...p.productProfile,material:'450ml steel cup'}}),'text-example');return {requestId:randomUUID(),projectId:p.id,request:buildGenerationRequest(p),...generationInputs(p),creditQuote:s.creditQuote()};};
 const first=body(),accepted=await s.create(first);await s.waitForIdle();assert.equal(calls,1);assert.equal(s.job(accepted.job.id).state,'uncertain');assert.equal(s.status().budget.heldMicros,500000);assert.equal(s.status().generation.reason,'BUDGET_NOT_AVAILABLE');assert.equal((await s.create(first)).reused,true);assert.equal(calls,1);await assert.rejects(s.create(body()),e=>e.code==='BUDGET_NOT_AVAILABLE');assert.equal(calls,1);
});
