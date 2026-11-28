import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GenerationService} from '../server/generation-service.mjs';
import {ProviderFailure,hashBytes} from '../server/openai-image-adapter.mjs';
import {promptFor} from '../server/openai-image-adapter.mjs';
import {generationMatchKey} from '../src/generation-match.ts';
import {batchPrice,batchCounts} from '../src/batch-price.ts';
const batchId='ads-'+'b'.repeat(64);
const bytes=Buffer.from('fake image for transport-only adapter');
const request={version:1,mode:'creative',operation:'image-ad-creative',subjectType:'service',productName:'Studio',productProfile:{category:'services'},brief:'Studio',source:null,copy:{title:'Studio'},creativeDirection:{visual:{id:'auto'}},specifications:[],output:{format:'1:1',locale:'ko',showDimensions:false,compositionKey:'customer snapshot'}};
function fixture(t,{tickets=0,credits=100,failAt=-1}={}){
 const sent=[];let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
 const s=new GenerationService({enabled:true,providerConfigured:true,testCredits:tickets,budgetMicros:8000000,adapter:{async generate({request}){
  sent.push(request);calls++;await gate;if(calls===failAt)throw new ProviderFailure('TEST_FAILURE',{uncertain:false});
  return {bytes,mime:'image/png',sha256:hashBytes(bytes),width:8,height:8,role:'creative',composition:'complete-ad',cost:{microUsd:100},model:'fixture',usage:{}};
 }}});
 if(credits)s.recordTestPurchase({purchaseId:'batch-test-purchase',credits,unit:'credit-v2'});
 t.after(async()=>{release();await s.close();});
 const body=count=>({requestId:batchId,projectId:batchId,request,batch:{id:batchId,count,quote:batchPrice(s.wallet(),count)}});
 return {s,body,release,sent,calls:()=>calls};
}
test('all six prices, mixed tickets and server-side exemption',()=>{
 for(const n of batchCounts)assert.equal(batchPrice({available:0,credits:{available:100}},n).creditsUsed,5*n);
 assert.equal(batchPrice({available:2,credits:{available:30}},4).creditsUsed,10);
 assert.equal(batchPrice({available:0,credits:{available:0},unlimited:true},10).creditsUsed,0);
});
test('ten jobs admitted atomically, crash-safe retry key and one charge per delivered image',async t=>{
 const {s,body,release,calls,sent}=fixture(t,{failAt:4});const b=body(10);
 b.request={...b.request,batchDirection:{position:123,direction:'untrusted override'}};
 const result=await s.create(b);assert.equal(result.jobs.length,10);assert.deepEqual(result.wallet.credits,{available:50,reserved:50});
 assert.deepEqual((await s.create(b)).jobs.map(j=>j.id),result.jobs.map(j=>j.id));
 release();await s.waitForIdle();const end=s.batchSummary(batchId);assert.equal(calls(),10);assert.equal(end.jobs.filter(j=>j.state==='ready').length,9);
 assert.deepEqual(sent.map(r=>r.batchDirection.position),Array.from({length:10},(_,i)=>i+1));
 assert.equal(new Set(sent.map(r=>r.batchDirection.role)).size,10);
 for(const [i,r] of sent.entries()){
  const saved=JSON.parse(s.db.prepare('SELECT request_json FROM generation_records WHERE id=?').get(result.jobs[i].id).request_json);
  assert.deepEqual(saved.batchDirection,r.batchDirection);
  assert.equal(generationMatchKey(r),generationMatchKey(sent[0]));
  assert.ok(promptFor(r).includes('Render only image '+(i+1)+' of 10.'));
  assert.ok(!promptFor(r).includes('untrusted override'));
 }
 assert.deepEqual(end.wallet.credits,{available:55,reserved:0});assert.equal((await s.create(b)).jobs.length,10);assert.equal(calls(),10);
});
test('insufficient funds and outdated totals reserve nothing',async t=>{
 const {s,body,calls}=fixture(t,{tickets:1,credits:10});await assert.rejects(s.create(body(4)),/NO_TEST_CREDITS/);
 const b=body(2);b.batch.quote.creditsUsed=0;await assert.rejects(s.create(b),/CREDIT_QUOTE_CHANGED/);assert.equal(calls(),0);assert.equal(s.wallet().reserved,0);
});
test('legacy first and unlimited administrator reserve the agreed units',async t=>{
 const {s,body,release}=fixture(t,{tickets:1,credits:10});const r=await s.create(body(2));assert.equal(r.wallet.reserved,1);assert.equal(r.wallet.credits.reserved,5);
 release();await s.waitForIdle();const other=fixture(t,{credits:0});other.s.adminTestUnlimited=true;const admin=await other.s.create(other.body(10));assert.ok(admin.jobs.every(j=>j.creditCost===0));assert.equal(admin.wallet.reserved,0);other.release();await other.s.waitForIdle();
});

