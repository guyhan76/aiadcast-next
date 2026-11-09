import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProfile, dimensionAxes, axisLabel, specSummary } from '../src/product.ts';
test('custom industry names survive profile parsing without changing old project shape',()=>{
 const old={category:'other',specType:'none',material:'original facts'};
 assert.deepEqual(parseProfile(old),old);
 assert.equal(parseProfile({...old,industryName:'  맞춤 분야  '}).industryName,'맞춤 분야');
 for(const industryName of ['', '  ', 3, '가'.repeat(81)])assert.throws(()=>parseProfile({...old,industryName}));
});
test('food, electronics, fashion and other physical goods share the same product structure', () => {
  for (const category of ['food','electronics','fashion','other']) {
    assert.equal(parseProfile({category,specType:'none',material:'user supplied'}).category,category);
  }
});
test('cylindrical and flat product dimensions do not require an invented third dimension', () => {
  const cylinder=parseProfile({category:'beauty',specType:'cylindrical',material:'glass'});
  assert.deepEqual(dimensionAxes(cylinder),['width','height']);
  assert.equal(axisLabel('width','ko',cylinder),'지름');
  assert.equal(specSummary({width:'80',depth:'unused',height:'210'},cylinder),'Ø 80 × 210 mm');
  assert.deepEqual(dimensionAxes(parseProfile({category:'fashion',specType:'none',material:''})),[]);
});
test('earlier project files get a compatible profile and malformed profiles are rejected', () => {
  assert.equal(parseProfile(undefined).specType,'rectangular');
  assert.throws(()=>parseProfile({category:'other',specType:'secret-code',material:''}));
});

