import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';
import {PostgresDatabase} from '../server/cloud/postgres.mjs';import {CloudGenerationService} from '../server/cloud/beta.mjs';
const socket=process.env.AIADCAST_LOCAL_PG_SOCKET;
async function setup(t,{legacyActor}={}){
 assert.equal(socket,'/tmp/aiadcast-rec-pg-socket');const config={host:socket,user:'postgres',database:'postgres',max:4},pool=new pg.Pool(config),other=new pg.Pool(config),owner=randomUUID(),schema='aiadcast_user_'+owner.replaceAll('-','');
 await pool.query('CREATE SCHEMA IF NOT EXISTS aiadcast_accounts;CREATE TABLE IF NOT EXISTS aiadcast_accounts.users(id TEXT PRIMARY KEY,role TEXT,disabled BIGINT);CREATE TABLE IF NOT EXISTS aiadcast_accounts.dimension_analysis_calls(id TEXT PRIMARY KEY,actor_id TEXT,state TEXT,hold BIGINT,actual BIGINT)');
 await pool.query('INSERT INTO aiadcast_accounts.users VALUES($1,\'admin\',0)',[owner]);await pool.query(`CREATE SCHEMA "${schema}"`);
 t.after(async()=>{await pool.query(`DROP SCHEMA "${schema}" CASCADE`);await pool.query('DELETE FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id=$1 OR id=$2',[owner,'legacy-'+owner]);await pool.query('DELETE FROM aiadcast_accounts.users WHERE id=$1',[owner]);await Promise.all([pool.end(),other.end()]);});
 const services=[];for(const p of [pool,other]){const s=await new CloudGenerationService().initialize({db:new PostgresDatabase(p,schema),enabled:true,providerConfigured:true,budgetMicros:1000000,adapter:{generate(){throw Error('no paid dispatch');}}});s.cloudUser=owner;s.adminTestUnlimited=true;services.push(s);}
 if(legacyActor!==undefined)await pool.query("INSERT INTO aiadcast_accounts.dimension_analysis_calls VALUES($1,$2,'settled',30000,20000)",['legacy-'+owner,legacyActor]);
 await pool.query(readFileSync(new URL('../server/cumulative-budget-guard.sql',import.meta.url),'utf8').replaceAll('__SCHEMA__',schema));
 await pool.query(`INSERT INTO "${schema}".supplier_budget_policy VALUES(1,$1,100000000,'all-history',0,1)`,[owner]);
 return {pool,other,owner,schema,services};
}
test('real PostgreSQL cumulative policy: independent pools reserve last slot once, keep late costs and fresh status',{skip:!socket},async t=>{
 const {services:[a,b],pool,owner,schema}=await setup(t);await a.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2020-01',100000000,99470000,0);
 // Historical external hold already in flight, inserted before policy for the fixture.
 await pool.query(`ALTER TABLE aiadcast_accounts.dimension_analysis_calls DISABLE TRIGGER ${schema}_analysis_guard`);await pool.query("INSERT INTO aiadcast_accounts.dimension_analysis_calls VALUES($1,$2,'uncertain',30000,NULL)",['ext-'+owner,owner]);await pool.query(`ALTER TABLE aiadcast_accounts.dimension_analysis_calls ENABLE TRIGGER ${schema}_analysis_guard`);
 assert.equal((await a.status()).budget.availableMicros,500000);
 for(let i=0;i<12;i++)await a.ledger.reserve({jobId:'job-'+i,userId:'aiadcast-next-local-developer',kind:'image',credits:1,creditExempt:true,requestHash:'hash-'+i,modelRevision:'mock',expiresAt:Date.now()+60000});
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>{const s=i%2?a:b;return s.ledger.beginAttempt({jobId:'job-'+i,attemptId:'attempt-'+i,period:s.period(),maximumMicros:500000,limitMicros:1000000,periodScoped:true});}));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await b.status()).generation.reason,'BUDGET_NOT_AVAILABLE');
 const index=results.findIndex(r=>r.status==='fulfilled');await Promise.all([a.ledger.settleAttempt('attempt-'+index,200000,'completed'),b.ledger.settleAttempt('attempt-'+index,200000,'completed')]);assert.equal((await a.status()).budget.availableMicros,300000);
 await pool.query("UPDATE aiadcast_accounts.dimension_analysis_calls SET state='settled',actual=10000 WHERE actor_id=$1",[owner]);assert.equal((await b.status()).budget.availableMicros,320000);
 const reopened=await new CloudGenerationService().initialize({db:new PostgresDatabase(pool,schema),enabled:true,providerConfigured:true,budgetMicros:1000000});reopened.cloudUser=owner;reopened.adminTestUnlimited=true;assert.equal((await reopened.status()).budget.availableMicros,320000);
});
test('real PostgreSQL rollback guards: concurrent old monthly SQL, future/demoted policy and trial writes fail closed',{skip:!socket},async t=>{
 const {pool,other,owner,schema,services:[s]}=await setup(t);
 await s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2020-01',100000000,99500000,0);for(const p of ['2026-11','2026-12'])await s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run(p,100000000,0,0);
 const raced=await Promise.allSettled([pool.query(`UPDATE "${schema}".budgets SET held_micros=500000 WHERE period='2026-11'`),other.query(`UPDATE "${schema}".budgets SET held_micros=500000 WHERE period='2026-12'`)]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(pool.query("INSERT INTO aiadcast_accounts.dimension_analysis_calls VALUES($1,$2,'reserved',30000,NULL)",['trial-'+owner,owner]),/CUMULATIVE_BUDGET_TRIAL_DISABLED/);
 await pool.query(`UPDATE "${schema}".supplier_budget_policy SET activated_at=$1`,[Date.now()+3600000]);await assert.rejects(pool.query(`UPDATE "${schema}".budgets SET held_micros=held_micros+1 WHERE period='2026-11'`),/POLICY_INVALID/);
 await pool.query(`UPDATE "${schema}".supplier_budget_policy SET activated_at=1`);await pool.query("UPDATE aiadcast_accounts.users SET role='member' WHERE id=$1",[owner]);await assert.rejects(pool.query(`UPDATE "${schema}".budgets SET held_micros=held_micros+1 WHERE period='2026-11'`),/POLICY_INVALID/);
});

test('real PostgreSQL malformed historical actor blocks both new service and rollback SQL; empty actor inserts rejected',{skip:!socket},async t=>{
 const {pool,schema,services:[s]}=await setup(t,{legacyActor:''});
 await s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run(s.period(),100000000,0,0);
 await assert.rejects(s.status(),/EXTERNAL_SUPPLIER_OWNER_UNKNOWN/);
 await assert.rejects(pool.query(`UPDATE "${schema}".budgets SET held_micros=500000 WHERE period=$1`,[s.period()]),/EXTERNAL_SUPPLIER_OWNER_UNKNOWN/);
 await assert.rejects(pool.query("INSERT INTO aiadcast_accounts.dimension_analysis_calls VALUES('bad-new','','reserved',30000,NULL)"),/CUMULATIVE_BUDGET_TRIAL_DISABLED/);
});
