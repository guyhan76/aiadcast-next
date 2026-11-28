import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pgPool} from './helpers/recommendation-pg-pool.mjs';
import {PostgresDatabase,cloudSchema} from '../server/cloud/postgres.mjs';
import {BetaStore} from '../server/cloud/beta-store-base.mjs';
import {GenerationService} from '../server/cloud/generation-base.mjs';
import {SharedGenerationBudget} from '../server/cloud/shared-generation-budget.mjs';
import {ExistingImageBudget} from '../server/recommendations/existing-image-budget.mjs';

const local='aiadcast-next-local-developer';
async function fixture(t){
 const pool=await pgPool();t.after(()=>pool.end());
 const db=await new PostgresDatabase(pool,'aiadcast_accounts').initialize();
 const store=await new BetaStore().initialize(db,{monthlyBudgetMicros:100000000});
 const shared=await new SharedGenerationBudget(db).initialize();
 const members=[];
 for(const label of ['Owner','Free member','Paid member']){
  const u=await store.provision({label,credits:0});
  const ledgerDb=await new PostgresDatabase(pool,cloudSchema(u.userId)).initialize();
  const service=await new GenerationService().initialize({db:ledgerDb,testCredits:0,budgetMicros:0,enabled:true,providerConfigured:true});
  service.cloudUser=u.userId;members.push({id:u.userId,s:service});
 }
 const [owner]=members;await store.setRole(owner.id,'admin');owner.s.adminTestUnlimited=true;
 const ownerPolicy=async()=>owner.s.db.prepare("INSERT INTO supplier_budget_policy VALUES(1,?,100000000,'all-history',0,1)").run(owner.id);
 const external=async()=>db.exec('CREATE TABLE dimension_analysis_calls(id TEXT PRIMARY KEY,actor_id TEXT,state TEXT,hold BIGINT,actual BIGINT)');
 const activate=async()=>{
  await ownerPolicy();await external();await shared.initialize(owner.id);
  for(const {id,s} of members)s.ledger.sharedBudget=p=>shared.view(id,p);
 };
 return {db,pool,store,shared,members,ownerPolicy,external,activate};
}
async function attempt(s,{id=randomUUID(),period=s.period(),exempt=true}={}){
 await s.ledger.reserve({jobId:id,userId:local,unit:'credit-v2',credits:10,creditExempt:exempt,requestHash:id,modelRevision:'fixture',expiresAt:Date.now()+60000});
 return s.ledger.beginAttempt({jobId:id,attemptId:'attempt-'+id,period,maximumMicros:500000,limitMicros:100000000,periodScoped:true});
}
async function historicalCost(s,amount){const a=await attempt(s);await s.ledger.settleAttempt(a.id,amount,'completed');return a;}

test('member funding stays off by default and requires an existing verified lifetime owner policy',async t=>{
 const f=await fixture(t),member=f.members[1].s;
 await member.grantWelcomeAd();assert.equal((await member.status()).generation.reason,'BUDGET_NOT_AVAILABLE');
 await assert.rejects(f.shared.initialize('client-selected-owner'),/OWNER_INVALID/);
 await assert.rejects(f.shared.initialize(f.members[0].id),/OWNER_POLICY_REQUIRED/);
 await f.ownerPolicy();await assert.rejects(f.shared.initialize(f.members[0].id),/EXTERNAL_SUPPLIER_HISTORY_UNVERIFIED/);
 assert.equal(await f.db.prepare('SELECT * FROM shared_generation_budget_policy').get(),undefined);
});

test('activation rejects unreconciled historic spending without resetting any amount',async t=>{
 const f=await fixture(t);await f.ownerPolicy();await f.external();
 await f.members[1].s.db.prepare('INSERT INTO budgets VALUES(?,?,?,0)').run('2020-01',100000000,123);
 await assert.rejects(f.shared.initialize(f.members[0].id),/SUPPLIER_HISTORY_MISMATCH/);
 assert.equal((await f.members[1].s.ledger.budget('2020-01')).spent_micros,123);
 assert.equal(await f.db.prepare('SELECT * FROM shared_generation_budget_policy').get(),undefined);
});

