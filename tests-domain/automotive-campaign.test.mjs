import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/model.ts';
import {withCategory} from '../src/product.ts';
import {withCreative} from '../src/creative.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {promptFor} from '../server/openai-image-adapter.mjs';

function request(category,name,description,format='1:1'){
 const p=withCreative(withCategory(newProject(),category),{copyMode:'manual',directionId:'offer'});
 p.generation.mode='creative';p.format=format;p.productName=name;
 p.productProfile.material=description;
 p.copy.ko={...p.copy.ko,title:name,description};
 if(category==='automotive')p.product={name:'vehicle-fixture.png',data:'data:image/png;base64,fixture',width:1024,height:768,sha256:'a'.repeat(64)};
 return normalizeGenerationRequest(buildGenerationRequest(p));
}

test('vehicle production brief follows normalized subject facts while preserving manual terms at square and story ratios',()=>{
 const terms='월 590,000원 · 계약 36개월 · 보증금 20% · 연 20,000km';
 for(const category of ['automotive','lease','rental'])for(const ratio of ['1:1','9:16']){
  const r=request(category,'검증용 전기 SUV',terms,ratio),prompt=promptFor(r);
  assert.match(prompt,/AUTOMOTIVE CAMPAIGN:/,category);
  assert.ok(prompt.includes(terms));assert.equal(r.copy.description,terms);
  assert.match(prompt,/MANUAL COPY:/);assert.match(prompt,/Do not add a CTA/);
  assert.match(prompt,/do not invent a sample rate/);
  assert.match(prompt,/For a square page/);assert.match(prompt,/for 9:16 stack or regroup/);
  assert.doesNotMatch(prompt,/타보고플러스|32만원|100만원 추가할인/);
 }
});

test('vehicle-specific layout does not leak into other industries, non-vehicle rental or legacy photograph/background requests',()=>{
 for(const [category,name] of [['rental','정수기 렌탈'],['lease','산업용 장비 리스'],['education','자동차 정비 교육']]){
  assert.doesNotMatch(promptFor(request(category,name,'제공한 서비스 소개')),/AUTOMOTIVE CAMPAIGN:/);
 }
 const r=request('automotive','검증용 세단','차량 소개');
 assert.match(promptFor(r),/If no price is supplied, omit the price block entirely/);
 delete r.output.compositionKey;
 const photograph=promptFor(r);
 assert.doesNotMatch(photograph,/AUTOMOTIVE CAMPAIGN:/);
 assert.match(photograph,/Return the photograph only/);
 r.mode='original';
 const background=promptFor(r);
 assert.doesNotMatch(background,/AUTOMOTIVE CAMPAIGN:/);
 assert.match(background,/Empty scene\/background only/);
});
