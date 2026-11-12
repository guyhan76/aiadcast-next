import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestedImageSkills,imageSkillBrief} from '../src/image-skills.ts';
import {newProject} from '../src/model.ts';
import {withCategory} from '../src/product.ts';
import {defaultCampaign} from '../src/campaign.ts';
import {defaultCreative} from '../src/creative.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {promptFor} from '../server/openai-image-adapter.mjs';

function fixture(category='boxes'){
 const p=withCategory(newProject(),category);p.generation.mode='creative';
 p.product={name:'source.png',data:'data:image/png;base64,example',width:340,height:250,sha256:'a'.repeat(64)};
 p.productName='택배박스';p.productProfile.material='B골';p.dimensions={...p.dimensions,width:'340',depth:'250',height:'210'};
 p.campaign={...defaultCampaign(),creative:{...defaultCreative(),copyMode:'manual'}};
 p.copy.ko.title='제품 형태를 그대로';p.copy.ko.description='10개 19,800원';
 return p;
}
const normalized=p=>normalizeGenerationRequest(buildGenerationRequest(p));

test('named design recipes expand in request order without false aliases or negated requests',()=>{
 assert.deepEqual(requestedImageSkills('/showcase + /magazine-cover로 제작').map(s=>s.id),['showcase','magazine-cover']);
 assert.deepEqual(requestedImageSkills('/3Billboard 말고 /packaging으로 제작').map(s=>s.id),['packaging']);
 assert.deepEqual(requestedImageSkills('without /3Billboard, /metaad').map(s=>s.id),['metaad']);
 assert.deepEqual(requestedImageSkills('/product explosion').map(s=>s.id),['product-explosion']);
 assert.deepEqual(requestedImageSkills('/showcase-extra /magazine-coverx').map(s=>s.id),[]);
 assert.equal(requestedImageSkills('/showcase /showcase').length,1);
 // Natural language is interpreted by the provider, not falsely reported as a parsed command.
 assert.deepEqual(requestedImageSkills('고급스러운 자연광 광고'),[]);
 assert.match(imageSkillBrief('고급스러운 자연광 광고'),/AUTOMATIC IMAGE SKILL SELECTION/);
});

test('actual normalized supplier prompt combines a billboard recipe with photo identity, dimensions and locked facts',()=>{
 const p=fixture();p.campaign.creative.note='/3Billboard';
 const r=normalized(p),prompt=promptFor(r);
 assert.match(prompt,/\[3billboard\]/);assert.match(prompt,/not three billboards/);
 for(const v of ['제품 형태를 그대로','10개 19,800원','340','250','210','TWO flat liners and ONE corrugated middle layer','MANUAL COPY','normalizedRatios'])assert.ok(prompt.includes(v),v);
 assert.match(prompt,/take priority over every styling effect/);
 assert.equal(r.source.sha256,p.product.sha256);assert.ok(r.marketingPlan.target.label);
 assert.ok(r.marketingPlan.intent);assert.ok(r.marketingPlan.channels.length);assert.equal(r.marketingPlan.keywords.length,r.marketingPlan.keywordCount);
});

test('excluded named recipes cannot reappear in the automatic candidate instructions',()=>{
 for(const note of ['/3Billboard 말고 /packaging으로 제작','without /3Billboard, /packaging','/3Billboard + /3Billboard 제외, /packaging']){
  const p=fixture();p.campaign.creative.note=note;
  const prompt=promptFor(normalized(p));
  assert.match(prompt,/EXCLUDED NAMED RECIPES: 3billboard/);
  assert.match(prompt,/\[packaging\]/);
  assert.doesNotMatch(prompt,/\[3billboard\]|appearing to project from a corner LED billboard|not three billboards/);
 }
});

