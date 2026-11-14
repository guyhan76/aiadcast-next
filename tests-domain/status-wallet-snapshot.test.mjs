import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GenerationService} from '../server/generation-service.mjs';
import {GenerationService as AsyncGenerationService} from '../server/cloud/generation-base.mjs';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {withGenerationInput,generationInputs} from '../src/generation-input.ts';
import {buildGenerationRequest} from '../src/generation.ts';
function setup(t){const s=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:2000000,adapter:{generate:()=>{throw Error('provider must not run');}}});t.after(()=>s.close());return s;}
for(const asyncPath of [false,true])for(const [name,admin,tickets,credits,reason,unit,amount] of [
 ['admin',true,0,0,null,'legacy-ticket',0],['ticket',false,3,0,null,'legacy-ticket',1],['credits',false,0,10,null,'credit-v2',10],['empty',false,0,0,'NO_TEST_CREDITS','credit-v2',10]
])test(`${asyncPath?'async cloud':'local'} status ${name}: two SQL wallet reads after expiry with consistent response`,async t=>{
 const local=setup(t),id='aiadcast-next-local-developer';local.db.prepare('UPDATE wallets SET available=? WHERE user_id=?').run(tickets,id);
 if(credits)local.recordTestPurchase({purchaseId:randomUUID(),credits,unit:'credit-v2'});
 const s=asyncPath?Object.assign(Object.create(AsyncGenerationService.prototype),local):local;s.adminTestUnlimited=admin;
 let reads=0,expired=false;const prepare=local.db.prepare.bind(local.db),expire=local.ledger.expire.bind(local.ledger);
 local.ledger.expire=()=>{const result=expire();expired=true;return result;};
 local.db.prepare=sql=>{if(/^SELECT available,reserved FROM (wallets|credit_wallets) WHERE user_id=\?$/.test(sql)){assert.equal(expired,true);reads++;}return prepare(sql);};
 const first=await s.status();assert.equal(reads,2);assert.equal(first.wallet.available,tickets);assert.equal(first.wallet.credits.available,credits);assert.equal(first.generation.reason,reason);assert.deepEqual(first.generation.creditQuote,{unit,amount,policy:unit==='legacy-ticket'?'legacy-accept-v1':'delivered-2026-10-18'});
 // New requests must read new balances, not a service-wide cache.
 prepare('UPDATE wallets SET available=? WHERE user_id=?').run(7,id);reads=0;expired=false;const next=await s.status();assert.equal(reads,2);assert.equal(next.wallet.available,7);assert.equal(first.wallet.available,tickets);
});
test('separate service/account scopes never share status snapshots',async t=>{
 const a=setup(t),b=setup(t);a.db.prepare('UPDATE wallets SET available=0').run();assert.equal(a.status().wallet.available,0);assert.equal(b.status().wallet.available,3);
});
test('balance change while storage preflight yields is rejected by fresh transactional quote',async t=>{
 const s=setup(t);let enter,release;const started=new Promise(r=>enter=r),gate=new Promise(r=>release=r);s.assertOutputCapacity=async()=>{enter();await gate;};
 let p=starterProject('other');p=withGenerationInput(prepareCampaign({...p,productName:'Fixture product',productProfile:{...p.productProfile,material:'450ml steel cup'}}),'text-example');
 const body={requestId:randomUUID(),projectId:p.id,request:buildGenerationRequest(p),...generationInputs(p)};
 const pending=s.create(body);await started;s.db.prepare('UPDATE wallets SET available=0').run();release();await assert.rejects(pending,e=>e.code==='CREDIT_QUOTE_CHANGED');
 assert.equal(s.db.prepare('SELECT count(*) n FROM jobs').get().n,0);assert.equal(s.wallet().reserved,0);assert.equal(s.status().generation.reason,'NO_TEST_CREDITS');
});
