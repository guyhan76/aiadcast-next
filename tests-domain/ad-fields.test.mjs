import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adFields,customIndustryLimit,findAdField,formatIndustryDetail,matchesSport,searchSportSections,sportGroups} from '../src/ad-fields.ts';
import {productCategories,industryKindFor} from '../src/industry.ts';
import {newProject} from '../src/model.ts';
import {withCategory,parseProfile} from '../src/product.ts';
import {buildGenerationRequest} from '../src/generation.ts';

test('every selectable detail has one parent and preserves the advertised subject',()=>{
  const ids=new Set(), categories=new Set();
  for(const field of adFields) for(const item of field.items){
    assert.equal(industryKindFor(item.category),field.kind,item.id);
    assert.ok(!ids.has(item.id),item.id); ids.add(item.id); categories.add(item.category);
    const p=withCategory(newProject(),item.category);
    p.productName=item.ko;
    p.productProfile=parseProfile({...p.productProfile,industryDetail:item.ko,material:'고객 설명'});
    assert.equal(p.productProfile.industryDetail,item.ko);
    if(field.kind==='product') assert.throws(()=>buildGenerationRequest(p),/사진/);
    else {
      const req=buildGenerationRequest(p);
      assert.equal(req.subjectType,'service');
      assert.equal(req.productProfile.industryDetail,item.ko);
      assert.equal(req.productProfile.material,'고객 설명');
    }
  }
  assert.deepEqual(categories,new Set(productCategories.map(([id])=>id)));
});

test('every field has its own Other entry that survives project import',()=>{
  for(const field of adFields){
    const others=field.items.filter(item=>item.other);
    assert.equal(others.length,1,field.id);
    const item=others[0];
    assert.equal(field.items.at(-1),item,field.id);
    for(const entry of field.items) assert.equal(findAdField(entry.category,entry.ko)?.item.id,entry.id);
    const project=withCategory(newProject(),item.category);
    const detail=formatIndustryDetail(item,'직접 입력한 분야');
    project.productProfile=parseProfile({...project.productProfile,industryDetail:detail});
    assert.equal(project.productProfile.industryDetail,detail);
    assert.equal(findAdField(item.category,detail)?.field.id,field.id);
    assert.equal(findAdField(item.category,detail)?.custom,'직접 입력한 분야');
    assert.equal(findAdField(item.category,formatIndustryDetail(item,'가'.repeat(customIndustryLimit+1))),undefined);
    if(field.kind==='service'){
      project.productName='광고 테스트';
      assert.equal(buildGenerationRequest(project).productProfile.industryDetail,detail);
    }
  }
});

test('sports groups and aliases lead to the selected sport',()=>{
  const sports=adFields.find(field=>field.id==='sports');
  const items=sports.items.filter(item=>!item.other);
  assert.ok(items.every(item=>sportGroups.some(group=>group.id===item.group)));
  assert.ok(sportGroups.every(group=>items.some(item=>item.group===group.id)));
  for(const [query,id,group] of [
    ['런닝','running','track'],['BJJ','jiu-jitsu','combat'],['라켓','table-tennis','racket'],
    ['스노우보드','snowboarding','winter'],['스케이트','skateboarding','outdoor'],['배드민턴','badminton','racket'],
  ]){
    const item=items.find(item=>item.id===id);
    assert.equal(item.group,group);
    assert.ok(matchesSport(item,query),query);
  }
});

test('dance styles persist with their sport and reach generation requests',()=>{
  const parent=findAdField('sports','댄스스포츠').item;
  assert.equal(parent.id,'dance-sport');
  assert.deepEqual(parent.sections.filter(section=>section.ko).map(section=>[section.en,section.items.length]),
    [['Standard',5],['Latin',5]]);
  for(const item of parent.sections.flatMap(section=>section.items)){
    const custom=item.other ? '휠체어 댄스 입문' : '';
    const detail=formatIndustryDetail(item,custom);
    const project=withCategory(newProject(),'sports');
    project.productName='댄스 아카데미';
    project.productProfile=parseProfile({...project.productProfile,industryDetail:detail});
    const saved=findAdField('sports',project.productProfile.industryDetail);
    assert.equal(saved.parent.id,parent.id);
    assert.equal(saved.item.id,item.id);
    assert.equal(saved.custom,custom);
    assert.ok(detail.startsWith('댄스스포츠 · '));
    assert.equal(buildGenerationRequest(project).productProfile.industryDetail,detail);
  }
  const hits=query=>searchSportSections(parent,query).flatMap(section=>section.items.map(item=>item.id));
  assert.equal(hits('모던').length,5);
  assert.equal(hits('Latin').length,5);
  assert.deepEqual(hits('비에니즈 왈츠'),['dance-viennese-waltz']);
  assert.deepEqual(hits('Cha Cha'),['dance-cha-cha-cha']);
  assert.deepEqual(hits('스케이트'),[]);
  assert.equal(findAdField('sports','댄스스포츠 · 기타 · '+'가'.repeat(61)),undefined);
});
