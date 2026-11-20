import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
const read=name=>readFileSync(new URL('../server/'+name,import.meta.url),'utf8');
const socket=process.env.AIADCAST_LOCAL_PG_SOCKET;
test(`${socket?'real PostgreSQL 17':'PGlite'} verified unused analysis bootstrap stays empty, rejects replay and protects later legacy initialization`,async t=>{
 let db;
 if(socket){
  assert.equal(socket,'/tmp/aiadcast-rec-pg-socket');
  const config={host:socket,user:'postgres',database:'postgres'},admin=new pg.Client(config);await admin.connect();
  const name='unused_analysis_'+process.pid;await admin.query(`CREATE DATABASE ${name}`);
  const client=new pg.Client({...config,database:name});await client.connect();
  db={exec:sql=>client.query(sql),query:sql=>client.query(sql)};
  t.after(async()=>{await client.end();await admin.query(`DROP DATABASE ${name}`);await admin.end();});
 }else{db=new PGlite();t.after(()=>db.close());}
 const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',schema='aiadcast_user_'+owner.replaceAll('-','');
 await db.exec(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;END $$;CREATE SCHEMA aiadcast_accounts;
 CREATE TABLE aiadcast_accounts.users(id TEXT,role TEXT,disabled INTEGER);
 INSERT INTO aiadcast_accounts.users VALUES('${owner}','admin',0);
 CREATE SCHEMA ${schema};CREATE TABLE ${schema}.budgets(period TEXT PRIMARY KEY,limit_micros BIGINT,spent_micros BIGINT,held_micros BIGINT);
 CREATE TABLE ${schema}.supplier_budget_policy(id INTEGER PRIMARY KEY,owner_id TEXT,limit_micros BIGINT,history_mode TEXT,excluded_spent_micros BIGINT,activated_at BIGINT);
 INSERT INTO ${schema}.budgets VALUES('2026-10',1000000,5201050,1500000),('2026-11',1000000,546001,0);`);
 const before=(await db.query(`SELECT * FROM ${schema}.budgets ORDER BY period`)).rows;
 const bootstrap=read('cumulative-budget-unused-analysis-bootstrap.sql');await db.exec(bootstrap);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM aiadcast_accounts.dimension_analysis_calls')).rows[0].n,0);
 await assert.rejects(db.exec(bootstrap),/already exists/);await db.exec('ROLLBACK');
 await db.exec(read('cumulative-budget-guard.sql').replaceAll('__SCHEMA__',schema));
 await db.exec(`INSERT INTO ${schema}.supplier_budget_policy VALUES(1,'${owner}',100000000,'all-history',0,1)`);
 // Exact legacy initialization SQL: CREATE IF NOT EXISTS/ADD IF NOT EXISTS must
 // retain the installed trigger, rather than resurrect an unprotected ledger.
 const legacy=read('vision-evaluation/cloud-ledger.mjs').match(/db\.exec\(`([\s\S]*?)`\)/)[1];
 await db.exec('SET search_path=aiadcast_accounts,public');await db.exec(legacy);
 await assert.rejects(db.exec(`INSERT INTO dimension_analysis_calls(id,approval,target,hash,state,hold,actor_id) VALUES('x','test','mock','mock','reserved',30000,'${owner}')`),/CUMULATIVE_BUDGET_TRIAL_DISABLED/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM dimension_analysis_calls')).rows[0].n,0);
 const security=(await db.query("SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT') AS anon_read,has_table_privilege('authenticated',oid,'INSERT') AS auth_write FROM pg_class WHERE oid='aiadcast_accounts.dimension_analysis_calls'::regclass")).rows[0];
 assert.deepEqual(security,{relrowsecurity:true,anon_read:false,auth_write:false});
 assert.deepEqual((await db.query(`SELECT * FROM ${schema}.budgets ORDER BY period`)).rows,before);
 assert.equal((await db.query(`SELECT (100000000-sum(spent_micros)-sum(held_micros))::text AS remaining FROM ${schema}.budgets`)).rows[0].remaining,'92752949');
});
