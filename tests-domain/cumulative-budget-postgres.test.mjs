import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {CloudGenerationService} from '../server/cloud/beta.mjs';
import {PostgresDatabase} from '../server/cloud/postgres.mjs';
import {ExistingImageBudget} from '../server/recommendations/existing-image-budget.mjs';
async function fixture(t){
 const engine=new PGlite();await engine.waitReady;let tail=Promise.resolve();const statements=[];
 const pool={async connect(){let unlock;const before=tail;tail=new Promise(r=>unlock=r);await before;return {async query(sql,args=[]){statements.push(sql);const r=!args.length&&sql.trim().split(';').filter(Boolean).length>1?(await engine.exec(sql)).at(-1):await engine.query(sql,args);return {...r,rows:r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>{const f=r.fields.find(f=>f.name===k);return [k,v!==null&&[20,1700].includes(f?.dataTypeID)?pg.types.getTypeParser(f.dataTypeID)(String(v)):v];}))),rowCount:r.affectedRows};},release:unlock};}};
 t.after(()=>engine.close());await engine.exec("CREATE SCHEMA aiadcast_accounts;CREATE TABLE aiadcast_accounts.users(id TEXT,role TEXT,disabled BIGINT);INSERT INTO aiadcast_accounts.users VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','admin',0);CREATE TABLE aiadcast_accounts.dimension_analysis_calls(id TEXT PRIMARY KEY,actor_id TEXT,state TEXT,hold BIGINT,actual BIGINT);");const services=[];
 for(const suffix of ['a','b']){const schema='aiadcast_user_'+suffix.repeat(32);await engine.exec(`CREATE SCHEMA ${schema}`);const db=new PostgresDatabase(pool,schema);services.push(await new CloudGenerationService().initialize({db,enabled:true,providerConfigured:true,budgetMicros:2000000,adapter:{generate(){throw Error('no provider');}}}));}
 return {services,statements,engine,pool};
}

const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',localUser='aiadcast-next-local-developer';
async function activate(s){s.cloudUser=owner;s.adminTestUnlimited=true;await s.db.prepare("INSERT INTO supplier_budget_policy VALUES(1,?,100000000,'all-history',0,1)").run(owner);await s.supplierBudget(s.period(),0);}
async function attempt(s,id){await s.ledger.reserve({jobId:id,userId:localUser,credits:1,creditExempt:true,kind:'image',requestHash:id,modelRevision:'mock',expiresAt:Date.now()+100000});return s.ledger.beginAttempt({jobId:id,attemptId:'a-'+id,period:s.period(),maximumMicros:500000,limitMicros:1000000,periodScoped:true});}
test('PostgreSQL concurrent local reservation tasks admit exactly one at threshold; tenant B unchanged',async t=>{
 const {services:[a,b]}=await fixture(t);await activate(a);await a.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2020-01',100000000,99500000,0);
 const results=await Promise.allSettled([attempt(a,'first'),attempt(a,'second')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.equal((await a.status()).generation.reason,'BUDGET_NOT_AVAILABLE');assert.equal((await a.status()).budget.scope,'lifetime');assert.equal((await a.status()).budget.spentMicros,99500000);assert.equal((await b.status()).budget.scope,undefined);assert.equal((await b.status()).budget.spentMicros,0);
});
test('PostgreSQL rollback guard blocks old SQL reservations but allows honest late cost exceeding cap',async t=>{
 const {services:[s],engine}=await fixture(t);await activate(s);const schema=s.db.schema;
 const guard=readFileSync(new URL('../server/cumulative-budget-guard.sql',import.meta.url),'utf8').replaceAll('__SCHEMA__',schema);
 await engine.exec(guard);await engine.exec(guard); // idempotent installation, no policy reset
 await s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2020-01',100000000,99500000,0);
 await s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-11',100000000,0,0);
 await s.db.prepare('UPDATE budgets SET held_micros=held_micros+500000 WHERE period=?').run('2026-11');
 await assert.rejects(s.db.prepare('UPDATE budgets SET held_micros=held_micros+1 WHERE period=?').run('2026-11'),/CUMULATIVE_BUDGET_UNAVAILABLE/);
 await s.db.prepare('UPDATE budgets SET held_micros=0,spent_micros=700000 WHERE period=?').run('2026-11');
 assert.equal((await s.status()).budget.spentMicros,100200000);assert.equal((await s.status()).generation.reason,'BUDGET_NOT_AVAILABLE');
});
test('recommendation and image reservations share cumulative authority without double counting audit rows',async t=>{
 const {services:[s]}=await fixture(t);await activate(s);await s.db.exec(readFileSync(new URL('../server/recommendations/migration-draft.sql',import.meta.url),'utf8'));
 await s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2020-01',100000000,99490000,0);
 const shared=new ExistingImageBudget({db:s.db,owner,period:()=>s.period(),limit:async()=>1000000,recommendationCap:500000,cumulativeBudget:(p,l)=>s.supplierBudget(p,l)});
 assert.equal(await shared.reserve({id:'rec-one',owner,category:'recommendation',amount:20000}),true);
 assert.equal(await shared.reserve({id:'rec-one',owner,category:'recommendation',amount:20000}),false);
 await assert.rejects(attempt(s,'image-one'),/Provider budget unavailable/);
 await shared.settle('rec-one',1000);await shared.settle('rec-one',1000);assert.equal((await s.status()).budget.spentMicros,99491000);
 assert.equal((await attempt(s,'image-two')).shouldDispatch,true);
 await assert.rejects(shared.reserve({id:'other-owner',owner:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',category:'recommendation',amount:1}),/INVALID_RESERVATION/);
});

test('unactivated guard preserves monthly writes; corrupt tenant binding blocks reservations',async t=>{
 const {services:[s],engine}=await fixture(t);await engine.exec(readFileSync(new URL('../server/cumulative-budget-guard.sql',import.meta.url),'utf8').replaceAll('__SCHEMA__',s.db.schema));
 await s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run(s.period(),1000000,0,0);await s.db.prepare('UPDATE budgets SET held_micros=100 WHERE period=?').run(s.period());assert.equal((await s.ledger.budget(s.period())).held_micros,100);
 await activate(s);await s.db.prepare('UPDATE supplier_budget_policy SET owner_id=? WHERE id=1').run('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
 await assert.rejects(s.db.prepare('UPDATE budgets SET held_micros=held_micros+1 WHERE period=?').run(s.period()),/CUMULATIVE_BUDGET_POLICY_INVALID/);assert.equal((await s.ledger.budget(s.period())).held_micros,100);
});
