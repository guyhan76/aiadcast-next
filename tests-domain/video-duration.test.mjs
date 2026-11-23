import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendDuration} from '../src/video-duration.ts';
import {videoDurationPrices} from '../server/video-duration-prices.mjs';

test('recommendations use the available material as well as the brief', () => {
  assert.equal(recommendDuration(1, 0, '신상품 출시'), 10);
  assert.equal(recommendDuration(2, 0, '신상품 출시'), 15);
  assert.equal(recommendDuration(1, 0, '상품 특징과 구성품'), 15);
  assert.equal(recommendDuration(1, 1, '개봉 과정'), 20);
  assert.equal(recommendDuration(2, 0, '사용 전후 비교'), 30);
  assert.equal(recommendDuration(1, 0, '전후 비교'), 10);
});
test('quotes use the fixed per-second price only for supported durations', () => {
  assert.deepEqual([12,17,28].map(s=>videoDurationPrices('')[s]),[24,34,56]);
  assert.deepEqual(videoDurationPrices('bad'), {});
  assert.deepEqual(videoDurationPrices('{"10":0,"15":19,"20":"42","30":-1,"60":40}'), {15:30});
});
