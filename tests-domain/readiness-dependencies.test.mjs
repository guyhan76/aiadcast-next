import test from 'node:test';
import assert from 'node:assert/strict';
import {PostgresDatabase} from '../server/cloud/postgres.mjs';
import {BillingLedger} from '../server/cloud/billing-base.mjs';
import {GenerationService} from '../server/cloud/generation-base.mjs';

// Exercise the real status -> expiry -> PostgreSQL transaction dependency with
// a controlled client. No database connection, credentials or provider calls.
for (const rejected of [false,true]) test(`readiness waits for expiry transaction lock; rejected=${rejected}`,async()=>{
 let unlock,fail,entered;const reached=new Promise(resolve=>entered=resolve);
 const gate=new Promise((resolve,reject)=>{unlock=resolve;fail=reject;});
 const queries=[];const client={release(){},async query(sql){queries.push(sql);if(sql.includes('pg_advisory_xact_lock')){entered();await gate;}return {rows:[],rowCount:0};}};
 const db=new PostgresDatabase({connect:async()=>client},'aiadcast_accounts');
 const ledger=new BillingLedger();ledger.db=db;ledger.now=()=>0;
 const service=new GenerationService();service.ledger=ledger;service.period=()=> '2026-10';service.budgetLimit=async()=>100000000;
 const budget={spent_micros:5008600,held_micros:2000000};ledger.budget=async()=>({...budget});
 service.enabled=true;service.providerConfigured=true;service.adminTestUnlimited=true;service.assistantEnabled=false;
 service.wallet=async()=>({available:3,reserved:1,credits:{available:0,reserved:0}});service.creditQuote=async()=>({unit:'legacy-ticket'});
 let settled=false;const request=service.status().finally(()=>settled=true);const outcome=request.then(value=>({value}),error=>({error}));
 await reached;await new Promise(resolve=>setTimeout(resolve,25));assert.equal(settled,false);
 if(rejected)fail(Error('SIMULATED_LOCK_FAILURE'));else unlock();
 const result=await outcome;
 if(rejected){assert.match(result.error.message,/SIMULATED_LOCK_FAILURE/);assert.ok(queries.includes('ROLLBACK'));}
 else {assert.equal(result.value.generation.enabled,true);assert.equal(result.value.budget.heldMicros,2000000);assert.ok(queries.includes('COMMIT'));}
 assert.deepEqual(budget,{spent_micros:5008600,held_micros:2000000});assert.equal(queries.some(sql=>/^(UPDATE|DELETE|INSERT)/.test(sql)),false);
});
