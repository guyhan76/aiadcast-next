import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assistCopy,normalizeAssistantRequest,reviewNumericChanges,textUsageCost,TEXT_MODEL,TEXT_MAX_HOLD_MICROS} from '../server/text-assistant.mjs';
import {newProject} from '../src/model.ts';
import {applyCopyProposal,copySnapshot,copySnapshotCurrent,makeCopyRequest,parseCopyProposal} from '../src/ai-copy.ts';

const request=()=>({requestId:'copy-request-1234',kind:'suggest',sourceLocale:'ko',targetLocale:'ko',productName:'커피',description:'신메뉴 출시',copy:{title:'커피 6,000원',description:'10월 10일까지'}});
const envelope=(proposal={title:'새로운 커피, 6,000원',description:'10월 10일까지 만나보세요.'},extra={})=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(proposal)}}],usage:{prompt_tokens:1000,completion_tokens:200},...extra});
const mock=result=>async()=>new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json','x-request-id':'provider-req'}});

test('normalization drops arbitrary context and rejects malformed requests before a paid call',()=>{
 const safe=normalizeAssistantRequest({...request(),company:'secret-company',contact:'010-1234-5678',model:'expensive',copy:{...request().copy,website:'https://private.example'}});
 assert.deepEqual(Object.keys(safe),['requestId','kind','sourceLocale','targetLocale','productName','description','copy','cta']);
 assert.deepEqual(safe.cta,{requested:false,text:''});
 assert.equal(safe.copy.website,undefined);
 for(const changes of [{requestId:'x'},{kind:'image'},{targetLocale:'fr'},{copy:{title:'x'.repeat(181),description:''}},{copy:null},{description:'\u0000'},{kind:'translate'}])assert.throws(()=>normalizeAssistantRequest({...request(),...changes}));
});
test('Chat Completions request uses a fixed text model, bounded output, structured data and no stored result',async()=>{
 let count=0;
 const output=await assistCopy({request:request(),apiKey:'unit-test-placeholder',fetchImpl:async(url,options)=>{
  count++;assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);assert.equal(body.model,TEXT_MODEL);assert.equal(body.store,false);assert.equal(body.max_completion_tokens,1200);assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.response_format.json_schema.schema.additionalProperties,false);
  assert.deepEqual(JSON.parse(body.messages[1].content).copy,request().copy);return mock(envelope())();
 }});
 assert.equal(count,1);assert.equal(output.review.required,true);assert.equal(output.proposal.title,'새로운 커피, 6,000원');assert.equal(output.cost.microUsd,1650);assert.equal(output.providerRequestId,'provider-req');assert.ok(TEXT_MAX_HOLD_MICROS>output.cost.microUsd);
});
test('only explicitly requested source and target languages control translation',async()=>{
 const data={...request(),kind:'translate',targetLocale:'en'};
 const response=await assistCopy({request:data,apiKey:'test',fetchImpl:mock(envelope({title:'Coffee: KRW 6,000',description:'Available until October 10.'}))});
 assert.equal(response.targetLocale,'en');assert.equal(response.kind,'translate');assert.equal(response.review.required,true);
});
test('no implicit retry and no provider details leak on rejection, timeout or errors',async()=>{
 for(const [status,uncertain] of [[401,false],[429,false],[500,true]]){
  let calls=0;await assert.rejects(assistCopy({request:request(),apiKey:'test',fetchImpl:async()=>{calls++;return new Response('private-provider-details',{status});}}),error=>error.uncertain===uncertain&&!error.message.includes('private'));
  assert.equal(calls,1);
 }
 await assert.rejects(assistCopy({request:request(),apiKey:'test',fetchImpl:async()=>{throw Error('private-key-in-network-error');}}),error=>error.code==='PROVIDER_UNCERTAIN'&&!error.message.includes('private'));
});
test('missing key or unapproved model never calls the provider',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('not expected');};
 await assert.rejects(assistCopy({request:request(),fetchImpl}),/PROVIDER_NOT_CONFIGURED/);
 await assert.rejects(assistCopy({request:request(),apiKey:'test',model:'automatic-latest',fetchImpl}),/ASSISTANT_MODEL_NOT_APPROVED/);
 assert.equal(calls,0);
});
test('incomplete, refused, malformed and overlong outputs stay uncertain instead of becoming a successful proposal',async()=>{
 const invalid=[envelope(undefined,{choices:[{finish_reason:'length',message:{role:'assistant',content:'{}'}}]}),envelope(undefined,{choices:[{finish_reason:'stop',message:{role:'assistant',refusal:'no',content:null}}]}),envelope({title:'x',description:'y',company:'changed'}),envelope({title:'x'.repeat(181),description:'x'}),envelope({title:'',description:'x'}),envelope(undefined,{choices:[]})];
 for(const result of invalid)await assert.rejects(assistCopy({request:request(),apiKey:'test',fetchImpl:mock(result)}),error=>error.uncertain===true);
});
test('usage is estimated without double-counting reasoning or claiming missing usage is free',async()=>{
 assert.equal(textUsageCost({input_tokens:1000,output_tokens:200,output_tokens_details:{reasoning_tokens:100}}).microUsd,1650);
 assert.equal(textUsageCost({input_tokens:0,output_tokens:1}).microUsd,5);
 assert.equal(textUsageCost({input_tokens:1000}),null);
 const response=await assistCopy({request:request(),apiKey:'test',fetchImpl:mock(envelope(undefined,{usage:undefined}))});
 assert.equal(response.cost,null);assert.equal(response.usage,null);
});
test('chat completion usage includes reasoning once and preserves unknown usage',async()=>{
 const response=await assistCopy({request:request(),apiKey:'test',fetchImpl:mock(envelope(undefined,{usage:{prompt_tokens:1000,completion_tokens:200,completion_tokens_details:{reasoning_tokens:150}}}))});
 assert.equal(response.cost.microUsd,1650);
 assert.equal(response.usage.output_tokens_details.reasoning_tokens,150);
 const unknown=await assistCopy({request:request(),apiKey:'test',fetchImpl:mock(envelope(undefined,{usage:{prompt_tokens:1000}}))});
 assert.equal(unknown.cost,null);
});
test('multiple choices, unexpected tools and non-text results cannot become an approved proposal',async()=>{
 const base=envelope().choices[0];
 for(const choices of [[base,base],[null],[{...base,message:{...base.message,tool_calls:[{id:'unexpected'}]}}],[{...base,message:{...base.message,content:null}}],[{...base,finish_reason:'content_filter'}]]) {
  await assert.rejects(assistCopy({request:request(),apiKey:'test',fetchImpl:mock(envelope(undefined,{choices}))}),error=>error.uncertain===true);
 }
});
test('new numbers and omitted or reformatted original facts are flagged for human review',()=>{
 const result=reviewNumericChanges(request(),{title:'커피 5,000원',description:'10월 11일까지 50% 할인'});
 assert.ok(result.added.includes('5,000원'));assert.ok(result.added.includes('50%'));assert.ok(result.omitted.includes('6,000원'));assert.ok(result.omitted.includes('10일'));
});
test('client request does not send separately saved company, contact, website or photos',()=>{
 const project=newProject();project.productName='coffee';project.copy.ko.company='Private company';project.copy.ko.contact='private phone';project.copy.ko.website='private url';
 const data=makeCopyRequest(project,'translate','en','one detail','frontend-id-123');
 assert.deepEqual(data.copy,{title:project.copy.ko.title,description:project.copy.ko.description});assert.equal(JSON.stringify(data).includes('private'),false);assert.equal(data.description,'one detail');
});
test('applying a reviewed proposal changes only target title and description, preserves the original source and all facts',()=>{
 const project=newProject(),snapshot=copySnapshot(project,'ko','en'),data=makeCopyRequest(project,'translate','en','','frontend-id-123');
 const proposal=parseCopyProposal({requestId:data.requestId,kind:data.kind,targetLocale:'en',proposal:{title:'New headline',description:'New description',company:'must not apply'},review:{numericChanges:{added:[],omitted:[]}}},data);
 const serialized=JSON.stringify(project);
 assert.throws(()=>applyCopyProposal(project,proposal,snapshot,false),/COPY_REVIEW_REQUIRED/);
 assert.equal(JSON.stringify(project),serialized);
 const next=applyCopyProposal(project,proposal,snapshot,true);
 assert.equal(next.locale,'en');assert.equal(next.copy.en.title,'New headline');assert.deepEqual(next.copy.ko,project.copy.ko);assert.equal(next.copy.en.company,project.copy.en.company);assert.equal(next.copy.en.contact,project.copy.en.contact);assert.equal(next.copy.en.website,project.copy.en.website);assert.deepEqual(next.dimensions,project.dimensions);assert.equal(next.product,project.product);
});
test('editing while a request is in flight invalidates the proposal, including target-language copy edits',()=>{
 const project=newProject(),snapshot=copySnapshot(project,'ko','en');assert.equal(copySnapshotCurrent(project,snapshot),true);
 const proposal={targetLocale:'en',proposal:{title:'Suggestion',description:'Text'}};
 const changed={...project,copy:{...project.copy,en:{...project.copy.en,title:'A manual edit'}}};
 assert.equal(copySnapshotCurrent(changed,snapshot),false);assert.throws(()=>applyCopyProposal(changed,proposal,snapshot,true),/COPY_SOURCE_CHANGED/);
 assert.equal(copySnapshotCurrent({...project,id:'other-project'},snapshot),false);
});
test('mismatched response identifiers cannot be applied to another request',()=>{
 const project=newProject(),data=makeCopyRequest(project,'translate','en');
 assert.throws(()=>parseCopyProposal({requestId:'wrong',kind:'translate',targetLocale:'en',proposal:{title:'x',description:'y'},review:{numericChanges:{added:[],omitted:[]}}},data),/INVALID_COPY_RESPONSE/);
});

