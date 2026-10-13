import {test} from 'node:test';
import assert from 'node:assert/strict';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {withCreative,creativeContract,parseCreative} from '../src/creative.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {promptFor} from '../server/openai-image-adapter.mjs';
import {completeAdKey} from '../src/complete-ad.ts';
function fixture(category='boxes'){const p=starterProject(category);p.productName='우체국3호박스';p.productProfile.material='B골 크라프트재질 · 빠른배송 · 10개 19,800원';if(category==='boxes')p.product={name:'source.png',sha256:'a'.repeat(64),data:'data:image/png;base64,a',width:340,height:250};return p;}
test('consumer defaults are one finished creative ad with optional dimensions and contact fields',()=>{
 const p=starterProject();assert.equal(p.format,'9:16');assert.equal(p.productProfile.specType,'none');assert.equal(p.dimensions.visible,false);assert.equal(p.campaign.creative.copyMode,'ai');assert.equal(p.generation.mode,'creative');assert.equal(p.copy.ko.company,'');
});
test('manual copy is preserved on submit and supplier instructions do not rewrite it',()=>{
 let p=withCreative(fixture(),{copyMode:'manual'});p.copy.ko={...p.copy.ko,title:'보내는 마음까지, 든든하게.',description:'10개 19,800원 · 빠른배송',company:'셀업랩스',contact:'010-5635-6211',email:'selluplabs@gmail.com'};
 const prepared=prepareCampaign(p);assert.deepEqual(prepared.copy,p.copy);assert.equal(creativeContract(prepared).copyMode,'manual');
 const normalized=normalizeGenerationRequest(buildGenerationRequest(prepared));assert.equal(normalized.copy.title,p.copy.ko.title);assert.match(promptFor(normalized),/MANUAL COPY: Typeset.*verbatim/);
});
test('AI copy is explicitly requested from facts for product or photo-free service without phantom dimensions',()=>{
 for(const category of ['boxes','lodging']){const p=fixture(category),prepared=prepareCampaign(p),r=normalizeGenerationRequest(buildGenerationRequest(prepared));assert.equal(r.creativeDirection.copyMode,'ai');assert.match(promptFor(r),/AI COPY: Write a concise marketing headline/);assert.ok(promptFor(r).includes('19,800원'));assert.deepEqual(r.specifications,[]);assert.equal(r.output.showDimensions,false);if(category==='lodging')assert.equal(r.source,null);}
});
test('copy mode is validated, saved in the fact snapshot and legacy approved copy defaults to manual instructions',()=>{
 const p=fixture();assert.throws(()=>parseCreative({...p.campaign.creative,copyMode:'invent-all-facts'}));
 const ai=completeAdKey(p),manual=completeAdKey(withCreative(p,{copyMode:'manual'}));assert.notEqual(ai,manual);
 delete p.campaign.creative.copyMode;assert.equal(creativeContract(p).copyMode,'manual');assert.match(promptFor(normalizeGenerationRequest(buildGenerationRequest(prepareCampaign(p)))),/MANUAL COPY/);
});
