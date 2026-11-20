import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finishedAdSkillBrief, planAdBatch} from '../server/automatic-image-skills.mjs';
import {imageRecipes} from '../src/image-skills.ts';
const ids = new Set(imageRecipes.map(recipe => recipe.id));
const shoe = {subjectType:'physical-product', productProfile:{category:'shoes'}, source:{purpose:'subject'}, copy:{title:'스니커즈',description:'판매가 19,800원'}, creativeDirection:{additionalInstructions:'흰 배경에 사람 없이 신발만',direction:{id:'offer'}}};
const service = {subjectType:'service',copy:{title:'온라인 수업'},creativeDirection:{additionalInstructions:''}};

test('plans are deterministic for every supported count and leave the single-image route intact', () => {
  for (const request of [shoe, service]) {
    assert.equal(planAdBatch(request,1)[0],request);
    for (const n of [2,4,6,8,10]) {
      const plan = planAdBatch(request,n);
      assert.deepEqual(plan,planAdBatch(request,n));
      assert.equal(plan[0].batchDirection.role,'hero');
      assert.equal(new Set(plan.map(r=>r.batchDirection.role)).size,n);
      for (const [i,r] of plan.entries()) {
        const {batchDirection,...shared} = r;
        assert.deepEqual(shared,request);
        assert.ok(ids.has(batchDirection.primary));
        assert.ok(finishedAdSkillBrief(r).includes('Render only image '+(i+1)+' of '+n+'.'));
      }
    }
  }
});
test('the brief changes the plan, including supplied offers, photo evidence and recipe exclusions', () => {
  assert.equal(planAdBatch(shoe,2)[1].batchDirection.role,'offer');
  assert.equal(planAdBatch(service,2)[1].batchDirection.role,'meaning');
  assert.equal(planAdBatch({...service,source:{purpose:'style'}},2)[1].batchDirection.role,'meaning');
  assert.equal(planAdBatch({...service,source:{purpose:'subject'}},2)[1].batchDirection.role,'reference');
  const plain = {...shoe,copy:{title:'스니커즈'},creativeDirection:{additionalInstructions:'신발만, closeup 제외'}};
  const plan = planAdBatch(plain,10);
  assert.ok(plan.every(r=>r.batchDirection.primary!=='closeup' && !['surface','offer'].includes(r.batchDirection.role)));
  for (const [note,id] of [['2D 캐릭터로 만들어줘','anime'], ['3D 캐릭터로 만들어줘','clay']]) {
    const illustrated = {...service,creativeDirection:{additionalInstructions:note}};
    assert.ok(planAdBatch(illustrated,10).every(r=>r.batchDirection.primary===id));
  }
  const painted = {...service,creativeDirection:{additionalInstructions:'/watercolor'}};
  assert.ok(planAdBatch(painted,4).every(r=>r.batchDirection.primary==='watercolor' && finishedAdSkillBrief(r).includes('[watercolor]')));
});
test('customer-limited variations share framing and respect the permitted axis', () => {
  for (const note of ['같은 구도로 색상만 변경', '구도는 같게, 색상만 다르게', 'only change color', '같은 레이아웃에서 문구만 변경']) {
    const lock = {...shoe,creativeDirection:{additionalInstructions:note}};
    const set = planAdBatch(lock,10).map(r=>r.batchDirection);
    assert.ok(set.every(s=>s.locked && s.role==='hero' && s.primary===set[0].primary));
    if (!note.includes('문구')) assert.equal(new Set(set.map(s=>s.direction)).size,10);
    else assert.ok(set.every(s=>!s.direction.includes('candidate accent')));
  }
});
