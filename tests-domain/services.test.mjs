import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject,exportErrors,importProject} from '../src/model.ts';
import {dimensionAxes,parseProfile,specSummary,withCategory} from '../src/product.ts';
import {buildGenerationRequest,generationIssues} from '../src/generation.ts';
import {geometry} from '../src/layout.ts';
import {imageFormats} from '../src/formats.ts';

test('automotive and service categories default to no specs while keeping existing assets, measurements and copy',async()=>{
 const original=newProject();original.dimensions.width='-1';original.generation.mode='creative';
 for(const category of ['automotive','education','insurance','services']){
  const p=withCategory(original,category);
  assert.equal(parseProfile(p.productProfile).category,category);
  assert.equal(p.productProfile.specType,'none');assert.equal(p.dimensions.visible,false);assert.equal(p.dimensions.lines,false);
  assert.equal(p.dimensions.width,'-1');assert.deepEqual(p.copy,original.copy);
  assert.deepEqual(dimensionAxes(p.productProfile),[]);assert.equal(specSummary(p.dimensions,p.productProfile),'');
  assert.equal((await importProject(p)).productProfile.specType,'none');
  p.product={width:480,height:320,sha256:'same-upload'};
  const request=buildGenerationRequest(p);assert.deepEqual(request.specifications,[]);assert.equal(request.output.showDimensions,false);assert.equal(request.output.showDimensionLines,false);
  assert.equal(request.source.sha256,'same-upload');
  const back=withCategory(p,'packaging');assert.equal(back.productProfile.specType,'none');assert.equal(back.dimensions.width,'-1');
 }
 assert.equal(original.productProfile.specType,'rectangular');assert.equal(original.dimensions.visible,true);
});
test('photo-free service ads use copy and background without false identity claims or an invented source photo',()=>{
 for(const category of ['education','insurance','services']){
  const p=withCategory(newProject(),category);p.dimensions.width='';
  assert.deepEqual(exportErrors(p),[]);
  const request=buildGenerationRequest(p);assert.equal(request.operation,'compose-ad');assert.equal(request.source,null);assert.equal(request.preserveProduct,false);assert.equal(request.claims.sameProduct,false);assert.deepEqual(request.copy,p.copy.ko);
  p.generation.mode='creative';assert.ok(generationIssues(p).some(s=>s.includes('광고의 내용')));
  p.generation.brief='성인 수강생을 위한 차분한 영어 수업 광고';
  const creative=buildGenerationRequest(p);assert.equal(creative.operation,'image-ad-creative');assert.equal(creative.subjectType,'service');assert.deepEqual(creative.specifications,[]);
  assert.ok(exportErrors(p).some(s=>s.includes('AI 연결 후')));
 }
 assert.ok(exportErrors(withCategory(newProject(),'automotive')).some(s=>s.includes('상품 사진')));
});
test('spec-free photos gain space and service typography fits all seven output formats',()=>{
 for(const format of imageFormats){
  const physical=newProject();physical.format=format.id;physical.product={width:480,height:320};
  const car=withCategory(physical,'automotive');assert.ok(geometry(car).area.h>geometry(physical).area.h);
  for(const useSpecs of [false,true]){
   const service=withCategory(newProject(),'services');service.format=format.id;
   if(useSpecs){service.productProfile.specType='rectangular';service.dimensions.visible=true;}
   const g=geometry(service);assert.equal(g.textOnly,true);
   assert.ok(g.title.y>g.brand.y+g.brand.size*1.4);
   assert.ok(g.title.y+g.title.size*1.4*g.title.lines<g.description.y);
   const textEnd=g.description.y+g.description.size*1.4*g.description.lines;
   assert.ok(textEnd<(useSpecs?g.summary.y:g.footerLine.y),format.id);
  }
 }
});