function carouselBody(body,count){
 const b=body(count);b.request={...b.request,output:{...b.request.output,format:'4:5'}};
 b.batch.storyPlan={continuity:'Same cafe and white plate.',cards:Array.from({length:count},(_,i)=>({caption:'Approved caption '+(i+1),scene:'Moment '+(i+1)}))};
 return b;
}

for(const count of [4,6,10])test(`a retried ${count}-card carousel keeps ordered approved jobs and charges only once`,async t=>{
 const {s,body,release,sent,calls}=fixture(t),b=carouselBody(body,count);
 const accepted=await s.create(b),ids=accepted.jobs.map(j=>j.id);
 assert.equal(accepted.jobs.length,count);
 assert.deepEqual(accepted.wallet.credits,{available:100-count*5,reserved:count*5});
 const retry=await s.create(b);
 assert.equal(retry.reused,true);assert.deepEqual(retry.jobs.map(j=>j.id),ids);assert.deepEqual(retry.wallet,accepted.wallet);
 const changed=structuredClone(b);changed.batch.storyPlan.cards[0].caption='Another headline';
 await assert.rejects(s.create(changed),/IDEMPOTENCY_CONFLICT/);
 release();await s.waitForIdle();
 assert.equal(calls(),count);
 assert.deepEqual(sent.map(r=>r.batchDirection.caption),b.batch.storyPlan.cards.map(c=>c.caption));
 assert.deepEqual(sent.map(r=>r.batchDirection.position),Array.from({length:count},(_,i)=>i+1));
 for(const [i,r] of sent.entries()){
   assert.equal(r.output.format,'4:5');assert.equal(r.batchDirection.count,count);
   assert.equal(r.batchDirection.role,'story');assert.equal(r.batchDirection.locked,true);
   const saved=JSON.parse(s.db.prepare('SELECT request_json FROM generation_records WHERE id=?').get(ids[i]).request_json);
   assert.deepEqual(saved.batchDirection,r.batchDirection);
 }
 const finished=s.batchSummary(batchId);
 for(const [i,j] of finished.jobs.entries()){
   assert.equal(j.projectId,batchId+'-'+(i+1));assert.equal(j.state,'ready');
   assert.equal(j.requestFingerprint,hashBytes(Buffer.from(generationMatchKey(sent[0]))));
   assert.equal(j.creditCost,5);assert.equal(j.creditCaptured,true);
 }
 assert.deepEqual(finished.wallet.credits,{available:100-count*5,reserved:0});
 const completeRetry=await s.create(b);
 assert.equal(completeRetry.reused,true);assert.deepEqual(completeRetry.jobs.map(j=>j.id),ids);
 assert.deepEqual(completeRetry.wallet,finished.wallet);assert.equal(calls(),count);
});

