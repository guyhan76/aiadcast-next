import assert from 'node:assert/strict';
import test from 'node:test';
import {videoVisualDirection} from '../server/video-visual-direction.mjs';
import {basicVideoShots} from '../src/video-prompt.ts';
import {videoPromptMessages} from '../server/video-prompt-assistant.mjs';
import {quotedVideoProvider} from '../server/quoted-video.mjs';
import {seedancePayload} from '../server/seedance-video.mjs';

const description='투명한 유리잔에 얼음과 흰 우유가 담겨 있다. 에스프레소 한 줄기를 부으면 흰 우유 사이로 짙은 갈색 무늬가 천천히 번진다. 마지막에는 얼음 아래로 부드러운 연갈색 라떼가 보인다.';
const emphasis='손, 사람, 자막은 화면에 넣지 않는다.';
for(const kind of ['product','service']) test('milk-first pour and final hold in '+kind+' auto plans',()=>{
  const brief={kind,style:kind,title:'아이스 카페라떼',description,highlight:emphasis};
  const shots=basicVideoShots(brief,'ko');
  assert.match(shots[0],/흰 우유.*에스프레소/);
  assert.match(shots[1],/갈색 무늬/);
  assert.match(shots[2],/마지막 프레임까지 잔/);
  const request={brief:{...brief,seconds:15},references:[],targetLocale:'ko',planVersion:kind==='product'?2:1};
  const [instructions,user]=videoPromptMessages(request);
  assert.match(instructions.content,/still-white milk/);
  assert.match(instructions.content,/Macro close-focus/);
  assert.ok(user.content[0].text.includes(emphasis));
  const body={brief:{...brief,emphasis},seconds:15,shots,promptMode:'auto',references:[],music:false,voice:false,musicStyle:'',voiceStyle:'',narration:''};
  const wan=quotedVideoProvider('topview');
  const base=seedancePayload(body,wan.model);
  const wire=wan.input(wan.preparePlan(base,body),[]).input.input.prompt;
  assert.ok(wire.includes(videoVisualDirection(brief)));
  for(const text of [description,emphasis,...shots,'ice and white milk only','Keep the excluded people or body parts outside the frame']) assert.ok(wire.includes(text),text);
  for(const text of [instructions.content,wire]) assert.doesNotMatch(text,/slide the glass|mid-strike|Open mid-task|pick up the glass/i);
  const old=quotedVideoProvider('topview','topview/alibaba/wan-3.0/hook-cta-v4');
  assert.doesNotMatch(old.preparePlan(base,body).content[0].text,/ice and white milk only/);
  if(kind==='product') assert.match(old.preparePlan(base,body).content[0].text,/slide the glass/);
});

test('camera technique follows subject type and all three input fields',()=>{
  for(const field of ['title','description','emphasis']){
    assert.match(videoVisualDirection({kind:'product',[field]:'봉제선 접사'}),/Product commercial.*Macro close-focus/);
  }
  assert.match(videoVisualDirection({kind:'service',title:'공간 대여',description:'공간 전경',emphasis:'손을 넣지 않는다'}),/Service commercial.*Wide scenic/);
  assert.doesNotMatch(videoVisualDirection({kind:'product',description:'접사 금지'}),/Macro close-focus/);
  const wan=quotedVideoProvider('topview');
  const plan={content:[{type:'text',text:'Owner authored direction.'}]};
  assert.deepEqual(wan.preparePlan(plan,{manualPrompt:plan.content[0].text,promptPolicy:'owner-only'}),plan);
});