test('free and verified purchased credits enable zero-allocation members and only delivery consumes credits',async t=>{
 const f=await fixture(t);await f.activate();const [,free,paid]=f.members;
 await free.s.grantWelcomeAd();await paid.s.recordVerifiedPurchase({purchaseId:'fixture-verified',unit:'credit-v2',credits:30});
 for(const {s,id} of [free,paid]){
  assert.equal((await f.db.prepare('SELECT budget FROM users WHERE id=?').get(id)).budget,0);
  assert.equal((await s.status()).generation.enabled,true);
  const a=await attempt(s,{exempt:false});await s.ledger.settleAttempt(a.id,42000,'completed');
  await s.ledger.markReady(a.job_id,'fixture-artifact');
  assert.equal((await s.wallet()).credits.reserved,0);
 }
 assert.equal((await free.s.wallet()).credits.available,0);
 assert.equal((await paid.s.wallet()).credits.available,20);
 assert.equal((await free.s.status()).generation.reason,'NO_TEST_CREDITS');
 assert.equal((await f.shared.snapshot()).spentMicros,84000);
});

test('concurrent different-account reservations share the final half-dollar; direct old SQL cannot bypass it',async t=>{
 const f=await fixture(t);await historicalCost(f.members[0].s,99500000);await f.activate();
 const results=await Promise.allSettled(f.members.slice(1).map(({s})=>attempt(s)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await f.shared.snapshot()).heldMicros,500000);
 const loser=f.members[results[0].status==='rejected'?1:2].s;
 await assert.rejects(loser.db.prepare('INSERT INTO budgets VALUES(?,?,0,1)').run('2099-01',100000000),/SHARED_BUDGET_UNAVAILABLE/);
 assert.equal((await f.members[0].s.status()).generation.enabled,false);
});

test('known failure restores credits, releases unused reservation and retains incurred supplier cost',async t=>{
 const f=await fixture(t);await f.activate();const s=f.members[1].s;await s.grantWelcomeAd();
 const a=await attempt(s,{exempt:false});await s.ledger.settleAttempt(a.id,9000,'failed');await s.ledger.release(a.job_id,local,'system_error');
 assert.deepEqual((await s.wallet()).credits,{available:10,reserved:0});
 const totals=await f.shared.snapshot();assert.equal(totals.spentMicros,9000);assert.equal(totals.heldMicros,0);assert.equal(totals.availableMicros,99991000);
});

test('uncertain attempt returns customer credits but keeps the shared supplier reservation across policy reload',async t=>{
 const f=await fixture(t);await f.activate();const s=f.members[1].s;await s.grantWelcomeAd();
 const a=await attempt(s,{exempt:false});await s.ledger.markAttemptUncertain(a.id);await s.ledger.release(a.job_id,local,'system_error');
 const restarted=await new SharedGenerationBudget(f.db).initialize();
 assert.equal(restarted.active,true);assert.equal((await restarted.snapshot()).heldMicros,500000);assert.equal((await s.wallet()).credits.available,10);
 await s.ledger.settleAttempt(a.id,30000,'failed');await s.ledger.settleAttempt(a.id,30000,'failed');
 assert.equal((await restarted.snapshot()).spentMicros,30000);assert.equal((await restarted.snapshot()).heldMicros,0);
});

test('prior months and disabled members count; late cost exceeding the cap is recorded and blocks further work',async t=>{
 const f=await fixture(t);const old=f.members[2].s;
 const a=await historicalCost(old,99500000);
 // Keep FK relationships intact while proving the policy uses all periods.
 await old.db.prepare('INSERT INTO budgets VALUES(?,?,0,0)').run('2020-01',100000000);
 await old.db.prepare("UPDATE attempts SET period='2020-01' WHERE id=?").run(a.id);
 await old.db.prepare("UPDATE budgets SET spent_micros=99500000 WHERE period='2020-01'").run();
 await old.db.prepare('UPDATE budgets SET spent_micros=0 WHERE period=?').run(old.period());
 await f.store.revoke(f.members[2].id);await f.activate();
 const b=await attempt(f.members[1].s);await f.members[1].s.ledger.settleAttempt(b.id,700000,'completed');
 assert.equal((await f.shared.snapshot()).spentMicros,100200000);assert.equal((await f.shared.snapshot()).availableMicros,0);
 await assert.rejects(attempt(f.members[0].s),/Provider budget unavailable/);
});

