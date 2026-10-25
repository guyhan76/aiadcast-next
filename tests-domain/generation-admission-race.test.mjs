import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {ProviderFailure} from '../server/openai-image-adapter.mjs';
import {GenerationService,ApiFailure} from '../server/generation-service.mjs';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {withGenerationInput,generationInputs} from '../src/generation-input.ts';
import {buildGenerationRequest} from '../src/generation.ts';
const bytes=await sharp({create:{width:8,height:8,channels:4,background:'#ffffff'}}).png().toBuffer();
const sha256=createHash('sha256').update(bytes).digest('hex');
function body(){let p=starterProject('other');p=prepareCampaign({...p,productName:'컵',productProfile:{...p.productProfile,material:'450ml steel'}});p=withGenerationInput(p,'text-example');return {requestId:randomUUID(),projectId:p.id,request:buildGenerationRequest(p),...generationInputs(p)};}
function setup(t){let calls=0,complete;const waiting=new Promise(r=>complete=r);const service=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:2_000_000,adapter:{generate:async()=>{calls++;await waiting;return {bytes,mime:'image/png',width:8,height:8,sha256,role:'creative',composition:'complete-ad',model:'fixture',usage:{},cost:{microUsd:1}};}}});t.after(async()=>{complete();await service.close();});return {service,calls:()=>calls,finish:async()=>{complete();await service.waitForIdle();}};}
function simultaneousPreflight(service){let arrivals=0,release;const barrier=new Promise(r=>release=r);service.assertOutputCapacity=async()=>{if(++arrivals===2)release();await barrier;};}
for(const differentId of [false,true])test(`simultaneous storage preflight reuses identical input with ${differentId?'different':'same'} request IDs`,async t=>{
 const f=setup(t),input=body();simultaneousPreflight(f.service);
 const [a,b]=await Promise.all([f.service.create(input),f.service.create({...input,requestId:differentId?randomUUID():input.requestId})]);
 assert.equal(a.job.id,b.job.id);assert.equal([a,b].filter(x=>x.reused).length,1);assert.equal(f.calls(),1);
 assert.equal(f.service.db.prepare('SELECT count(*) n FROM jobs').get().n,1);assert.equal(f.service.wallet().reserved,1);
 await f.finish();assert.equal(f.service.status().budget.spentMicros,1);assert.equal(f.service.wallet().available,2);
 const again=await f.service.create(input);assert.equal(again.job.id,a.job.id);assert.equal(f.calls(),1);
});
for(const sameId of [true,false])test(`simultaneous changed input ${sameId?'conflicts on existing ID':'does not dispatch a second genuine request'}`,async t=>{
 const f=setup(t),input=body();simultaneousPreflight(f.service);
 const other={...input,requestId:sameId?input.requestId:randomUUID(),request:{...input.request,brief:'Different background'}};
 const results=await Promise.allSettled([f.service.create(input),f.service.create(other)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.find(x=>x.status==='rejected').reason.code,sameId?'IDEMPOTENCY_CONFLICT':'GENERATION_ALREADY_RUNNING');
 assert.equal(f.calls(),1);assert.equal(f.service.wallet().reserved,1);assert.equal(f.service.db.prepare('SELECT count(*) n FROM jobs').get().n,1);
});
test('storage preflight failure leaves no job, credit reservation or supplier dispatch',async t=>{
 const f=setup(t);f.service.assertOutputCapacity=async()=>{throw new ApiFailure('STORAGE_LIMIT',409);};
 const results=await Promise.allSettled([f.service.create(body()),f.service.create(body())]);
 assert.ok(results.every(r=>r.status==='rejected'&&r.reason.code==='STORAGE_LIMIT'));assert.equal(f.calls(),0);assert.equal(f.service.wallet().reserved,0);assert.equal(f.service.wallet().available,3);assert.equal(f.service.db.prepare('SELECT count(*) n FROM jobs').get().n,0);
});

test('a genuine changed request is allowed after the first dispatch completes',async t=>{
 const f=setup(t),input=body();await f.service.create(input);await f.finish();
 const second=await f.service.create({...input,requestId:randomUUID(),request:{...input.request,brief:'New separate direction'}});await f.service.waitForIdle();
 assert.equal(second.reused,false);assert.equal(f.calls(),2);assert.equal(f.service.db.prepare('SELECT count(*) n FROM jobs').get().n,2);assert.equal(f.service.status().budget.spentMicros,2);
});
test('uncertain duplicate input retains the original job and supplier hold without retry',async t=>{
 const f=setup(t);let calls=0;f.service.adapter={generate:async()=>{calls++;throw new ProviderFailure('PROVIDER_UNCERTAIN');}};
 const input=body(),first=await f.service.create(input);await f.service.waitForIdle();
 const before=f.service.status().budget,again=await f.service.create({...input,requestId:randomUUID()});
 assert.equal(again.job.id,first.job.id);assert.equal(again.job.state,'uncertain');assert.equal(calls,1);assert.equal(before.heldMicros,500000);assert.deepEqual(f.service.status().budget,before);assert.equal(f.service.wallet().available,3);
});
