import assert from 'node:assert/strict';
import test from 'node:test';
import {framingRule,lattePreparation} from '../src/video-subject-framing.ts';
import {basicVideoShots,validVideoShots} from '../src/video-prompt.ts';
import {videoPromptMessages} from '../server/video-prompt-assistant.mjs';
import {quotedVideoProvider} from '../server/quoted-video.mjs';

const brief={kind:'service',style:'service',title:'아이스 카페라떼',description:'우유를 담은 잔의 얼음에 에스프레소 줄기가 닿는다.',highlight:'얼음 아래에서 두 갈래로 퍼진다.',seconds:15};
const plan={content:[{type:'text',text:'Reviewed scene directions'}]};
for (const [kind,style] of [['product','product'],['product','unboxing'],['service','service'],['product','presenter'],['service','presenter']]) {
  test(kind+' '+style+' staging in the draft and renderer',()=>{
    const b={...brief,kind,style};
    const shots=basicVideoShots(b,'ko');
    assert.ok(validVideoShots(shots));
    const instructions=videoPromptMessages({brief:b,references:[],planVersion:kind==='product'?2:1})[0].content;
    const body={brief:{...b,emphasis:b.highlight},shots};
    const renderer=quotedVideoProvider('topview');
    const wire=renderer.preparePlan(plan,body).content[0].text;
    for (const prompt of [instructions,wire]) {
      assert.equal(prompt.includes('Subject-only framing throughout'),style!=='presenter');
      assert.equal(prompt.includes('two brown trails'),style!=='unboxing');
      if(style!=='unboxing') assert.match(prompt,/two thirds[\s\S]*upper third visibly empty[\s\S]*rise gradually[\s\S]*below the rim/);
    }
    if(style!=='unboxing'){
      assert.match(shots[0],/흰 우유.*얼음.*에스프레소.*닿자.*파문/);
      assert.match(shots[0],/얼음을 함께 담은 높이.*2\/3.*1\/3은 비어/);
      assert.match(shots[1],/얼음.*두 갈래.*수면이 서서히 올라가고.*섞인다/);
      assert.match(shots[2],/윗테두리에 닿기 전에/);
    }
    assert.equal(shots[0].includes('반사된 얼굴은 화면 밖'),style!=='presenter');
  });
}
test('preserve owner prompts, prior quotes and other drinks',()=>{
  const body={brief,shots:['a','b','c']};
  const v6=quotedVideoProvider('topview','topview/alibaba/wan-3.0/format-brief-v6');
  assert.doesNotMatch(v6.preparePlan(plan,body).content[0].text,/Subject-only framing throughout|two brown trails/);
  assert.deepEqual(quotedVideoProvider('topview').preparePlan(plan,{brief,manualPrompt:'owner',promptPolicy:'owner-only'}),plan);
  assert.ok(framingRule({...brief,style:'presenter',highlight:'사람 제외'},'en'));
  assert.equal(lattePreparation({...brief,title:'딸기 아이스 라떼'},'ko'),undefined);
  assert.equal(lattePreparation({...brief,description:'완성된 잔만 고정 촬영',highlight:''},'ko'),undefined);
});
