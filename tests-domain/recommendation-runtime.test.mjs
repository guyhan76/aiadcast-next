import test from 'node:test';import assert from 'node:assert/strict';
import {setup,generation} from './helpers/existing-app-recommendation-fixture.mjs';
import {PostgresDatabase,cloudSchema} from '../server/cloud/postgres.mjs';
import {migrateLocalRecommendationSchema} from '../server/recommendations/local-test-migration.mjs';
import {recommendationRuntime} from '../server/recommendations/runtime.mjs';
import {createOpenAIRecommendationAdapter} from '../server/recommendations/openai-adapter.mjs';
import {savedRequestSnapshot} from '../server/recommendations/contracts.mjs';
const policy={kind:'approved-server-policy-v1',customerPolicy:'included-first-approved',customerCharge:0,model:'gpt-5.4-mini-2026-03-17',promptVersion:'recommendation-v1',reservationMicros:1000,monthlyCapMicros:2000,maxOutputTokens:600,pricing:{input:750000,cached:75000,output:4500000}}; // Mock amounts, NOT deployment policy.
const output={channels:[{channel:'website',reason:'상품 정보와 연결',usage:'제품 상세 페이지에 배치',evidence:['productName','directions']}],keywords:['배송 박스']};
test('runtime fails closed without valid policy/key and makes no request',async()=>{let calls=0;for(const p of [undefined,{},policy]){const runtime=recommendationRuntime({policy:p,transport:async()=>{calls++;}});assert.equal((await runtime.handle(new Request('https://example.com'))).status,503);}assert.equal(calls,0);assert.throws(()=>createOpenAIRecommendationAdapter({executionMode:'server',policy,model:policy.model,pricing:policy.pricing,maxOutputTokens:1000,apiKey:'synthetic',transport:async()=>{}}),/INVALID_ADAPTER_POLICY/);});
test('immutable recommendation snapshot includes real creative note, excludes contacts',()=>{const r=generation().request;r.creativeDirection={additionalInstructions:'푸른 배경, 모델명 강조'};r.contacts={email:'private@example.com'};const s=savedRequestSnapshot(r);assert.match(s.directions,/푸른 배경/);assert.ok(!JSON.stringify(s).includes('private@example.com'));});
test('actual authenticated HTTP routes use injected Responses adapter, cache and existing budget; Android origin accepted',async t=>{
 let calls=0;const s=await setup(t,{recommendationPolicy:policy,recommendationTransport:async(url,o)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(o.body);assert.equal(b.model,policy.model);assert.equal(b.max_output_tokens,600);return Response.json({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(output)}]}]});}});
 const a=await s.member('Owner',1000000,4),b=await s.member('Other',0,0),created=await s.call('/api/generations',{token:a.token,body:generation()});assert.equal(created.status,202);
 let image;for(let i=0;i<100;i++){image=(await s.call('/api/generations/'+created.data.job.id,{token:a.token})).data.job;if(image.state==='ready')break;await new Promise(r=>setTimeout(r,10));}assert.equal(image.state,'ready');
 const path='/api/generations/'+image.id+'/recommendations',db=new PostgresDatabase(s.app.pool,cloudSchema(a.user.id));assert.equal((await s.call(path,{token:a.token})).data.error.code,'RECOMMENDATION_SCHEMA_REQUIRED');assert.equal(calls,0);
 await migrateLocalRecommendationSchema(db,{executionMode:'local-test'});const before=await db.prepare('SELECT * FROM budgets').get(),attempts=await db.prepare('SELECT * FROM attempts').all();
 assert.equal((await s.call(path,{token:a.token})).data.recommendation,null);assert.equal(calls,0);
 const responses=await Promise.all([s.call(path,{token:a.token,requestOrigin:'https://appassets.androidplatform.net',body:{requestId:'once',locale:'ko'}}),s.call(path,{token:a.token,body:{requestId:'once',locale:'ko'}})]);assert.ok(responses.every(x=>x.status===200),JSON.stringify(responses));assert.equal(calls,1);
 const result=(await s.call(path,{token:a.token})).data.recommendation;assert.equal(result.state,'completed');assert.equal(result.output.provenance,'openai');assert.equal(result.customerPolicy,'included-first-approved');assert.equal(result.customerCharge,0);
 assert.equal((await db.prepare('SELECT * FROM budgets').get()).spent_micros,before.spent_micros+165);assert.deepEqual(await db.prepare('SELECT * FROM attempts').all(),attempts);
 assert.equal((await s.call('/api/recommendations/'+result.id,{token:b.token})).status,404);assert.equal((await s.call(path,{token:a.token,body:{requestId:'language',locale:'en'}})).status,409);assert.equal(calls,1);
 await s.restart();assert.equal((await s.call(path,{token:a.token})).data.recommendation.id,result.id);assert.equal(calls,1);assert.equal((await s.call('/api/generations/'+image.id,{token:a.token})).data.job.artifact.dataUrl,image.artifact.dataUrl);
});