// These are provider-prompt contracts, not claims that a live model selected a
// particular technique or obeyed the constraints in its generated pixels.
test('natural-language requests and scoped exclusions reach automatic selection through either request field',()=>{
 for(const field of ['brief','note']){
  for(const note of [
   '잡지 표지처럼 구성하고 창가에서 촬영한 듯한 자연광을 사용해 주세요.',
   '인물 없이, 3D는 제외하고 글자 중심으로 만들어 주세요.',
   '자연광 말고 스튜디오 조명으로, 배경만 수채화처럼 표현해 주세요.',
   'Use an editorial cover layout without people; keep the background flat, not 3D.',
  ]){
   const p=fixture();
   if(field==='brief')p.generation.brief=note;else p.campaign.creative.note=note;
   const r=normalized(p),prompt=promptFor(r);
   assert.ok(prompt.includes(note),`${field}: ${note}`);
   assert.match(prompt,/AUTOMATIC IMAGE SKILL SELECTION/);
   assert.match(prompt,/Interpret constraints across ALL input fields/);
   assert.match(prompt,/Explicit customer preferences and exclusions take priority/);
   assert.doesNotMatch(prompt,/REQUESTED IMAGE RECIPES/);
   assert.equal(r.copy.title,p.copy.ko.title);assert.equal(r.copy.description,p.copy.ko.description);
   assert.match(prompt,/MANUAL COPY/);assert.match(prompt,/Do not add a CTA/);
  }
 }
});

test('empty style requests still enable selection from physical-product identity and full details',()=>{
 const p=fixture();
 p.productProfile.material='B골 크라프트재질. 손잡이가 없는 택배용 포장박스이며 제품 구조와 인쇄 방향을 유지한다. 10개 19,800원.';
 p.campaign.attributes=[{name:'용도',value:'소형 상품 발송용'}];
 const r=normalized(p),prompt=promptFor(r);
 assert.equal(r.brief,'');assert.equal(r.creativeDirection.additionalInstructions,'');
 assert.match(prompt,/AUTOMATIC IMAGE SKILL SELECTION/);
 for(const fact of [p.productName,p.productProfile.material,'소형 상품 발송용'])assert.ok(prompt.includes(fact),fact);
 assert.equal(r.productProfile.category,'boxes');assert.equal(r.source.sha256,p.product.sha256);
 assert.match(prompt,/IMAGE TECHNIQUE FAMILIES/);assert.match(prompt,/catalogue is open-ended/);
 assert.match(prompt,/Do not apply the entire catalogue/);
 assert.match(prompt,/normalizedRatios/);assert.match(prompt,/TWO flat liners and ONE corrugated middle layer/);
 assert.doesNotMatch(prompt,/REQUESTED IMAGE RECIPES/);
});

test('photo-free services receive contextual selection without style requests or invented dimensions',()=>{
 for(const [category,name,description] of [
  ['education','직장인 저녁 드로잉 수업','매주 수요일 저녁, 관찰 드로잉과 색연필 기초를 배우는 4주 수업.'],
  ['lodging','제공된 숙박 서비스','2인 숙박 상품. 기간은 12월 1일부터 12월 15일까지이며 조식은 포함하지 않는다.'],
 ]){
  const p=fixture(category);p.product=null;p.productName=name;p.productProfile.material=description;
  p.copy.ko.title=name;p.copy.ko.description=description;
  const r=normalized(p),prompt=promptFor(r);
  assert.equal(r.subjectType,'service');assert.equal(r.source,null);assert.deepEqual(r.specifications,[]);
  assert.equal(r.brief,'');assert.equal(r.creativeDirection.additionalInstructions,'');
  assert.match(prompt,/AUTOMATIC IMAGE SKILL SELECTION/);
  assert.ok(prompt.includes(name));assert.ok(prompt.includes(description));
  assert.match(prompt,/A service may use typography/);assert.match(prompt,/SERVICE: Build a service campaign/);
  assert.match(prompt,/Missing dimensions remain unknown/);assert.match(prompt,/MANUAL COPY/);
 }
});

test('full-ad skill selection stays out of older photo plates and original-photo generation',()=>{
 const p=fixture();p.campaign.creative.note='/showcase, 인물 없이 자연광으로';
 const complete=normalized(p);assert.match(promptFor(complete),/AUTOMATIC IMAGE SKILL SELECTION/);
 const legacy=structuredClone(complete);delete legacy.output.compositionKey;
 assert.match(promptFor(legacy),/HERO PLATE/);
 assert.doesNotMatch(promptFor(legacy),/AUTOMATIC IMAGE SKILL SELECTION|REQUESTED IMAGE RECIPES|IMAGE TECHNIQUE FAMILIES/);
 p.generation.mode='original';const original=normalized(p);
 assert.doesNotMatch(promptFor(original),/AUTOMATIC IMAGE SKILL SELECTION|REQUESTED IMAGE RECIPES|IMAGE TECHNIQUE FAMILIES/);
});
