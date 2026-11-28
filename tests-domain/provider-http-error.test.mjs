import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerHttpError,retryAfterSeconds} from '../server/provider-http-error.mjs';
import {OpenAIImageAdapter,generationFailureDiagnostic} from '../server/openai-image-adapter.mjs';
import {providerFailureMessage} from '../src/provider-failure-message.ts';
const request={mode:'original',productProfile:{category:'other'},output:{format:'1:1'}};
for(const [value,expected] of [['insufficient_quota','PROVIDER_QUOTA_EXHAUSTED'],['credit_balance_exhausted','PROVIDER_QUOTA_EXHAUSTED'],['organization_usage_limit_exceeded','PROVIDER_QUOTA_EXHAUSTED'],['organization_spend_limit_exceeded','PROVIDER_QUOTA_EXHAUSTED'],['project_spend_limit_exceeded','PROVIDER_QUOTA_EXHAUSTED'],['rate_limit_exceeded','PROVIDER_TEMPORARY_RATE_LIMIT'],['rate_limit_error','PROVIDER_TEMPORARY_RATE_LIMIT'],['private-secret','PROVIDER_429_UNCLASSIFIED']])test(`429 ${value}: one call, safe diagnostic and localized guidance`,async()=>{
 let calls=0;const adapter=new OpenAIImageAdapter({apiKey:'fixture-only',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:{code:value,type:value,message:'SECRET prompt photo key'}}),{status:429,headers:{'retry-after':'12','x-request-id':'req_fixture'}});}});
 await assert.rejects(adapter.generate({request,attemptId:'fixture'}),error=>{
  assert.equal(error.code,expected);assert.equal(error.uncertain,false);
  const diagnostic=generationFailureDiagnostic({stage:'provider',error});assert.equal(diagnostic.retryAfterSeconds,12);assert.equal(diagnostic.httpStatus,429);
  assert.equal(diagnostic.providerErrorCode,value==='private-secret'?null:value);assert.ok(!JSON.stringify(diagnostic).includes('SECRET'));assert.ok(!JSON.stringify(diagnostic).includes('private-secret'));
  for(const language of ['ko','en'])assert.ok(providerFailureMessage(error.code,language));return true;
 });assert.equal(calls,1);
});
test('quota type wins over rate code; arbitrary values are discarded',async()=>{
 const result=await providerHttpError(new Response(JSON.stringify({error:{code:'rate_limit_exceeded',type:'insufficient_quota'}}),{status:429}));assert.equal(result.code,'PROVIDER_QUOTA_EXHAUSTED');
});
for(const body of ['not json',JSON.stringify({error:{message:'SECRET'}}),'x'.repeat(16385)])test(`unreadable or absent code remains unclassified (${body.length})`,async()=>{
 const result=await providerHttpError(new Response(body,{status:429}));assert.equal(result.code,'PROVIDER_429_UNCLASSIFIED');assert.equal(result.providerErrorCode,null);
});
test('never-ending body is bounded and canceled, preserving known HTTP policy',async()=>{
 let cancelled=false;const start=Date.now();const result=await providerHttpError(new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:429}),{timeoutMs:15});assert.ok(Date.now()-start<500);assert.equal(cancelled,true);assert.equal(result.code,'PROVIDER_429_UNCLASSIFIED');
});
test('Retry-After bounded numeric/date only, no arbitrary header logging',()=>{
 assert.equal(retryAfterSeconds('2.5'),3);assert.equal(retryAfterSeconds('Mon, 26 Oct 2026 12:00:05 GMT',Date.parse('2026-10-26T12:00:00Z')),5);
 for(const value of ['SECRET','-1','999999999','Infinity',null])assert.equal(retryAfterSeconds(value),null);
});
test('transport without HTTP response remains uncertain and single-call',async()=>{
 let calls=0;const adapter=new OpenAIImageAdapter({apiKey:'fixture-only',fetchImpl:async()=>{calls++;throw new TypeError('SECRET');}});
 await assert.rejects(adapter.generate({request,attemptId:'fixture'}),e=>e.uncertain&&e.code==='PROVIDER_UNCERTAIN');assert.equal(calls,1);
});
test('non-429 HTTP remains original failure category and uncertainty',async()=>{
 for(const status of [401,500]){const adapter=new OpenAIImageAdapter({apiKey:'fixture-only',fetchImpl:async()=>new Response('{"error":{"code":"insufficient_quota"}}',{status})});await assert.rejects(adapter.generate({request,attemptId:'fixture'}),e=>e.code==='PROVIDER_REQUEST_FAILED'&&e.uncertain===(status===500));}
});
