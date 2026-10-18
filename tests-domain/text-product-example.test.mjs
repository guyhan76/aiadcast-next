import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {generationIssues,buildGenerationRequest,parseGeneration} from '../src/generation.ts';
import {isTextExample,withGenerationInput,generationInputs} from '../src/generation-input.ts';
import {generatedCompatibilityKey} from '../src/generated.ts';
import {withCategory} from '../src/product.ts';
import {GenerationService,normalizeGenerationRequest} from '../server/generation-service.mjs';
import {OpenAIImageAdapter,promptFor} from '../server/openai-image-adapter.mjs';
const bytes=await sharp({create:{width:864,height:1536,channels:4,background:'#abcdde'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
const photo={name:'kept.png',data:'data:image/png;base64,'+bytes.toString('base64'),sha256:hash,width:864,height:1536};
function project(){const p=starterProject('other');return prepareCampaign({...p,productName:'텀블러',productProfile:{...p.productProfile,material:'450mL 스테인리스, 아이보리'},copy:{...p.copy,ko:{...p.copy.ko,title:'나의 한 잔',description:'확인한 구성'}}});}
function example(){return withGenerationInput(project(),'text-example');}
function body(p=example()){return {requestId:randomUUID(),projectId:p.id,request:buildGenerationRequest(p),...generationInputs(p)};}

test('text example is explicit, keeps source drafts and excludes every retained photo from request and compatibility',()=>{
 const p={...project(),product:photo,references:[{...photo,sha256:'a'.repeat(64)}],referenceRoles:{[photo.sha256]:'style'},generation:{mode:'original',brief:''}};
 const q=withGenerationInput(p,'text-example');assert.equal(isTextExample(q),true);assert.equal(q.product,p.product);assert.equal(q.references,p.references);assert.deepEqual(generationIssues(q),[]);
 const r=buildGenerationRequest(q);assert.equal(r.inputMode,'text-example');assert.equal(r.source,null);assert.deepEqual(r.references,[]);assert.equal(r.marketingPlan.input.sourceHash,null);assert.equal(JSON.stringify(r).includes(hash),false);assert.equal(JSON.stringify(generationInputs(q)).includes('data:image'),false);
 assert.notEqual(generatedCompatibilityKey(p),generatedCompatibilityKey(q));assert.equal(generatedCompatibilityKey(q).includes(hash),false);
 const restored={...q,generation:parseGeneration(JSON.parse(JSON.stringify(q.generation)))};assert.equal(isTextExample(restored),true);const back=withGenerationInput(restored,'photo');assert.equal(back.generation.mode,'original');assert.equal(back.product,p.product);assert.equal(back.productProfile.material,p.productProfile.material);assert.equal(isTextExample(withCategory(q,'lodging')),false);
 assert.ok(generationIssues(project()).some(x=>x.includes('상품 사진')));assert.throws(()=>parseGeneration({mode:'creative',brief:'',inputMode:'guess'}));
});
test('text example keeps numeric dimensions independent and blocks photo-based controls without discarding them',()=>{
 let p=example();p={...p,productProfile:{...p.productProfile,specType:'rectangular'},dimensions:{...p.dimensions,width:'100',depth:'80',height:'200',visible:true,lines:false}};
 assert.equal(buildGenerationRequest(p).specifications.length,3);assert.equal(buildGenerationRequest(p).output.showDimensions,true);
 for(const patch of [{generation:{...p.generation,dimensionBased:true}},{dimensions:{...p.dimensions,lines:true}},{dimensionAnnotation:{mode:'inset',snapshot:''}}])assert.ok(generationIssues({...p,...patch})[0].includes('지원하지 않습니다'));
 assert.throws(()=>normalizeGenerationRequest({...buildGenerationRequest(p),output:{...buildGenerationRequest(p).output,showDimensionLines:true}}),/TEXT_EXAMPLE_UNSUPPORTED_GEOMETRY/);
});
test('server requires explicit text consent, rejects hidden photos and unsupported modes before dispatch, and preserves billing idempotency',async t=>{
 let calls=0;const service=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:2_000_000,adapter:{generate:async()=>{calls++;return {bytes,mime:'image/png',width:864,height:1536,sha256:hash,role:'creative',composition:'complete-ad',model:'fixture',usage:{},cost:{microUsd:1}};}}});t.after(()=>service.close());
 const valid=body();assert.equal(service.status().generation.textExamples,true);
 await assert.rejects(service.create({...valid,request:{...valid.request,inputMode:undefined}}),/SOURCE_REQUIRED/);
 await assert.rejects(service.create({...valid,source:photo}),/TEXT_EXAMPLE_PHOTOS_NOT_ALLOWED/);
 for(const patch of [{inputMode:'unknown'},{mode:'original'},{subjectType:'service'},{source:{sha256:hash}},{productProfile:{material:''}},{proportionControl:{kind:'flat-front-v1'}}])assert.throws(()=>normalizeGenerationRequest({...valid.request,...patch}),/TEXT_EXAMPLE|INVALID/);
 assert.equal(calls,0);assert.equal(service.wallet().reserved,0);
 const [first,duplicate]=await Promise.all([service.create(valid),service.create(valid)]);assert.equal(first.job.id,duplicate.job.id);await service.waitForIdle();assert.equal(calls,1);
 const ready=service.job(first.job.id);assert.equal(ready.inputMode,'text-example');assert.equal(ready.sourceHash,null);assert.equal(ready.state,'ready');service.accept(ready.id,ready.artifactId);service.accept(ready.id,ready.artifactId);assert.equal(service.wallet().available,2);assert.equal(service.wallet().reserved,0);assert.equal(service.status().budget.spentMicros,1);
});
test('text example adapter sends JSON generations with description and manual copy and never uploads retained photos',async()=>{
 const p=example(),request=normalizeGenerationRequest({...buildGenerationRequest(p),creativeDirection:{...buildGenerationRequest(p).creativeDirection,copyMode:'manual'}}),calls=[];
 const adapter=new OpenAIImageAdapter({apiKey:'fixture-only',fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({data:[{b64_json:bytes.toString('base64')}],usage:{input_tokens:10,input_tokens_details:{text_tokens:10,image_tokens:0},output_tokens:10}}),{status:200,headers:{'Content-Type':'application/json'}});}});
 const result=await adapter.generate({request,source:null,attemptId:randomUUID()});assert.equal(result.composition,'complete-ad');assert.equal(calls.length,1);assert.match(calls[0].url,/\/images\/generations$/);assert.match(calls[0].body.prompt,/TEXT-ONLY PRODUCT EXAMPLE/);assert.match(calls[0].body.prompt,/450mL/);assert.match(calls[0].body.prompt,/MANUAL COPY/);assert.equal(calls[0].body.image,undefined);
 await assert.rejects(adapter.generate({request,source:{bytes,mime:'image/png'},attemptId:randomUUID()}),/INVALID_TEXT_EXAMPLE/);assert.equal(calls.length,1);assert.doesNotMatch(promptFor(request),/Use the FIRST reference as the advertised subject identity/);
});
