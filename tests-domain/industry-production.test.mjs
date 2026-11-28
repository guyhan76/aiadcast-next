import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {productCategories,isPhysicalCategory} from '../src/industry.ts';
import {artDirectionFor} from '../src/art-direction.ts';
import {newProject} from '../src/model.ts';
import {withCategory} from '../src/product.ts';
import {withCreative} from '../src/creative.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {OpenAIImageAdapter,hashBytes,promptFor} from '../server/openai-image-adapter.mjs';

function project(category,locale='ko'){
 const p=withCreative(withCategory(newProject(),category),{copyMode:'manual',directionId:'brand'});
 p.generation.mode='creative';p.format='9:16';p.locale=locale;
 p.productName=locale==='ko'?'검증용 브랜드':'Example Brand';
 p.productProfile.material=locale==='ko'?'제공 가격 29,000원, 제공 범위는 상세 설명 기준':'Supplied price KRW 29,000; scope follows the provided description';
 p.copy[locale]={...p.copy[locale],title:locale==='ko'?'나에게 맞는 새로운 선택':'A thoughtful new choice',description:p.productProfile.material};
 if(isPhysicalCategory(category)){
  p.product={name:'fixture.png',data:'data:image/png;base64,fixture',width:340,height:250,sha256:'a'.repeat(64)};
  p.productProfile.specType='rectangular';p.dimensions={...p.dimensions,width:'340',depth:'250',height:'210'};
 }
 return p;
}

test('every supported industry has a suitable production brief; services never fall back to a generic product shot',()=>{
 for(const [category] of productCategories){
  const direction=artDirectionFor(category,'9:16');
  if(category!=='other')assert.notEqual(direction.id,'editorial-product',category);
  assert.equal(direction.concepts.length,3,category);
  assert.ok(direction.techniques.length&&direction.constraints.length,category);
 }
 assert.notEqual(artDirectionFor('education','9:16').id,artDirectionFor('fitness','9:16').id);
 assert.notEqual(artDirectionFor('realestate','9:16').id,artDirectionFor('finance','9:16').id);
 const packaging=['packaging','boxes','shoppingbags','labels','containers','pouches','plasticfilm'];
 assert.equal(new Set(packaging.map(id=>artDirectionFor(id,'9:16').id)).size,packaging.length);
 assert.match(artDirectionFor('boxes','9:16').constraints.join(' '),/never impose corrugation on a rigid box/);
});

test('all industry and language requests preserve facts, photos or photo-free services, and patent-result planning through server normalization',()=>{
 for(const [category]of productCategories)for(const locale of ['ko','en']){
  const p=project(category,locale),request=normalizeGenerationRequest(buildGenerationRequest(p)),prompt=promptFor(request);
  assert.match(prompt,/ONE FINISHED/);assert.match(prompt,/MANUAL COPY/);
  assert.ok(prompt.includes(p.productName),category);assert.ok(prompt.includes(p.copy[locale].title),category);
  assert.ok(prompt.includes('29,000'),category);
  assert.doesNotMatch(prompt,/TWO flat liners|B flute/,category+' has no supplied B-flute material');
  for(const technique of artDirectionFor(category,'9:16').techniques)assert.ok(prompt.includes(technique),category);
  assert.ok(request.marketingPlan.intent&&request.marketingPlan.target.label,category);
  assert.ok(request.marketingPlan.channels.length,category);
  assert.equal(new Set(request.marketingPlan.keywords).size,request.marketingPlan.keywordCount,category);
  if(isPhysicalCategory(category)){
   assert.equal(request.source.sha256,p.product.sha256,category);assert.equal(request.specifications.length,3,category);
   assert.match(prompt,/PHYSICAL PRODUCT:/);assert.match(prompt,/GEOMETRY:/);
  }else{
   assert.equal(request.source,null,category);assert.deepEqual(request.specifications,[],category);
   assert.match(prompt,/SERVICE REFERENCES:/);assert.match(prompt,/SERVICE LAYOUT:/);
   assert.match(prompt,/conceptual service composition/);
   assert.doesNotMatch(prompt,/TWO flat liners|B flute|PHYSICAL PRODUCT:/,category);
  }
 }
});

test('corrugated construction constraints apply only to supplied B-flute material, never double-wall board or unrelated products',()=>{
 for(const material of ['B골','B flute','B-flute']){
  const p=project('boxes');p.productProfile.material=material;
  assert.match(promptFor(normalizeGenerationRequest(buildGenerationRequest(p))),/TWO flat liners and ONE corrugated middle layer/);
 }
 for(const material of ['BB골','가죽','유리','알루미늄']){
  const p=project('other');p.productProfile.material=material;
  assert.doesNotMatch(promptFor(normalizeGenerationRequest(buildGenerationRequest(p))),/TWO flat liners/);
 }
});

test('brand, offer and trust change the production purpose without inventing facts or an opt-in CTA',()=>{
 const p=project('education');
 const prompts=['brand','offer','trust'].map(directionId=>promptFor(normalizeGenerationRequest(buildGenerationRequest(withCreative(p,{directionId})))));
 assert.match(prompts[0],/memorable brand introduction/);
 assert.match(prompts[1],/price, quantity, period and inclusions together/);
 assert.match(prompts[2],/documented evidence only/);
 for(const prompt of prompts){assert.ok(prompt.includes(p.copy.ko.title));assert.match(prompt,/Do not add a CTA/);}
});

test('service-specific brief reaches the actual image adapter transport with no reference image and exactly one provider request',async()=>{
 // A generated solid-color fixture verifies transport and decoding, not AI visual quality.
 const bytes=await sharp({create:{width:864,height:1536,channels:4,background:'#e6edf5'}}).png().toBuffer();
 const calls=[];
 const adapter=new OpenAIImageAdapter({apiKey:'fixture-only',fetchImpl:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});
  return new Response(JSON.stringify({data:[{b64_json:bytes.toString('base64')}],usage:{input_tokens:10,input_tokens_details:{text_tokens:10,image_tokens:0},output_tokens:10}}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 const request=normalizeGenerationRequest(buildGenerationRequest(project('education')));
 const result=await adapter.generate({request,source:null,attemptId:'industry-transport-fixture'});
 assert.equal(calls.length,1);assert.match(calls[0].url,/\/images\/generations$/);
 assert.match(calls[0].body.prompt,/SERVICE REFERENCES:/);assert.match(calls[0].body.prompt,/learning activity/);
 assert.equal(calls[0].body.quality,'high');assert.equal(calls[0].body.n,1);
 assert.equal(result.composition,'complete-ad');assert.equal(result.sha256,hashBytes(bytes));
});
