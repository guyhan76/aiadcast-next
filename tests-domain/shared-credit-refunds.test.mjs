import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pgPool} from './helpers/recommendation-pg-pool.mjs';
import {PostgresDatabase} from '../server/cloud/postgres.mjs';
import {CommerceRecords} from '../server/cloud/commerce-records.mjs';
import {initializeCustomerAccounting} from '../server/cloud/customer-image-costs.mjs';

test('charges can span packs and a refund restores the exact allocation to each purchase',async t=>{
 const pool=await pgPool();t.after(()=>pool.end());
 const db=await new PostgresDatabase(pool,'aiadcast_accounts').initialize();
 await initializeCustomerAccounting(db);
 await db.exec('CREATE TABLE protected_complaints(case_id text PRIMARY KEY, erase_at timestamptz, received_at timestamptz)');
 await db.exec(readFileSync(new URL('../server/cloud/commerce-records.sql',import.meta.url),'utf8'));
 const records=new CommerceRecords(db);
 for(const [id,credits,won] of [['first',30,3300],['second',100,9900]]){
  await records.recordSale({orderNo:id,purchaseId:id,credits,product:'credits_'+credits,purchasedAt:'2026-11-23T00:00:00Z'},'owner',false);
  await db.prepare("UPDATE commerce_orders SET paid_nanos=?,currency='KRW',refunds='[]' WHERE order_no=?").run(won*1e9,id);
 }
 await db.transaction(()=>records.capture('owner','image',130,10));
 await db.transaction(()=>records.capture('owner','video',120,85));
 assert.equal((await records.order('first')).remaining,0);
 const second=await records.order('second');
 assert.equal(second.remaining,35);
 assert.equal(second.estimated,String(3465n*1000000000n));
 await db.transaction(()=>records.restore('video','another-account'));
 assert.equal((await records.order('second')).remaining,35);
 await db.transaction(()=>records.restore('video','owner'));
 await db.transaction(()=>records.restore('video','owner'));
 assert.equal((await records.order('first')).remaining,20);
 assert.equal((await records.order('second')).remaining,100);
});
