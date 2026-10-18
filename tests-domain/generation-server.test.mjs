import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import sharp from 'sharp';
import { GenerationService, normalizeGenerationRequest } from '../server/generation-service.mjs';
import { OpenAIImageAdapter, ProviderFailure, IMAGE_MODEL, IMAGE_REVISION, hashBytes, imageUsageCost, parseSourceAsset, GENERATION_SIZES } from '../server/openai-image-adapter.mjs';
import { createGenerationHttpServer, localServerConfiguration } from '../server/generation-server.mjs';

const bytes = await sharp({ create:{width:8,height:8,channels:4,background:'#ffffff'} }).png().toBuffer();
const source = { name:'test.png',data:`data:image/png;base64,${bytes.toString('base64')}`,width:8,height:8,sha256:hashBytes(bytes) };
const usage = { input_tokens:2100,input_tokens_details:{text_tokens:100,image_tokens:2000},output_tokens:1756 };
function request(mode='original') { return { version:1,mode,operation:mode==='original'?'compose-original':'image-product-concept',subjectType:'physical-product',productName:'Test product',productProfile:{category:'box'},brief:'Premium light and calm background',source:{sha256:source.sha256,role:mode==='original'?'protected-product':'visual-reference'},copy:{title:'봄 신상품'},specifications:[],output:{format:'1:1',locale:'ko',showDimensions:false},scene:{backgroundColor:'#ffffff'} }; }
function body(mode='original') { return {requestId:randomUUID(),projectId:'project-test-001',request:request(mode),source}; }
function result(mode='original', customUsage=usage) { return {bytes,mime:'image/png',width:8,height:8,sha256:source.sha256,role:mode==='original'?'background':'creative',usage:customUsage,cost:imageUsageCost(customUsage),model:IMAGE_MODEL,revision:IMAGE_REVISION,providerRequestId:'provider-test'}; }
function setup(t, overrides={}) {
  const calls=[];
  const adapter={generate:async options=>{calls.push(options);return result(options.request.mode);}};
  const service=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:2_000_000,adapter,...overrides});
  t.after(()=>service.close());
  return {service,calls};
}

test('administrator mode creates and accepts more than 30 images at zero credits, keeping exact usage costs and review requirements',async t=>{
 let calls=0;const {service}=setup(t,{testCredits:0,adapter:{generate:async options=>{calls++;return {...result(options.request.mode),cost:{microUsd:1}};}}});
 service.adminTestUnlimited=true;assert.equal(service.status().generation.enabled,true);assert.equal(service.wallet().unlimited,true);
 for(let i=0;i<35;i++){
  const created=await service.create(body());await service.waitForIdle();const ready=service.job(created.job.id);
  assert.equal(ready.state,'ready');assert.equal(ready.creditCost,0);assert.equal(ready.creditPolicy,'admin-unlimited');
  service.accept(ready.id,ready.artifactId);assert.equal(service.wallet().available,0);assert.equal(service.wallet().reserved,0);
 }
 assert.equal(calls,35);assert.equal(service.status().budget.spentMicros,35);
 assert.equal(service.db.prepare('SELECT COUNT(*) n FROM purchases').get().n,0);
 service.adminTestUnlimited=false;assert.equal(service.status().generation.reason,'NO_TEST_CREDITS');await assert.rejects(service.create(body()),/NO_TEST_CREDITS/);
});
test('administrator mode preserves budget and provider blockers, rejection costs and server-owned policy',async t=>{
 const {service}=setup(t,{testCredits:0});const forged=body();forged.adminTestUnlimited=true;forged.request.creditExempt=true;forged.request.role='admin';
 await assert.rejects(service.create(forged),/NO_TEST_CREDITS/);assert.equal(service.wallet().unlimited,undefined);
 service.adminTestUnlimited=true;service.providerConfigured=false;assert.equal(service.status().generation.reason,'PROVIDER_NOT_CONFIGURED');
 service.providerConfigured=true;service.budgetMicros=0;assert.equal(service.status().generation.reason,'BUDGET_NOT_AVAILABLE');
 service.budgetMicros=2_000_000;
 for(let i=0;i<3;i++){const created=await service.create(body());await service.waitForIdle();service.reject(created.job.id);}
 assert.equal(service.wallet().available,0);assert.equal(service.wallet().reserved,0);assert.ok(service.status().budget.spentMicros>0);
});
async function httpSetup(t, overrides={}) {
  const state=setup(t,overrides);
  const http=createGenerationHttpServer({service:state.service,nodeEnvironment:'test'});
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>http.close(resolve)));
  const origin=`http://127.0.0.1:${http.address().port}`;
  const call=(path,options={})=>fetch(origin+path,options);
  return {...state,http,origin,call};
}
const post=(value,extra={})=>({method:'POST',headers:{'Content-Type':'application/json','X-Aiadcast-Client':'local-studio',...extra},body:JSON.stringify(value)});

