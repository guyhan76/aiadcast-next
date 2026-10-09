import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter, productionModels } from '../server/model-router.mjs';
const base = { provider: 'test-provider', modelId: 'test-image', revision: 'image-r1', enabled: true, evaluationPassed: true, capabilities: ['image-background'], backgroundOnly: true, adapterVersion: '1', evaluationVersion: 'benchmark-1' };
test('new or unevaluated models cannot silently replace a released model', () => {
  const router = new ModelRouter([base, { ...base, revision: 'image-r2', evaluationPassed: false }]);
  assert.equal(router.pin({ revision: 'image-r1', capability: 'image-background' }).revision, 'image-r1');
  assert.throws(() => router.pin({ revision: 'image-r2', capability: 'image-background' }), /released/);
  assert.throws(() => productionModels.pin({ revision: 'latest', capability: 'image-background' }), /released/);
});
test('capability checks prevent a whole-image model from claiming product preservation', () => {
  const router = new ModelRouter([{ ...base, backgroundOnly: false }]);
  assert.throws(() => router.pin({ revision: 'image-r1', capability: 'image-background' }), /composited/);
});
test('video generation cannot claim exact preservation without a suitable pipeline', () => {
  const router = new ModelRouter([{ ...base, capabilities: ['video-from-product'], preservesSourceFrames: false }]);
  assert.throws(() => router.pin({ revision: 'image-r1', capability: 'video-from-product' }), /identity/);
  assert.equal(router.pin({ revision: 'image-r1', capability: 'video-from-product', preserveProduct: false }).capability, 'video-from-product');
});
test('concept models require explicitly allowing a new product instead of promising preservation',()=>{
 const router=new ModelRouter([{...base,capabilities:['image-product-concept','image-ad-creative']}]);
 for(const capability of ['image-product-concept','image-ad-creative']){
  assert.throws(()=>router.pin({revision:'image-r1',capability}),/identity/);
  assert.equal(router.pin({revision:'image-r1',capability,preserveProduct:false}).capability,capability);
 }
});
