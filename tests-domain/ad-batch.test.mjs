import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GenerationService} from '../server/generation-service.mjs';
import {ProviderFailure,hashBytes} from '../server/openai-image-adapter.mjs';
import {batchPrice,batchCounts} from '../src/batch-price.ts';
const batchId='ads-'+'b'.repeat(64);
const bytes=Buffer.from('fake image for transport-only adapter');
const request={version:1,mode:'creative',operation:'image-ad-creative',subjectType:'service',productName:'Studio',productProfile:{category:'services'},brief:'Studio',source:null,copy:{title:'Studio'},creativeDirection:{visual:{id:'auto'}},specifications:[],output:{format:'1:1',locale:'ko',showDimensions:false,compositionKey:'customer snapshot'}};
function fixture(t,{tickets=0,credits=100,failAt=-1}={}){
 let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
 const s=new GenerationService({enabled:true,providerConfigured:true,testCredits:tickets,budgetMicros:8000000,adapter:{async generate(){
  calls++;await gate;if(calls===failAt)throw new ProviderFailure('TEST_FAILURE',{uncertain:false});
  return {bytes,mime:'image/png',sha256:hashBytes(bytes),width:8,height:8,role:'creative',composition:'complete-ad',cost:{microUsd:100},model:'fixture',usage:{}};
 }}});
 if(credits)s.recordTestPurchase({purchaseId:'batch-test-purchase',credits,unit:'credit-v2'});
 t.after(async()=>{release();await s.close();});
 const body=count=>({requestId:batchId,projectId:batchId,request,batch:{id:batchId,count,quote:batchPrice(s.wallet(),count)}});
 return {s,body,release,calls:()=>calls};
}
test('all six prices, mixed tickets and server-side exemption',()=>{
 for(const n of batchCounts)assert.equal(batchPrice({available:0,credits:{available:100}},n).creditsUsed,10*n);
 assert.equal(batchPrice({available:2,credits:{available:30}},4).creditsUsed,20);
 assert.equal(batchPrice({available:0,credits:{available:0},unlimited:true},10).creditsUsed,0);
});
test('ten jobs admitted atomically, crash-safe retry key and one charge per delivered image',async t=>{
 const {s,body,release,calls}=fixture(t,{failAt:4});const b=body(10);
 const result=await s.create(b);assert.equal(result.jobs.length,10);assert.deepEqual(result.wallet.credits,{available:0,reserved:100});
 assert.deepEqual((await s.create(b)).jobs.map(j=>j.id),result.jobs.map(j=>j.id));
 release();await s.waitForIdle();const end=s.batchSummary(batchId);assert.equal(calls(),10);assert.equal(end.jobs.filter(j=>j.state==='ready').length,9);
 assert.deepEqual(end.wallet.credits,{available:10,reserved:0});assert.equal((await s.create(b)).jobs.length,10);assert.equal(calls(),10);
});
test('insufficient funds and outdated totals reserve nothing',async t=>{
 const {s,body,calls}=fixture(t,{tickets:1,credits:10});await assert.rejects(s.create(body(4)),/NO_TEST_CREDITS/);
 const b=body(2);b.batch.quote.creditsUsed=0;await assert.rejects(s.create(b),/CREDIT_QUOTE_CHANGED/);assert.equal(calls(),0);assert.equal(s.wallet().reserved,0);
});
test('legacy first and unlimited administrator reserve the agreed units',async t=>{
 const {s,body,release}=fixture(t,{tickets:1,credits:10});const r=await s.create(body(2));assert.equal(r.wallet.reserved,1);assert.equal(r.wallet.credits.reserved,10);
 release();await s.waitForIdle();const other=fixture(t,{credits:0});other.s.adminTestUnlimited=true;const admin=await other.s.create(other.body(10));assert.ok(admin.jobs.every(j=>j.creditCost===0));assert.equal(admin.wallet.reserved,0);other.release();await other.s.waitForIdle();
});
