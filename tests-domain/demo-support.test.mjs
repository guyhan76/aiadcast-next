import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {BetaStore} from '../server/cloud/beta-store-base.mjs';
import {CloudGenerationService} from '../server/cloud/beta.mjs';
import {AdminApi} from '../server/cloud/admin-api-base.mjs';
import {PostgresDatabase,cloudSchema} from '../server/cloud/postgres.mjs';
import {demoSupport} from '../server/demo-support.mjs';
async function poolFixture(){
 const engine=new PGlite();await engine.waitReady;let tail=Promise.resolve();
 return {engine,async connect(){let unlock;const before=tail;tail=new Promise(r=>unlock=r);await before;return {async query(sql,args=[]){
  const r=!args.length&&sql.trim().split(';').filter(s=>s.trim()).length>1?(await engine.exec(sql)).at(-1):await engine.query(sql,args);
  const rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>{const f=r.fields.find(f=>f.name===k);return [k,v!==null&&[20,1700].includes(f?.dataTypeID)?pg.types.getTypeParser(f.dataTypeID)(String(v)):v];})));
  return {...r,rows,rowCount:r.command==='SELECT'?rows.length:r.affectedRows};},release:unlock};},async end(){await tail;await engine.close();}};
}
async function setup(t){
 const pool=await poolFixture();t.after(()=>pool.end());let time=Date.parse('2026-10-18T01:00:00Z');const now=()=>time;
 const db=await new PostgresDatabase(pool,'aiadcast_accounts').initialize();
 const store=await new BetaStore().initialize(db,{monthlyBudgetMicros:1000000,now});
 const ownerId=(await store.provision({label:'Owner',credits:0,budgetMicros:1000000})).userId;
 const memberId=(await store.provision({label:'Member',credits:1})).userId;
 await store.setRole(ownerId,'admin');await db.exec('CREATE TABLE email_identities(email TEXT PRIMARY KEY,user_id TEXT NOT NULL)');
 await db.prepare('INSERT INTO email_identities VALUES(?,?)').run('selluplabs@gmail.com',ownerId);await db.prepare('INSERT INTO email_identities VALUES(?,?)').run('guyhan76@gmail.com',memberId);
 const services=new Map();let providerCalls=0;
 for(const id of [ownerId,memberId]){
  const user=await db.prepare('SELECT * FROM users WHERE id=?').get(id),ledgerDb=await new PostgresDatabase(pool,cloudSchema(id)).initialize();
  const s=new CloudGenerationService();s.cloudUser=id;await s.initialize({db:ledgerDb,budgetMicros:user.budget,testCredits:user.credits,enabled:true,providerConfigured:true,budgetForPeriod:p=>store.effectiveBudget(id,p),now,adapter:{generate:async()=>{providerCalls++;throw Error('NO_PROVIDER_ALLOWED');}}});s.adminTestUnlimited=user.role==='admin';services.set(id,s);
 }
 const actor={id:ownerId,role:'admin'},admin=await new AdminApi().initialize(store,{service:u=>services.get(u.id),ownerEmail:'selluplabs@gmail.com',accounts:{},checkout:{available:()=>false},now});
 await store.activateOctoberBudget(ownerId);
 const body={userId:memberId,email:'guyhan76@gmail.com'};
 return {pool,db,store,admin,actor,body,owner:services.get(ownerId),member:services.get(memberId),advance:v=>time=Date.parse(v),calls:()=>providerCalls,
  quote:()=>demoSupport(admin,actor,body),apply:q=>demoSupport(admin,actor,{...body,requestId:randomUUID(),quoteToken:q.quoteToken},true)};
}
test('atomic support moves one of the existing five dollars and grants only missing two credits; replay never replenishes',async t=>{
 const s=await setup(t),q=await s.quote();assert.equal(q.addedCredits,2);assert.equal(q.totalMicros,5000000);assert.equal((await s.member.wallet()).available,1);
 const outcomes=await Promise.all([s.apply(q),s.apply(q),s.apply(q)]);assert.equal(outcomes.filter(r=>!r.reused).length,1);
 assert.equal(await s.store.effectiveBudget(s.actor.id,'2026-10'),4000000);assert.equal(await s.store.effectiveBudget(s.body.userId,'2026-10'),1000000);assert.equal((await s.member.wallet()).available,3);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM admin_grants').get()).n,1);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM monthly_demo_support').get()).n,1);
 await s.member.ledger.reserve({jobId:'used-credit',userId:'aiadcast-next-local-developer',credits:1,requestHash:'used-credit',modelRevision:'fixture',expiresAt:Date.parse('2026-10-19')});
 await s.apply(q);assert.deepEqual(await s.member.wallet(),{available:2,reserved:1,kind:'test-credits'});await s.admin.activateOctoberBudget(s.actor,{});
 assert.equal(await s.store.effectiveBudget(s.actor.id,'2026-10'),4000000);assert.equal(s.calls(),0);
 // Fresh store instance reads persisted transfer rather than restoring the full admin allocation.
 const reopened=await new BetaStore().initialize(s.db,{monthlyBudgetMicros:1000000,now:()=>Date.parse('2026-10-18')});assert.equal(await reopened.effectiveBudget(s.actor.id,'2026-10'),4000000);
 s.advance('2026-11-01T00:00:00Z');assert.equal(await s.store.effectiveCap(),1000000);assert.equal(await s.store.effectiveBudget(s.body.userId,'2026-11'),0);assert.equal(await s.store.effectiveBudget(s.actor.id,'2026-11'),1000000);await assert.rejects(s.apply(q),/MONTH_APPROVAL_EXPIRED/);
});
test('audit failure rolls back both account allocation and member ledger credit; retry succeeds once',async t=>{
 const s=await setup(t),q=await s.quote(),audit=s.admin.audit.bind(s.admin);s.admin.audit=async(...args)=>{if(args[1]==='october-demo-support')throw Error('fixture-write-failure');return audit(...args);};
 await assert.rejects(s.apply(q),/fixture-write-failure/);
 assert.equal(await s.store.effectiveBudget(s.actor.id,'2026-10'),5000000);assert.equal(await s.store.effectiveBudget(s.body.userId,'2026-10'),0);assert.equal((await s.member.wallet()).available,1);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM admin_grants').get()).n,0);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM monthly_demo_support').get()).n,0);
 s.admin.audit=audit;await s.apply(q);assert.equal((await s.member.wallet()).available,3);
});
test('owner spent and uncertain holds are protected, changed quotes rejected, reserved credits counted',async t=>{
 const s=await setup(t),q=await s.quote();await s.owner.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',5000000,3500000,600000);
 await assert.rejects(s.apply(q),/DEMO_SUPPORT_OWNER_BUDGET_IN_USE/);assert.equal((await s.member.wallet()).available,1);
 await s.owner.db.prepare('UPDATE budgets SET held_micros=? WHERE period=?').run(500000,'2026-10');await assert.rejects(s.apply(q),/DEMO_SUPPORT_QUOTE_CHANGED/);
 await s.member.ledger.reserve({jobId:'held-credit',userId:'aiadcast-next-local-developer',credits:1,requestHash:'held-credit',modelRevision:'fixture',expiresAt:Date.parse('2026-10-19')});
 const fresh=await s.quote();assert.equal(fresh.addedCredits,2);await s.apply(fresh);assert.deepEqual(await s.member.wallet(),{available:2,reserved:1,kind:'test-credits'});assert.equal((await s.owner.status()).generation.reason,'BUDGET_NOT_AVAILABLE');
 assert.deepEqual(await s.owner.ledger.budget('2026-10'),{period:'2026-10',limit_micros:5000000,spent_micros:3500000,held_micros:500000});
});
test('target email, role, owner identity, expiry and unsupported storage fail closed',async t=>{
 const s=await setup(t);await assert.rejects(demoSupport(s.admin,{id:s.body.userId,role:'member'},s.body),/ADMIN_REQUIRED/);
 await assert.rejects(demoSupport(s.admin,s.actor,{...s.body,email:'someone@example.com'}),/DEMO_SUPPORT_TARGET_MISMATCH/);
 await s.store.setRole(s.body.userId,'admin');await assert.rejects(s.quote(),/DEMO_SUPPORT_TARGET_MISMATCH/);await s.store.setRole(s.body.userId,'member');
 await s.db.prepare('UPDATE email_identities SET email=? WHERE user_id=?').run('changed@example.com',s.body.userId);await assert.rejects(s.quote(),/DEMO_SUPPORT_TARGET_MISMATCH/);
 s.db.atomicSchemas=false;await assert.rejects(s.quote(),/DEMO_SUPPORT_ATOMIC_STORAGE_REQUIRED/);assert.equal((await s.member.wallet()).available,1);assert.equal(s.calls(),0);
});
test('transfer and generation reservation share one transaction lock and cannot admit stale five-dollar capacity',async t=>{
 const s=await setup(t);await s.owner.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',5000000,3600000,0);
 const q=await s.quote();await s.owner.ledger.reserve({jobId:'competing-generation',userId:'owner',credits:1,creditExempt:true,requestHash:'competing-generation',modelRevision:'fixture',expiresAt:Date.parse('2026-10-19')});
 const admission=()=>s.owner.ledger.transaction(async()=>s.owner.ledger.beginAttempt({jobId:'competing-generation',attemptId:'competing-attempt',period:'2026-10',maximumMicros:500000,limitMicros:await s.owner.budgetLimit('2026-10'),periodScoped:true}));
 const results=await Promise.allSettled([s.apply(q),admission()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const b=await s.owner.ledger.budget('2026-10');assert.ok(b.spent_micros+b.held_micros<=await s.store.effectiveBudget(s.actor.id,'2026-10'));assert.equal(s.calls(),0);
});
test('parallel cross-schema queries use the same transaction and rollback together without leaking search paths',async t=>{
 const s=await setup(t);await s.db.exec('CREATE TABLE transaction_probe(value INTEGER)');await s.owner.db.exec('CREATE TABLE transaction_probe(value INTEGER)');
 await s.db.prepare('INSERT INTO transaction_probe VALUES(?)').run(11);await s.owner.db.prepare('INSERT INTO transaction_probe VALUES(?)').run(22);
 const values=await s.store.transaction(()=>Promise.all(Array.from({length:20},(_,i)=>(i%2?s.owner.db:s.db).prepare('SELECT value FROM transaction_probe').get())));assert.deepEqual(values.map(v=>v.value),Array.from({length:20},(_,i)=>i%2?22:11));
 await assert.rejects(s.store.transaction(async()=>{await Promise.all([s.db.prepare('UPDATE transaction_probe SET value=?').run(100),s.owner.db.prepare('UPDATE transaction_probe SET value=?').run(200)]);throw Error('rollback-both');}),/rollback-both/);
 assert.equal((await s.db.prepare('SELECT value FROM transaction_probe').get()).value,11);assert.equal((await s.owner.db.prepare('SELECT value FROM transaction_probe').get()).value,22);
});
test('month rollover after credit write rolls the whole support operation back',async t=>{
 const s=await setup(t),q=await s.quote(),audit=s.admin.audit.bind(s.admin);s.admin.audit=async(...args)=>{const result=await audit(...args);if(args[1]==='october-demo-support')s.advance('2026-11-01T00:00:00Z');return result;};
 await assert.rejects(s.apply(q),/MONTH_APPROVAL_EXPIRED/);assert.equal((await s.member.wallet()).available,1);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM monthly_demo_support').get()).n,0);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM admin_grants').get()).n,0);
});
