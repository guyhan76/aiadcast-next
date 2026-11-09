import {test} from 'node:test';
import assert from 'node:assert/strict';
import {starterProject,prepareCampaign,creativeCampaignDraft,finishedAdBrief} from '../src/consumer-campaign.ts';
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
 let p=withCreative(fixture(),{copyMode:'manual'});p.copy.ko={...p.copy.ko,title:'보내는 마음까지, 든든하게.',description:'10개 19,800원 · 빠른배송',company:'셀업랩스',contact:'010-0000-0000',email:'example@example.com'};
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
test('finished-ad direction reaches the supplier request without replacing an explicit brief or applying it to original composition',()=>{
 const p=fixture(),prepared=prepareCampaign(p),r=normalizeGenerationRequest(buildGenerationRequest(prepared));
 assert.equal(r.mode,'creative');assert.equal(r.brief,finishedAdBrief);assert.ok(r.brief.length<=600);
 assert.ok(promptFor(r).includes('do not paste an opaque white catalog-photo rectangle'));assert.ok(promptFor(r).includes('19,800원'));
 p.generation.brief='고객이 지정한 붉은 배경과 정확한 문구';assert.equal(prepareCampaign(p).generation.brief,p.generation.brief);
 p.generation={mode:'original',brief:''};assert.equal(prepareCampaign(p).generation.brief,'');
});
test('explicit AI replanning creates a separate draft while preserving source photos, roles, manual facts and the accepted original',()=>{
 const p=withCreative(fixture(),{copyMode:'manual',note:'밝은 파랑 /metaad'});p.generation.mode='original';
 p.productName='이사박스';p.copy.ko={title:'이사박스',description:'10개 39,800원',company:'셀업랩스',contact:'010-0000-0000',email:'example@example.com',website:''};
 p.references=[{...p.product,name:'style.png',sha256:'b'.repeat(64)}];p.referenceRoles={[p.product.sha256]:'subject',[p.references[0].sha256]:'style'};
 p.productProfile.specType='rectangular';p.dimensions={...p.dimensions,width:'400',depth:'300',height:'350',visible:true};
 p.generated={jobId:'accepted-background',mode:'original',role:'background',asset:p.product};p.background.image=p.product;
 const before=JSON.stringify(p),next=creativeCampaignDraft(p);
 assert.notEqual(next.id,p.id);assert.equal(next.generation.mode,'creative');assert.equal(next.generated,undefined);assert.equal(next.background.image,null);
 assert.deepEqual(next.copy,p.copy);assert.deepEqual(next.product,p.product);assert.deepEqual(next.references,p.references);assert.deepEqual(next.referenceRoles,p.referenceRoles);assert.deepEqual(next.dimensions,p.dimensions);
 assert.equal(next.campaign.creative.note,p.campaign.creative.note);assert.equal(JSON.stringify(p),before);
 const r=normalizeGenerationRequest(buildGenerationRequest(next));assert.equal(r.mode,'creative');assert.equal(r.references[0].purpose,'style');assert.equal(r.copy.description,'10개 39,800원');assert.ok(r.output.compositionKey);
});
test('replanning retains optional dimension choices until submission and discards old placement evidence',()=>{
 for(const mode of ['none','main','inset']){
  const p=fixture();p.productProfile.specType='rectangular';p.dimensions={...p.dimensions,width:'400',depth:'300',height:'350',visible:mode!=='none',lines:mode==='main'};
  p.dimensionAnnotation={method:'manual',mode,snapshot:'old-result',manual:{sentinel:'old-placement'}};
  const before=JSON.stringify(p),draft=creativeCampaignDraft(p);
  assert.deepEqual(draft.dimensions,p.dimensions);assert.deepEqual(draft.dimensionAnnotation,{method:'manual',mode,snapshot:''});
  const submitted=prepareCampaign(draft);assert.deepEqual(submitted.dimensionAnnotation,{method:'ai',mode,snapshot:''});
  assert.equal(submitted.dimensions.visible,mode!=='none');assert.equal(submitted.dimensions.lines,mode!=='none');
  assert.equal(JSON.stringify(p),before);assert.equal(draft.generated,undefined);
 }
});
