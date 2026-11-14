import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generationFailureDiagnostic,ProviderFailure} from '../server/openai-image-adapter.mjs';
test('failure diagnostics contain only fixed enums and a safe job identifier',()=>{
 const secret='private prompt token image https://example.com/secret';
 const err=new ProviderFailure('PROVIDER_UNCERTAIN',{diagnosticCode:'PROVIDER_TIMEOUT',providerStatus:504});err.message=secret;err.stack=secret;err.body=secret;
 assert.deepEqual(generationFailureDiagnostic({jobId:'12345678-1234-1234-1234-123456789abc',stage:'provider',error:err}),{event:'generation_failure',jobId:'12345678-1234-1234-1234-123456789abc',stage:'provider',code:'PROVIDER_TIMEOUT',elapsedMs:null,timeoutMs:null,endpoint:null,providerRequestId:null,httpStatus:504});
 const hidden=generationFailureDiagnostic({jobId:secret,stage:secret,error:{code:secret,message:secret}});assert.equal(JSON.stringify(hidden).includes(secret),false);assert.equal(hidden.code,'UNCLASSIFIED');assert.equal(hidden.jobId,null);
 assert.equal(generationFailureDiagnostic({stage:'persist-image',error:{code:'SUPABASE_UPLOAD_FAILED'}}).code,'SUPABASE_UPLOAD_FAILED');
});

import {OpenAIImageAdapter} from '../server/openai-image-adapter.mjs';
const request={mode:'original',productProfile:{category:'other'},output:{format:'1:1'}};
for(const status of [400,401,403,404,422,429,500,502])test(`HTTP ${status} survives response cleanup failure without changing uncertainty policy`,async()=>{
 const adapter=new OpenAIImageAdapter({apiKey:'fixture-only',fetchImpl:async()=>new Response(new ReadableStream({cancel(){throw Error('private body cleanup failure');}}),{status,headers:{'x-request-id':'req_fixture123'}})});
 await assert.rejects(adapter.generate({request,attemptId:'fixture'}),error=>{
  assert.equal(error.uncertain,status>=500);const d=generationFailureDiagnostic({stage:'provider',error});assert.equal(d.httpStatus,status);assert.equal(d.code,'PROVIDER_HTTP');assert.equal(d.providerRequestId,'req_fixture123');assert.equal(d.endpoint,'generations');assert.equal(d.timeoutMs,180000);assert.ok(d.elapsedMs>=0);assert.ok(!JSON.stringify(d).includes('private body'));return true;
 });
});
test('malformed successful response retains status but rejects unsafe request-id header',async()=>{
 const adapter=new OpenAIImageAdapter({apiKey:'fixture-only',fetchImpl:async()=>new Response('not json',{headers:{'x-request-id':'https://private.example/token'}})});
 await assert.rejects(adapter.generate({request,attemptId:'fixture'}),error=>{const d=generationFailureDiagnostic({stage:'provider',error});assert.equal(d.code,'PROVIDER_INVALID_RESPONSE');assert.equal(d.httpStatus,200);assert.equal(d.providerRequestId,null);return true;});
});
