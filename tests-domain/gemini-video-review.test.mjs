import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAVReview,validateAVResult,reviewAV,AV_MODEL} from '../server/gemini-video-review.mjs';
import {normalizeAssistantRequest} from '../server/text-assistant.mjs';
const request={kind:'video-av-review',requestId:'av-review-test',targetLocale:'ko',brief:'피자 치즈',seconds:20,mime:'video/mp4',data:Buffer.from('0000ftyp0000').toString('base64'),consent:true};
const issue={from:7,to:10,category:'sync',mode:'clip',note:'치즈 동작과 대사 맞추기',evidence:'들기 전에 대사가 나옴',confidence:.8};
const review={audioStatus:'audible',issues:[issue]};
test('normalize consented video, reject invalid consent and MIME',()=>{
 assert.deepEqual(normalizeAssistantRequest(request),request);
 for(const change of [{consent:false},{mime:'image/png'},{seconds:31},{data:'AAAA'}])assert.throws(()=>normalizeAVReview({...request,...change}));
});
test('validate timestamps and preserve evidence',()=>{
 assert.deepEqual(validateAVResult(review,20),review);
 for(const change of [{from:-1},{to:21},{to:7},{confidence:1.1},{category:'unknown'}])assert.throws(()=>validateAVResult({...review,issues:[{...issue,...change}]},20));
 assert.deepEqual(validateAVResult({audioStatus:'uncertain',issues:[]},20),{audioStatus:'uncertain',issues:[]});
});
test('Gemini transport sends complete media then validates result and usage',async()=>{
 const calls=[];
 const result=await reviewAV({request,apiKey:'fake-key',fetchImpl:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body),headers:options.headers});
  return Response.json(calls.length===1?{totalTokens:6000}:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(review)}]}}],usageMetadata:{promptTokenCount:6000,candidatesTokenCount:300}});
 }});
 assert.equal(calls.length,2);
 assert.match(calls[0].url,/:countTokens$/);
 assert.match(calls[1].url,/:generateContent$/);
 assert.equal(calls[1].body.contents[0].parts[0].inlineData.data,request.data);
 assert.equal(calls[1].headers['x-goog-api-key'],'fake-key');
 assert.equal(result.model,AV_MODEL);assert.deepEqual(result.issues,[issue]);assert.equal(result.cost.microUsd,6750);
});
test('reject over-budget video before generation',async()=>{
 let calls=0;await assert.rejects(reviewAV({request,apiKey:'fake',fetchImpl:async()=>{calls++;return Response.json({totalTokens:20001});}}),/AV_INPUT_BUDGET_EXCEEDED/);assert.equal(calls,1);
});
test('missing key and missing consent cannot call Gemini',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('unexpected');};
 await assert.rejects(reviewAV({request,apiKey:'',fetchImpl}),/PROVIDER_NOT_CONFIGURED/);
 await assert.rejects(reviewAV({request:{...request,consent:false},apiKey:'fake',fetchImpl}),/INVALID_ASSISTANT_REQUEST/);assert.equal(calls,0);
});
test('provider refuses or returns invalid timestamp without fabricated pass',async()=>{
 for(const candidate of [{finishReason:'MAX_TOKENS'},{finishReason:'STOP',content:{parts:[{text:JSON.stringify({...review,issues:[{...issue,to:50}]})}]}}]){
  let n=0;await assert.rejects(reviewAV({request,apiKey:'fake',fetchImpl:async()=>Response.json(++n===1?{totalTokens:5000}:{candidates:[candidate]})}),/PROVIDER_/);
 }
});
