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
test('named design recipes expand in request order without false aliases or negated requests',()=>{
 assert.deepEqual(requestedImageSkills('/showcase + /magazine-cover로 제작').map(s=>s.id),['showcase','magazine-cover']);
 assert.deepEqual(requestedImageSkills('/3Billboard 말고 /packaging으로 제작').map(s=>s.id),['packaging']);
 assert.deepEqual(requestedImageSkills('without /3Billboard, /metaad').map(s=>s.id),['metaad']);
 assert.deepEqual(requestedImageSkills('/product explosion').map(s=>s.id),['product-explosion']);
 assert.deepEqual(requestedImageSkills('/showcase-extra /magazine-coverx').map(s=>s.id),[]);
 assert.equal(imageSkillBrief('고급스러운 자연광 광고'), '');
 assert.equal(requestedImageSkills('/showcase /showcase').length,1);
});
test('actual normalized supplier prompt combines a billboard recipe with photo identity, dimensions and locked facts',()=>{
 const p=withCategory(newProject(),'boxes');p.generation.mode='creative';
 p.product={name:'source.png',data:'data:image/png;base64,example',width:340,height:250,sha256:'a'.repeat(64)};
 p.productName='택배박스';p.productProfile.material='B골';p.dimensions={...p.dimensions,width:'340',depth:'250',height:'210'};
 p.campaign={...defaultCampaign(),creative:{...defaultCreative(),copyMode:'manual',note:'/3Billboard'}};
 p.copy.ko.title='제품 형태를 그대로';p.copy.ko.description='10개 19,800원';
 const r=normalizeGenerationRequest(buildGenerationRequest(p)),prompt=promptFor(r);
 assert.match(prompt,/\[3billboard\]/);assert.match(prompt,/not three billboards/);
 for(const v of ['제품 형태를 그대로','10개 19,800원','340','250','210','TWO flat liners and ONE corrugated middle layer','MANUAL COPY','normalizedRatios'])assert.ok(prompt.includes(v),v);
 assert.match(prompt,/take priority over every styling effect/);
 assert.equal(r.source.sha256,p.product.sha256);assert.ok(r.marketingPlan.target.label);
 assert.ok(r.marketingPlan.intent);assert.ok(r.marketingPlan.channels.length);assert.equal(r.marketingPlan.keywords.length,r.marketingPlan.keywordCount);
 // Older clients still need photo plates; never insert a full-page recipe there.
 delete r.output.compositionKey;assert.doesNotMatch(promptFor(r),/REQUESTED IMAGE RECIPES/);
 r.mode='original';assert.doesNotMatch(promptFor(r),/REQUESTED IMAGE RECIPES/);
});