test('carousel length mismatches, unsupported counts and wrong ratios reserve nothing',async t=>{
 const {s,body,calls}=fixture(t),before=s.wallet();
 const wrongCount=[0,1,3,5,12,2.5,'6',null].map(count=>{
   const b=carouselBody(body,4);b.batch.count=count;return b;
 });
 const six=carouselBody(body,6);six.batch.storyPlan=carouselBody(body,4).batch.storyPlan;
 const ten=carouselBody(body,10);ten.batch.storyPlan=carouselBody(body,6).batch.storyPlan;
 const storyRatio=carouselBody(body,6);storyRatio.request.output.format='9:16';
 for(const b of [...wrongCount,six,ten,storyRatio]){
   await assert.rejects(s.create(b),/INVALID_BATCH/);
   assert.deepEqual(s.wallet(),before);
 }
 assert.equal(calls(),0);assert.equal(s.db.prepare('SELECT count(*) n FROM ad_batches').get().n,0);
});

test('a failed card restores its five credits without replaying the six-card batch',async t=>{
 const {s,body,release,calls}=fixture(t,{failAt:3}),b=carouselBody(body,6);
 const admitted=await s.create(b);assert.deepEqual(admitted.wallet.credits,{available:70,reserved:30});
 release();await s.waitForIdle();
 const finished=s.batchSummary(batchId);
 assert.deepEqual(finished.jobs.map(j=>j.state),['ready','ready','failed','ready','ready','ready']);
 assert.equal(finished.jobs[2].creditCaptured,false);
 assert.deepEqual(finished.wallet.credits,{available:75,reserved:0});
 const retry=await s.create(b);
 assert.equal(retry.reused,true);assert.deepEqual(retry.wallet,finished.wallet);
 assert.deepEqual(retry.jobs.map(j=>j.id),admitted.jobs.map(j=>j.id));assert.equal(calls(),6);
});

test('six-card carousel settles legacy tickets and credits separately and restores a failed ticket',async t=>{
 const {s,body,release}=fixture(t,{tickets:2,credits:100,failAt:1}),b=carouselBody(body,6);
 const admitted=await s.create(b);
 assert.equal(admitted.wallet.available,0);assert.equal(admitted.wallet.reserved,2);
 assert.deepEqual(admitted.wallet.credits,{available:80,reserved:20});
 release();await s.waitForIdle();
 const finished=s.batchSummary(batchId);
 assert.equal(finished.jobs[0].state,'failed');
 assert.deepEqual(finished.jobs.map(j=>j.creditUnit),['legacy-ticket','legacy-ticket','credit-v2','credit-v2','credit-v2','credit-v2']);
 assert.equal(finished.wallet.available,1);assert.equal(finished.wallet.reserved,1);
 assert.deepEqual(finished.wallet.credits,{available:80,reserved:0});
 const legacy=finished.jobs[1];s.accept(legacy.id,legacy.artifactId);s.accept(legacy.id,legacy.artifactId);
 assert.equal(s.wallet().available,1);assert.equal(s.wallet().reserved,0);
 assert.deepEqual(s.wallet().credits,{available:80,reserved:0});
});

test('server-authorized administrator carousel remains exempt through failure and later role change',async t=>{
 const {s,body,release,calls}=fixture(t,{credits:0,failAt:5});s.adminTestUnlimited=true;
 const b=carouselBody(body,10),admitted=await s.create(b);
 assert.ok(admitted.jobs.every(j=>j.creditCost===0&&j.creditPolicy==='admin-unlimited'));
 assert.equal(admitted.wallet.reserved,0);assert.deepEqual(admitted.wallet.credits,{available:0,reserved:0});
 s.adminTestUnlimited=false;release();await s.waitForIdle();
 const finished=s.batchSummary(batchId);
 assert.equal(finished.jobs.filter(j=>j.state==='ready').length,9);
 assert.equal(finished.jobs[4].state,'failed');assert.ok(finished.jobs.every(j=>j.creditCost===0));
 for(const job of finished.jobs.filter(j=>j.state==='ready'))s.accept(job.id,job.artifactId);
 assert.equal(s.wallet().available,0);assert.equal(s.wallet().reserved,0);
 assert.deepEqual(s.wallet().credits,{available:0,reserved:0});
 assert.equal((await s.create(b)).reused,true);assert.equal(calls(),10);
});
