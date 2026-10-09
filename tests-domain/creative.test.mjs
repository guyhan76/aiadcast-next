import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject,importProject,exportErrors} from '../src/model.ts';
import {withCategory} from '../src/product.ts';
import {parseCampaign,defaultCampaign} from '../src/campaign.ts';
import {chooseCreativeLook,creativeCopy,creativeContract,defaultCreative,parseCreative,withCreative} from '../src/creative.ts';
import {buildGenerationRequest,generationIssues} from '../src/generation.ts';

test('selected industry direction replaces a mandatory prompt for photo-free service concepts',()=>{
 for(const category of ['restaurant','lodging','pilates','hospital','biotech','banking','stocks','crypto','rental','realestate']){
  let p=withCategory(newProject(),category);p.generation.mode='creative';p.productName='브랜드';
  assert.ok(generationIssues(p).length);p=withCreative(p,{directionId:'offer'});assert.deepEqual(generationIssues(p),[]);
  const r=buildGenerationRequest(p);assert.equal(r.operation,'image-ad-creative');assert.equal(r.source,null);assert.deepEqual(r.specifications,[]);assert.equal(r.creativeDirection.industry.id,category);assert.equal(r.creativeDirection.direction.id,'offer');assert.equal(r.creativeDirection.providerStatus,'not-connected');
  assert.ok(exportErrors(p).some(s=>s.includes('AI 연결 후')));
 }
});
test('visual choices preserve source, approved text, geometry, background assets and other campaign data',()=>{
 const p=newProject();p.product={sha256:'source',data:'unchanged',width:123,height:234};p.background.image={sha256:'background',data:'back'};p.campaign={...defaultCampaign(),attributes:[{name:'가격',value:'₩30,000'}]};
 for(const look of ['editorial','signature','natural','precision']){
  const next=chooseCreativeLook(p,look);assert.deepEqual(next.product,p.product);assert.deepEqual(next.background.image,p.background.image);assert.deepEqual(next.copy,p.copy);assert.deepEqual(next.dimensions,p.dimensions);assert.equal(next.format,p.format);assert.deepEqual(next.campaign.attributes,p.campaign.attributes);assert.equal(next.campaign.creative.look,look);
 }
 assert.throws(()=>chooseCreativeLook(p,'invalid'));
});
test('private direction notes are passed as instructions without becoming public ad copy',()=>{
 let p=withCategory(newProject(),'hospital');p.productName='예시의원';p.productProfile.material='진료 시간은 홈페이지에서 안내합니다.';p=withCreative(p,{note:'배경을 차분하게, 인물 없이',directionId:'trust'});
 const copy=creativeCopy(p);assert.ok(copy.title.includes('예시의원'));assert.equal(copy.description,p.productProfile.material);assert.ok(!copy.description.includes('배경'));
 const contract=creativeContract(p);assert.equal(contract.additionalInstructions,'배경을 차분하게, 인물 없이');assert.match(contract.factPolicy,/Do not invent/);assert.equal(contract.industry.groupId,'health');
});
test('changing the industry updates presets but keeps user-authored instructions',()=>{
 const p=withCreative(withCategory(newProject(),'pilates'),{directionId:'offer',note:'흰 배경을 사용해주세요.'});const next=withCategory(p,'banking');
 assert.equal(creativeContract(next).industry.id,'banking');assert.notEqual(creativeContract(next).direction.label,creativeContract(p).direction.label);assert.equal(creativeContract(next).additionalInstructions,p.campaign.creative.note);
});
test('creative settings validate enums and limits, and legacy campaigns remain compatible',()=>{
 assert.deepEqual(parseCreative(undefined),defaultCreative());assert.throws(()=>parseCreative({directionId:'promise-returns',look:'signature',note:''}));assert.throws(()=>parseCreative({directionId:'brand',look:'invalid',note:''}));assert.throws(()=>parseCreative({...defaultCreative(),note:'x'.repeat(601)}));
 const legacy=newProject().campaign;assert.equal(parseCampaign(legacy).creative,undefined);const picked=parseCreative({...defaultCreative(),apiKey:'never-store',extra:'ignored'});assert.deepEqual(picked,defaultCreative());
});
test('new industries and selected creative direction survive JSON import without requiring photos or dimensions',async()=>{
 let p=withCategory(newProject(),'yoga');p=chooseCreativeLook(withCreative(p,{directionId:'trust',note:'작은 스튜디오의 분위기'}),'signature');
 const restored=await importProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(restored.campaign,p.campaign);assert.equal(restored.productProfile.category,'yoga');assert.deepEqual(restored.dimensions,p.dimensions);assert.equal(restored.background.color,p.background.color);assert.notEqual(restored.id,p.id);
});
test('direction updates the campaign goal while later manual scene edits remain authoritative',()=>{
 const p=withCreative(withCategory(newProject(),'restaurant'),{directionId:'offer'});assert.equal(p.campaign.goal,'inquiry');
 const next=withCreative(p,{note:'예약 안내는 짧게'});assert.equal(next.campaign.goal,'inquiry');next.background.color='#aabbcc';next.ink='light';
 const request=buildGenerationRequest(next);assert.equal(request.creativeDirection.visual.backgroundColor,request.scene.backgroundColor);assert.equal(request.creativeDirection.visual.ink,request.scene.ink);
});
test('reselecting the current service never resets explicitly enabled specifications',()=>{
 const p=withCategory(newProject(),'biotech');p.productProfile.specType='cylindrical';p.dimensions.visible=true;
 const next=withCategory(p,'biotech');assert.equal(next.productProfile.specType,'cylindrical');assert.equal(next.dimensions.visible,true);assert.deepEqual(next.dimensions,p.dimensions);
});
