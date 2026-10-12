import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitAdOffer,compactAdDescription} from '../src/ad-copy.ts';
import {creativeCopy} from '../src/creative.ts';
import {newProject} from '../src/model.ts';
import {withCategory} from '../src/product.ts';

test('postal box copy retains supplied material, fulfilment and exact quantity/price beyond 80 characters',()=>{
 const p=withCategory(newProject(),'boxes');p.productName='우체국3호박스';
 p.productProfile.material='B골, 크라프트재질. 크라프트재질로 내구성이 튼튼하고 습기에 강하다. 택배물류 박스에 표준규격. 우체국박스로 믿을 수 있는 든든함. 빠른배송. 10개 19,800원';
 assert.ok(p.productProfile.material.length>80);
 const copy=creativeCopy(p),offer=splitAdOffer(copy.description);
 assert.match(copy.title,/우체국3호박스/);assert.match(copy.title,/배송의 시작/);
 for(const fact of ['B골','크라프트','습기','빠른배송'])assert.ok(offer.description.includes(fact));
 assert.equal(offer.offer,'10개 19,800원');assert.ok(!offer.description.includes('19,800원'));
});
test('price emphasis preserves context when multiple amounts are supplied and never invents prices',()=>{
 assert.deepEqual(splitAdOffer('세럼 150ml · 빠른배송'),{description:'세럼 150ml · 빠른배송',offer:''});
 assert.deepEqual(splitAdOffer('정가 29,800원, 판매가 19,800원'),{description:'정가 29,800원, 판매가 19,800원',offer:''});
 assert.equal(splitAdOffer('10개 19,800원').offer,'10개 19,800원');
 assert.equal(splitAdOffer('10매에 19800원').offer,'10매에 19800원');
 assert.equal(splitAdOffer('Premium finish. $19.80').offer,'$19.80');
 const long='제공한 상품 특징을 자세하게 설명합니다. '.repeat(15)+' 10개 19,800원';
 const compact=compactAdDescription(long);assert.ok(compact.length<=160);assert.ok(compact.endsWith('10개 19,800원'));
 const comparison='확정한 상세 설명 '.repeat(20)+'정가 29,800원, 판매가 19,800원';assert.equal(compactAdDescription(comparison),comparison.trim());
});