test('external analysis costs count once, trial inserts are blocked and late settlement remains possible',async t=>{
 const f=await fixture(t);await f.ownerPolicy();await f.external();
 await f.db.prepare('INSERT INTO dimension_analysis_calls VALUES(?,?,?,?,?)').run('external-one',f.members[1].id,'uncertain',80000,null);
 await f.shared.initialize(f.members[0].id);assert.equal((await f.shared.snapshot()).heldMicros,80000);
 await assert.rejects(f.db.prepare('INSERT INTO dimension_analysis_calls VALUES(?,?,?,?,?)').run('external-two',f.members[1].id,'reserved',1,null),/TRIAL_DISABLED/);
 await f.db.prepare("UPDATE dimension_analysis_calls SET state='settled',actual=12000 WHERE id='external-one'").run();
 assert.equal((await f.shared.snapshot()).spentMicros,12000);assert.equal((await f.shared.snapshot()).heldMicros,0);
});

test('member deletion archives costs and unknown holds atomically without freeing the lifetime cap',async t=>{
 const f=await fixture(t);await f.activate();const m=f.members[1];await historicalCost(m.s,20000);await attempt(m.s);
 const before=await f.shared.snapshot(),receipt=randomUUID();
 await assert.rejects(f.db.transaction(async()=>{await f.shared.archive(m.id,receipt);throw Error('rollback fixture');}),/rollback fixture/);
 assert.equal((await f.shared.snapshot()).spentMicros,before.spentMicros);
 await f.db.transaction(async()=>{await f.shared.archive(m.id,receipt);await f.db.exec('DROP SCHEMA "'+cloudSchema(m.id)+'" CASCADE');await f.db.prepare('DELETE FROM invites WHERE user_id=?').run(m.id);await f.db.prepare('DELETE FROM users WHERE id=?').run(m.id);});
 const after=await f.shared.snapshot();assert.equal(after.spentMicros,before.spentMicros);assert.equal(after.heldMicros,before.heldMicros);
 const archived=await f.db.prepare('SELECT * FROM retired_supplier_totals').get();assert.equal(Object.values(archived).includes(m.id),false);
});

test('recommendations compete with image work for the same cap without double counting category rows',async t=>{
 const f=await fixture(t);await historicalCost(f.members[0].s,99490000);await f.activate();const m=f.members[1];
 await m.s.db.exec(readFileSync(new URL('../server/recommendations/migration-draft.sql',import.meta.url),'utf8'));
 const rec=new ExistingImageBudget({db:m.s.db,owner:m.id,period:()=>m.s.period(),limit:async()=>0,recommendationCap:500000,cumulativeBudget:p=>f.shared.view(m.id,p)});
 await rec.reserve({id:'recommendation-one',owner:m.id,category:'recommendation',amount:20000});
 await assert.rejects(attempt(f.members[2].s),/Provider budget unavailable/);
 await rec.settle('recommendation-one',1000);assert.equal((await f.shared.snapshot()).spentMicros,99491000);
 assert.equal((await attempt(f.members[2].s)).shouldDispatch,true);
});

test('changing or disabling the authorized owner fails closed instead of reverting to per-member budgets',async t=>{
 const f=await fixture(t);await f.activate();
 await assert.rejects(new SharedGenerationBudget(f.db).initialize(f.members[1].id),/OWNER_CHANGED/);
 await f.store.revoke(f.members[0].id);
 await assert.rejects(f.shared.snapshot(),/POLICY_INVALID/);
 await assert.rejects(f.members[1].s.db.prepare('INSERT INTO budgets VALUES(?,?,0,1)').run('2099-01',100000000),/POLICY_INVALID/);
});

test('image entitlements do not enable extra assistant calls after an account loses administrator privileges',async t=>{
 const f=await fixture(t);await f.activate();const s=f.members[1].s;await s.grantWelcomeAd();s.assistantEnabled=true;
 assert.equal((await s.status()).generation.enabled,true);assert.equal((await s.status()).assistant.reason,'ASSISTANT_DISABLED');
 s.adminTestUnlimited=true;assert.equal((await s.status()).assistant.available,true);
 s.adminTestUnlimited=false;assert.equal((await s.status()).assistant.reason,'ASSISTANT_DISABLED');
 await assert.rejects(s.assist({requestId:'copy-request-1234',kind:'suggest',sourceLocale:'ko',targetLocale:'ko',productName:'커피',description:'신메뉴 출시',copy:{title:'커피',description:''}}),/ASSISTANT_DISABLED/);
 assert.equal((await f.shared.snapshot()).spentMicros,0);assert.equal((await s.wallet()).credits.available,10);
});
