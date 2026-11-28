import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {newProject} from '../src/model.ts';
import {withCategory,productCategories} from '../src/product.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {marketingPlanForProject,parseMarketingPlan} from '../src/marketing-plan.ts';
import {generatedCompatibilityKey,parseGenerated} from '../src/generated.ts';
import {GenerationService,normalizeGenerationRequest} from '../server/generation-service.mjs';
import {promptFor,hashBytes} from '../server/openai-image-adapter.mjs';

const bytes=await sharp({create:{width:12,height:8,channels:4,background:'#fff'}}).png().toBuffer();
const source={name:'box.png',data:`data:image/png;base64,${bytes.toString('base64')}`,width:12,height:8,sha256:hashBytes(bytes)};
function product(){const p=withCategory(newProject(),'boxes');p.product=source;p.productName='맞춤형 상자';p.productProfile.material='골판지';p.dimensions.width='600';p.dimensions.depth='400';p.dimensions.height='200';p.generation.mode='creative';p.campaign={goal:'inquiry',contentType:'card',tone:'minimal',attributes:[{name:'수량',value:'100'},{name:'인쇄',value:'후렉소'}]};return p;}
test('photo, hidden dimensions, attributes, target and card format survive normalization into provider context',()=>{
 const p=product();p.dimensions.visible=false;
 const input=buildGenerationRequest(p),normalized=normalizeGenerationRequest(input);
 assert.deepEqual(normalized.marketingPlan,input.marketingPlan);
 assert.equal(normalized.source.sha256,p.product.sha256);
 assert.deepEqual(normalized.attributes,[{name:'소재',value:'골판지'},{name:'수량',value:'100'},{name:'인쇄',value:'후렉소'}]);
 assert.equal(normalized.target.segment,'procurement');assert.equal(normalized.contentType,'card');
 const prompt=promptFor(normalized);assert.match(prompt,/후렉소/);assert.match(prompt,/구매·유통/);assert.match(prompt,/"value":"600"/);assert.match(prompt,/"contentType":"card"/);
 assert.deepEqual(normalized.marketingPlan.normalizedRatios.map(r=>r.ratio),[1,2/3,1/3]);
 assert.equal(normalized.marketingPlan.geometryVerified,false);assert.match(prompt,/not a guarantee of identity, physical accuracy or arrow placement/);assert.match(prompt,/Do not make the body taller, deeper, wider or thinner/);
});
test('category and supplied dimensions influence the target; missing specs never invent measurements',()=>{
 const p=product();assert.equal(marketingPlanForProject(p).target.segment,'procurement');
 p.dimensions.height='10';assert.equal(marketingPlanForProject(p).target.segment,'spec-fit');assert.match(marketingPlanForProject(p).target.label,/10 mm/);
 p.productProfile.specType='none';const plan=marketingPlanForProject(p);assert.equal(plan.target.segment,'general');assert.deepEqual(plan.normalizedRatios,[]);assert.doesNotMatch(plan.target.label,/mm/);
 const appliance=withCategory(product(),'electronics');appliance.campaign.goal='awareness';assert.equal(marketingPlanForProject(appliance).channels[0],'website');appliance.productProfile.specType='none';assert.equal(marketingPlanForProject(appliance).channels[0],'instagram');
});
test('every category and language has bounded relevant unique SEO phrases without phone or email leakage or filler',()=>{
 for(const [category] of productCategories)for(const locale of ['ko','en']){
  const p=withCategory(product(),category);p.locale=locale;p.productName='ABC BOX';p.copy[locale].company='ＡＢＣＢＯＸ';p.campaign.attributes.push({name:'내부 연락처',value:'010-9999-8888'},{name:'이메일',value:'secret@example.com'});
  const plan=marketingPlanForProject(p),keys=plan.keywords.map(s=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,''));
  assert.ok(plan.keywords.length>0&&plan.keywords.length<=6);assert.equal(new Set(keys).size,plan.keywordCount);assert.ok(plan.keywords.every(k=>!/@|010-9999|소개|선택 가이드|상세 정보|overview|selection guide|details/i.test(k)));
 }
});
test('server recomputes client suggestions and rejects duplicated axes before dispatch',()=>{
 const r=buildGenerationRequest(product());r.target={label:'guaranteed profits'};r.marketingPlan.target.label='forged';r.marketingPlan.geometryVerified=true;r.attributes=[{name:'invented',value:'free'}];
 const n=normalizeGenerationRequest(r);assert.doesNotMatch(n.target.label,/guaranteed|forged/);assert.equal(n.marketingPlan.geometryVerified,false);assert.ok(!n.attributes.some(a=>a.name==='invented'));
 assert.throws(()=>normalizeGenerationRequest({...r,specifications:[r.specifications[0],r.specifications[0]]}),/INVALID_SPECIFICATIONS/);
});
test('service path needs no photo or dimensions and original compositing keeps geometric guidance out of provider prompt',()=>{
 const service=withCategory(newProject(),'travel');service.productName='여행 상담';service.generation.mode='creative';service.generation.brief='여행 분위기';
 const r=normalizeGenerationRequest(buildGenerationRequest(service));assert.equal(r.source,null);assert.deepEqual(r.specifications,[]);assert.deepEqual(r.marketingPlan.normalizedRatios,[]);
 const p=product();p.generation.mode='original';const prompt=promptFor(normalizeGenerationRequest(buildGenerationRequest(p)));assert.match(prompt,/empty premium/);assert.doesNotMatch(prompt,/"value":"600"|"ratio":/);
});
test('generation job and saved project retain the original plan after form edits; older metadata stays readable',async t=>{
 const p=product(),request=buildGenerationRequest(p),calls=[];
 const adapter={generate:async args=>{calls.push(args);return {bytes,mime:'image/png',width:12,height:8,sha256:source.sha256,role:'creative',model:'fixture',revision:'fixture',cost:{microUsd:1},usage:{},providerRequestId:'fixture'};}};
 const service=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:1000000,adapter});t.after(()=>service.close());
 const created=await service.create({projectId:p.id,requestId:randomUUID(),request,source});await service.waitForIdle();
 const job=service.job(created.job.id);assert.equal(job.state,'ready');assert.equal(calls[0].source.sha256,source.sha256);assert.deepEqual(job.marketingPlan,request.marketingPlan);
 const metadata={jobId:job.id,mode:job.mode,sourceHash:job.sourceHash,asset:source,role:'creative',model:'fixture',createdAt:job.createdAt,specificationKey:generatedCompatibilityKey(p),marketingPlan:job.marketingPlan};
 p.productName='새 상품';p.dimensions.width='100';assert.equal(service.job(job.id).marketingPlan.input.name,'맞춤형 상자');
 const saved=await parseGenerated(metadata,async()=>source);assert.equal(saved.marketingPlan.input.specifications[0].value,'600');assert.deepEqual(parseMarketingPlan(JSON.parse(JSON.stringify(saved.marketingPlan))),saved.marketingPlan);
 const legacy={...metadata};delete legacy.marketingPlan;assert.equal((await parseGenerated(legacy,async()=>source)).marketingPlan,undefined);
 await assert.rejects(()=>parseGenerated({...metadata,marketingPlan:{...job.marketingPlan,input:{...job.marketingPlan.input,sourceHash:'f'.repeat(64)}}},async()=>source),/일치/);
 assert.deepEqual(service.history(p.id).jobs[0].marketingPlan,job.marketingPlan);
});
