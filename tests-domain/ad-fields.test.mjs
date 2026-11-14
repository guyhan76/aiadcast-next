import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adFields} from '../src/ad-fields.ts';
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