test('provider usage uses documented Sunburst token rates, missing usage is unknown',()=>{
 assert.equal(imageUsageCost(usage).microUsd,100*5+2000*8+1756*30);
 assert.equal(imageUsageCost({output_tokens:1756}),null);
 assert.equal(imageUsageCost({...usage,input_tokens:3}),null);
 assert.equal(imageUsageCost({...usage,output_tokens:-1}),null);
});
test('default startup remains opt-in with zero budget even when a key exists',t=>{
 const {service,calls}=setup(t,{enabled:false,budgetMicros:0});
 assert.equal(service.status().commercialReady,false); assert.equal(service.status().generation.enabled,false);
 assert.equal(service.status().wallet.kind,'test-credits'); assert.equal(calls.length,0);
 const config=localServerConfiguration({AIADCAST_NEXT_LOCAL_OPENAI_API_KEY:'test-placeholder'});
 assert.equal(config.enabled,false); assert.equal(config.assistantEnabled,false); assert.equal(config.budgetMicros,0);
 assert.throws(()=>localServerConfiguration({AIADCAST_SERVER_HOST:'0.0.0.0'}));
 assert.throws(()=>localServerConfiguration({NODE_ENV:'production'}));
});
test('complete-ad metadata persists by result, never by the current revision or caller claims',async t=>{
 const {service}=setup(t,{adapter:{generate:async()=>({...result('creative'),composition:'complete-ad'})}});
 const input=body('creative');input.request.output.compositionKey='{"copy":{"title":"봄 신상품"}}';
 input.request.composition='fake-attestation';const created=await service.create(input);await service.waitForIdle();
 const ready=service.job(created.job.id);assert.equal(ready.composition,'complete-ad');assert.equal(ready.compositionKey,input.request.output.compositionKey);
 service.accept(ready.id,ready.artifactId);assert.equal(service.job(ready.id).compositionKey,ready.compositionKey);
 const old=setup(t);const first=await old.service.create(body('creative'));await old.service.waitForIdle();
 assert.equal(old.service.job(first.job.id).composition,undefined);assert.equal(old.service.job(first.job.id).compositionKey,undefined);
});
test('request validation ignores client model/prices and rejects unimplemented region editing',()=>{
 const normalized=normalizeGenerationRequest({...request(),model:'free-model',credits:-999,price:0,userId:'other'});
 assert.equal(normalized.model,undefined); assert.equal(normalized.credits,undefined);
 assert.throws(()=>normalizeGenerationRequest({...request(),operation:'image-region'}),/REGION_EDIT/);
 assert.throws(()=>normalizeGenerationRequest({...request(),output:{format:'99:1',locale:'ko'}}));
 assert.throws(()=>normalizeGenerationRequest({...request(),specifications:[{axis:'width',value:'-4',unit:'mm'}]}));
});
test('server accepts fractional-inch conversions in canonical mm only',()=>{
 const specifications=[{axis:'width',value:'31.3580018',unit:'mm'}];
 assert.deepEqual(normalizeGenerationRequest({...request(),specifications}).specifications,specifications);
 for(const value of ['0','100001','2.123456789'])assert.throws(()=>normalizeGenerationRequest({...request(),specifications:[{axis:'width',value,unit:'mm'}]}));
 assert.throws(()=>normalizeGenerationRequest({...request(),specifications:[{axis:'width',value:'1',unit:'inch'}]}));
});
test('asset bytes, hash, format and decoded dimensions are validated',async()=>{
 const parsed=await parseSourceAsset(source); assert.equal(parsed.sha256,source.sha256);
 await assert.rejects(parseSourceAsset({...source,sha256:'spoof'}),/SOURCE_MISMATCH/);
 await assert.rejects(parseSourceAsset({...source,width:999}),/SOURCE_MISMATCH/);
 await assert.rejects(parseSourceAsset({...source,data:'data:image/png;base64,c2VjcmV0'}),/INVALID_IMAGE/);
 await assert.rejects(parseSourceAsset({...source,data:'https://internal.local/image'}),/INVALID_IMAGE/);
});
test('original request protects source bytes; acceptance captures one test credit exactly once',async t=>{
 const {service,calls}=setup(t); const input=body();
 const first=await service.create(input); await service.waitForIdle();
 assert.equal(calls.length,1); assert.equal(calls[0].source,null);
 assert.equal(service.db.prepare('SELECT hex(bytes) data FROM generation_assets WHERE hash=?').get(source.sha256).data,bytes.toString('hex').toUpperCase());
 const preview=service.job(first.job.id); assert.equal(preview.state,'ready'); assert.equal(preview.artifact.role,'background');
 assert.deepEqual(service.wallet(),{available:2,reserved:1,kind:'test-credits',credits:{available:0,reserved:0}});
 const replay=await service.create(input); assert.equal(replay.job.id,first.job.id);
 const freshKey=await service.create({...input,requestId:randomUUID()}); assert.equal(freshKey.job.id,first.job.id); assert.equal(calls.length,1);
 assert.throws(()=>service.accept(preview.id,'wrong'),/ARTIFACT_MISMATCH/);
 service.accept(preview.id,preview.artifact.id); service.accept(preview.id,preview.artifact.id);
 assert.deepEqual(service.wallet(),{available:2,reserved:0,kind:'test-credits',credits:{available:0,reserved:0}});
 assert.equal(service.ledger.db.prepare("SELECT count(*) n FROM credit_events WHERE kind='capture'").get().n,1);
 const newVariant=await service.create({...input,requestId:randomUUID()}); await service.waitForIdle();
 assert.notEqual(newVariant.job.id,preview.id); assert.equal(calls.length,2);
});
test('reusing an id with changed request conflicts before making another paid request',async t=>{
 const {service,calls}=setup(t); const input=body(); await service.create(input); await service.waitForIdle();
 await assert.rejects(service.create({...input,request:{...input.request,brief:'different'}}),/IDEMPOTENCY_CONFLICT/);
 assert.equal(calls.length,1);
});
test('rejected previews restore credits while supplier cost stays, repeated rejections are bounded',async t=>{
 const {service,calls}=setup(t); const input=body();
 for(let i=0;i<2;i++){ const made=await service.create({...input,requestId:randomUUID()});await service.waitForIdle();service.reject(made.job.id);service.reject(made.job.id); }
 assert.deepEqual(service.wallet(),{available:3,reserved:0,kind:'test-credits',credits:{available:0,reserved:0}});
 assert.equal(service.ledger.budget(service.period()).spent_micros,imageUsageCost(usage).microUsd*2);
 await assert.rejects(service.create({...input,requestId:randomUUID()}),/REVIEW_REQUIRED/);assert.equal(calls.length,2);
});
test('uncertain provider execution releases credits but keeps cost hold and blocks blind retry',async t=>{
 let calls=0;const {service}=setup(t,{adapter:{generate:async()=>{calls++;throw new ProviderFailure('secret-key-do-not-expose');}}});
 const input=body();const created=await service.create(input);await service.waitForIdle();
 assert.equal(service.job(created.job.id).state,'uncertain'); assert.equal(service.job(created.job.id).errorCode,'PROVIDER_UNCERTAIN');
 assert.deepEqual(service.wallet(),{available:3,reserved:0,kind:'test-credits',credits:{available:0,reserved:0}});
 assert.equal(service.ledger.budget(service.period()).held_micros,500000);
 const retried=await service.create({...input,requestId:randomUUID()}); assert.equal(retried.job.id,created.job.id);assert.equal(calls,1);
});
test('missing usage preserves artifact audit data but cannot be accepted or charged',async t=>{
 const {service}=setup(t,{adapter:{generate:async()=>result('original',null)}});
 const made=await service.create(body());await service.waitForIdle();const job=service.job(made.job.id);
 assert.equal(job.state,'uncertain');assert.equal(job.artifact,null);assert.ok(job.artifactId);
 assert.throws(()=>service.accept(job.id,job.artifactId)); assert.equal(service.wallet().available,3);
 assert.equal(service.ledger.budget(service.period()).held_micros,500000);
});
test('known upstream refusal restores credits and does not auto retry or expose response body',async t=>{
 let calls=0;const {service}=setup(t,{adapter:{generate:async()=>{calls++;throw new ProviderFailure('PROVIDER_REQUEST_FAILED',{uncertain:false,providerStatus:401});}}});
 const made=await service.create(body());await service.waitForIdle();assert.equal(service.job(made.job.id).state,'failed');
 assert.equal(service.wallet().available,3);assert.equal(service.ledger.budget(service.period()).held_micros,0);assert.equal(calls,1);
});
test('insufficient supplier budget rejects before credit reservation or external work',async t=>{
 const {service,calls}=setup(t,{budgetMicros:499999});await assert.rejects(service.create(body()),/BUDGET_NOT_AVAILABLE/);
 assert.equal(calls.length,0);assert.equal(service.wallet().available,3);assert.equal(service.wallet().reserved,0);
});
test('durable ready preview and idempotency survive a restart',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'aiadcast-generation-'));const path=join(folder,'local.sqlite');let calls=0;
 const options={databasePath:path,enabled:true,providerConfigured:true,budgetMicros:2000000,adapter:{generate:async()=>{calls++;return result();}}};
 try{
  const a=new GenerationService(options);const input=body();const made=await a.create(input);await a.waitForIdle();await a.close();
  const b=new GenerationService(options);assert.equal(b.job(made.job.id).state,'ready');const replay=await b.create(input);assert.equal(replay.job.id,made.job.id);
  b.accept(made.job.id,b.job(made.job.id).artifactId);assert.equal(b.wallet().available,2);assert.equal(calls,1);await b.close();
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('restart treats dispatched-but-unsettled work as uncertain and never repeats it',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'aiadcast-generation-recovery-'));const path=join(folder,'local.sqlite');
 try{
  const a=new GenerationService({databasePath:path});const id=randomUUID();
  a.ledger.reserve({jobId:id,userId:'aiadcast-next-local-developer',credits:1,requestHash:'interrupted-request',modelRevision:IMAGE_REVISION,expiresAt:Date.now()+60000});
  a.db.prepare('INSERT INTO generation_records(id,project_id,fingerprint,request_json,created_at) VALUES (?,?,?,?,?)').run(id,'project-restart','interrupted-request',JSON.stringify(request()),Date.now());
  a.ledger.beginAttempt({jobId:id,attemptId:'interrupted-attempt',period:a.period(),maximumMicros:500000,limitMicros:1000000});await a.close();
  const b=new GenerationService({databasePath:path});assert.equal(b.job(id).state,'uncertain');assert.equal(b.wallet().available,3);assert.equal(b.ledger.budget(b.period()).held_micros,500000);await b.close();
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('HTTP origin, client header, content type and production guards protect local API',async t=>{
 const {service,call,origin}=await httpSetup(t,{enabled:false});
 assert.equal((await call('/api/status',{headers:{Origin:'https://evil.example'}})).status,403);
 const wrongHostStatus=await new Promise((resolve,reject)=>{const req=httpRequest(origin+'/api/status',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
 assert.equal(wrongHostStatus,403);
 assert.equal((await call('/api/generations', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await call('/api/generations', {method:'POST',headers:{'Content-Type':'text/plain','X-Aiadcast-Client':'local-studio'},body:'{}'})).status,415);
 const response=await call('/api/status');const status=await response.json();assert.equal(status.commercialReady,false);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.throws(()=>createGenerationHttpServer({service,nodeEnvironment:'production'}));
 assert.throws(()=>createGenerationHttpServer({service,allowedOrigins:['https://public.example']}));
});
test('HTTP creation, history, accept and duplicate actions follow server-owned wallet',async t=>{
 const {service,call}=await httpSetup(t);const input=body();const response=await call('/api/generations',post({...input,credits:-100}));
 assert.equal(response.status,202);const created=await response.json();await service.waitForIdle();
 const preview=await (await call(`/api/generations/${created.job.id}`)).json();assert.equal(preview.job.state,'ready');
 const history=await (await call('/api/generations?projectId=project-test-001')).json();assert.equal(history.jobs.length,1);assert.equal(history.jobs[0].artifact,null);
 const accepted=await (await call(`/api/generations/${created.job.id}/accept`,post({artifactId:preview.job.artifact.id}))).json();assert.equal(accepted.wallet.available,2);assert.equal(accepted.job.state,'accepted');
});
test('image adapter uses background-only generation for original and multipart edits for creative',async()=>{
 const output=await sharp({create:{width:1024,height:1024,channels:4,background:'#ddd'}}).png().toBuffer();
 const calls=[];const adapter=new OpenAIImageAdapter({apiKey:'fake-test',fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({data:[{b64_json:output.toString('base64')}],usage}),{status:200,headers:{'x-request-id':'mock'}});}});
 const original=await adapter.generate({request:request(),source:await parseSourceAsset(source),attemptId:randomUUID()});
 assert.equal(original.role,'background');assert.ok(calls[0].url.endsWith('/generations'));
 const payload=JSON.parse(calls[0].options.body);assert.equal(payload.model,IMAGE_MODEL);assert.equal(payload.quality,'high');assert.equal(payload.size,'1024x1024');assert.equal(payload.n,1);assert.ok(payload.prompt.includes('ONLY an empty'));assert.ok(!payload.prompt.includes(source.data));assert.equal(calls[0].options.redirect,'error');
 const creative=await adapter.generate({request:request('creative'),source:await parseSourceAsset(source),attemptId:randomUUID()});
 assert.equal(creative.role,'creative');assert.ok(calls[1].url.endsWith('/edits'));assert.ok(calls[1].options.body instanceof FormData);assert.equal(calls[1].options.body.get('model'),IMAGE_MODEL);assert.ok(calls[1].options.body.get('image') instanceof Blob);
});
test('image adapter never fetches provider image URLs and hides raw API errors',async()=>{
 const adapter=new OpenAIImageAdapter({apiKey:'fake-test',fetchImpl:async()=>new Response(JSON.stringify({data:[{url:'http://internal/secret'}],usage}),{status:200})});
 await assert.rejects(adapter.generate({request:request(),source:null,attemptId:randomUUID()}),/PROVIDER_INVALID_RESPONSE/);
 const failing=new OpenAIImageAdapter({apiKey:'fake-test',fetchImpl:async()=>new Response('secret-key-value',{status:401})});
 await assert.rejects(failing.generate({request:request(),source:null,attemptId:randomUUID()}),error=>error.code==='PROVIDER_REQUEST_FAILED'&&!error.message.includes('secret')&&!error.uncertain);
 for (const format of ['1:1','4:5','3:4','2:3','9:16','16:9','1.91:1']) assert.ok(GENERATION_SIZES[format],`Missing supported ad ratio ${format}`);
});
test('text calls share durable supplier budget, never consume image credits and replay cached result',async t=>{
 let calls=0;const proposal={proposal:{title:'New season',description:'A fresh start'},cost:{microUsd:2000,usd:.002},usage:{input_tokens:1000,output_tokens:100},review:{required:true},model:'gpt-5.4-mini'};
 const {service}=setup(t,{assistantEnabled:true,assistantAdapter:async()=>{calls++;return proposal;}});
 const input={requestId:randomUUID(),kind:'suggest',sourceLocale:'ko',targetLocale:'en',productName:'Cafe',description:'Spring menu',copy:{title:'New season',description:'A fresh start'}};
 const first=await service.assist(input);assert.deepEqual(first,proposal);assert.equal(service.wallet().available,3);
 await service.assist(input);assert.equal(calls,1);assert.equal(service.ledger.budget(service.period()).spent_micros,2000);
 await assert.rejects(service.assist({...input,productName:'Changed'}),/IDEMPOTENCY_CONFLICT/);
});
test('uncertain text call retains its cost reservation and cannot be silently repeated',async t=>{
 let calls=0;const {service}=setup(t,{assistantEnabled:true,assistantAdapter:async()=>{calls++;throw new ProviderFailure('TIMEOUT');}});
 const input={requestId:randomUUID(),kind:'suggest',sourceLocale:'ko',targetLocale:'en',productName:'Cafe',copy:{title:'Menu',description:''}};
 await assert.rejects(service.assist(input),/PROVIDER_UNCERTAIN/);await assert.rejects(service.assist(input),/PROVIDER_UNCERTAIN/);
 assert.equal(calls,1);assert.equal(service.ledger.budget(service.period()).held_micros,30000);assert.equal(service.wallet().available,3);
});

test('ten references reach creative adapter in order; tampering, duplicates and an eleventh are rejected before reservation',async t=>{
 const {service,calls}=setup(t);const refs=[];
 for(let i=0;i<9;i++){const b=await sharp({create:{width:8,height:8,channels:4,background:{r:i*20,g:80,b:60,alpha:1}}}).png().toBuffer();refs.push({name:`ref-${i}.png`,data:`data:image/png;base64,${b.toString('base64')}`,width:8,height:8,sha256:hashBytes(b)});}
 const input={...body('creative'),references:refs};input.request.references=refs.map(a=>({sha256:a.sha256,role:'additional-product-reference'}));
 const before=service.wallet();
 await assert.rejects(service.create({...input,references:[...refs,source]}),/INVALID_IMAGE/);
 await assert.rejects(service.create({...input,references:[{...refs[0],sha256:'a'.repeat(64)},...refs.slice(1)]}),/SOURCE_MISMATCH/);
 const duplicate={...input,request:{...input.request,references:refs.map((a,i)=>({sha256:i===0?source.sha256:a.sha256}))},references:[source,...refs.slice(1)]};
 await assert.rejects(service.create(duplicate),/INVALID_IMAGE/);assert.deepEqual(service.wallet(),before);assert.equal(calls.length,0);
 const created=await service.create(input);await service.waitForIdle();assert.equal(service.job(created.job.id).state,'ready');
 assert.equal(calls.length,1);assert.equal(calls[0].source.sha256,source.sha256);assert.deepEqual(calls[0].references.map(a=>a.sha256),refs.map(a=>a.sha256));
});
test('multi-image adapter serializes every input and premium direction as image edits, never a collage request',async()=>{
 const output=await sharp({create:{width:1024,height:1024,channels:4,background:'#ddd'}}).png().toBuffer();let sent;
 const adapter=new OpenAIImageAdapter({apiKey:'fake',fetchImpl:async(url,options)=>{sent={url,body:options.body};return new Response(JSON.stringify({data:[{b64_json:output.toString('base64')}],usage}));}});
 const parsed=await parseSourceAsset(source);await adapter.generate({request:request('creative'),source:parsed,references:Array(9).fill(parsed),attemptId:randomUUID()});
 assert.ok(sent.url.endsWith('/edits'));assert.equal(sent.body.getAll('image[]').length,10);
 assert.match(sent.body.get('prompt'),/FIRST reference/);assert.match(sent.body.get('prompt'),/full-frame luxury brand campaign/);assert.match(sent.body.get('prompt'),/Choose the art direction automatically/);assert.doesNotMatch(sent.body.get('prompt'),/Follow only the selected style/);assert.match(sent.body.get('prompt'),/Honor recorded changes/);
 for(const image of sent.body.getAll('image[]'))assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
});

