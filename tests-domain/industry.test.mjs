import {test} from 'node:test';
import assert from 'node:assert/strict';
import {industryGroups,industryGroupFor,industryLabel,industryPlaceholder,industryAudience,industryDirections,productCategories} from '../src/industry.ts';
import {dimensionAxes,isServiceCategory,parseProfile,withCategory} from '../src/product.ts';
import {newProject,importProject,exportErrors} from '../src/model.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {appendDirection} from '../src/conversation.ts';

const physical=['packaging','food','beauty','electronics','fashion','home','industrial','other','automotive'];
const requestedServices=['restaurant','cafe','lodging','travel','education','fitness','yoga','pilates','swimming','tennis','golf','sports','hospital','biotech','realestate','insurance','securities','stocks','crypto','finance','banking','lease','rental','services','corporate','tarot','astrology','myeongri','sinjeom'];

test('every requested industry has one discoverable group without hiding older saved categories',()=>{
  const categoryIds=productCategories.map(([id])=>id);
  assert.deepEqual(new Set(categoryIds),new Set([...physical,...requestedServices]));
  assert.equal(categoryIds.length,38);
  assert.equal(industryGroups.length,11);
  assert.deepEqual(industryGroups.find(group=>group.id==='fortune').categoryIds,['tarot','astrology','myeongri','sinjeom']);
  assert.deepEqual(['tarot','astrology','myeongri','sinjeom'].map(industryLabel),['타로','별자리','명리학','신점']);
  const grouped=industryGroups.flatMap(group=>group.categoryIds);
  assert.deepEqual([...grouped].sort(),[...categoryIds].sort());
  assert.equal(new Set(grouped).size,grouped.length);
  for(const category of categoryIds){
    assert.ok(industryGroupFor(category).categoryIds.includes(category));
    assert.ok(industryLabel(category).length>0);
    assert.ok(industryPlaceholder(category).startsWith('예: '));
    assert.ok(industryAudience(category).length>5);
  }
});

test('new service projects can prepare a photo-free ad without dimensions or invented product claims',()=>{
  for(const category of requestedServices){
    const p=withCategory(newProject(),category);
    p.productName=industryLabel(category);p.dimensions.width='';
    assert.equal(isServiceCategory(category),true,category);
    assert.equal(p.productProfile.specType,'none',category);
    assert.equal(p.dimensions.visible,false,category);
    assert.deepEqual(exportErrors(p),[],category);
    const request=buildGenerationRequest(p);
    assert.equal(request.subjectType,'service',category);
    assert.equal(request.source,null,category);
    assert.equal(request.claims.sameProduct,false,category);
    assert.deepEqual(request.specifications,[],category);
    assert.equal(request.output.showDimensions,false,category);
  }
});

test('physical product categories keep the source-photo requirement including automotive',()=>{
  for(const category of physical){
    const p=withCategory(newProject(),category);
    assert.equal(isServiceCategory(category),false,category);
    assert.ok(exportErrors(p).some(error=>error.includes('상품 사진')),category);
    assert.throws(()=>buildGenerationRequest(p),/상품 사진/,category);
  }
});

test('switching to a service preserves entered measurements and lets the user enable specs explicitly',()=>{
  const original=newProject();
  original.dimensions.width='450';original.dimensions.depth='270';original.dimensions.height='130';
  original.product={name:'original.png',sha256:'source-hash',data:'source-bytes',width:450,height:270};
  for(const category of requestedServices){
    const changed=withCategory(original,category);
    assert.equal(changed.product,original.product,category);
    assert.equal(changed.copy,original.copy,category);
    for(const axis of ['width','depth','height'])assert.equal(changed.dimensions[axis],original.dimensions[axis],category);
    changed.productProfile={...changed.productProfile,specType:'rectangular'};
    changed.dimensions={...changed.dimensions,visible:true};
    const request=buildGenerationRequest(changed);
    assert.deepEqual(request.specifications.map(spec=>spec.value),['450','270','130'],category);
    assert.equal(request.output.showDimensions,true,category);
    assert.equal(request.source.sha256,'source-hash',category);
    assert.deepEqual(dimensionAxes(changed.productProfile),['width','depth','height']);
    const back=withCategory(changed,'other');
    assert.equal(back.productProfile.specType,'rectangular',category);
    assert.equal(back.dimensions.width,'450',category);
  }
  assert.equal(original.productProfile.specType,'rectangular');
  assert.equal(original.dimensions.visible,true);
});

test('old and expanded profile values survive project import without changing category or spec intent',async()=>{
  assert.deepEqual(parseProfile(undefined),{category:'other',specType:'rectangular',material:''});
  for(const [category] of productCategories){
    for(const specType of ['none','flat','cylindrical','rectangular']){
      const p=newProject();p.productProfile={category,specType,material:'사용자가 제공한 정보'};
      const restored=await importProject(JSON.parse(JSON.stringify(p)));
      assert.deepEqual(restored.productProfile,p.productProfile,`${category} ${specType}`);
      assert.equal(restored.dimensions.width,p.dimensions.width);
    }
  }
  for(const [oldCategory,category] of [['saju','myeongri'],['fortunehouse','myeongri'],['divination','sinjeom']]){
    const p=appendDirection(withCategory(newProject(),category),'은은한 조명의 상담 공간으로 연출해주세요','background');
    p.productName='기존 상담소';
    p.productProfile={category:oldCategory,specType:'none',material:'이전 사용자가 제공한 정보'};
    p.conversation.turns[0].context.category=oldCategory;
    p.conversation.turns[0].context.productName=p.productName;
    const restored=await importProject(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(restored.productProfile,{...p.productProfile,category},oldCategory);
    assert.deepEqual(restored.copy,p.copy,oldCategory);
    assert.deepEqual(restored.dimensions,p.dimensions,oldCategory);
    assert.equal(buildGenerationRequest(restored).direction.instructions[0].text,p.conversation.turns[0].text,oldCategory);
    assert.throws(()=>buildGenerationRequest(withCategory(restored,'tarot')),/이전 요청/,oldCategory);
  }
  assert.throws(()=>parseProfile({category:'injected-industry',specType:'none',material:''}),/분류/);
  assert.throws(()=>parseProfile({category:'hospital',specType:'injected-spec',material:''}),/분류/);
});

test('recommended directions have a distinct business action and do not claim prices, clinical effects or investment returns',()=>{
  for(const [category] of productCategories){
    const directions=industryDirections(category);
    assert.deepEqual(directions.map(direction=>direction.id),['brand','offer','trust'],category);
    assert.equal(new Set(directions.map(direction=>direction.headline)).size,3,category);
    for(const direction of directions){
      for(const field of ['label','description','headline','cta']){
        assert.ok(direction[field].trim().length>0,`${category} ${field}`);
        assert.ok(direction[field].length<=50,`${category} ${field}`);
      }
      assert.doesNotMatch(direction.headline,/\d|무료|보장합니다|완치|수익|최고|최저/);
    }
  }
  assert.match(industryDirections('restaurant')[1].cta,/예약/);
  assert.match(industryDirections('fitness')[1].cta,/체험/);
  assert.match(industryDirections('hospital')[1].cta,/예약/);
  assert.match(industryDirections('corporate')[0].cta,/기업 소개/);
  assert.match(industryDirections('crypto')[2].description,/위험 정보/);
});
