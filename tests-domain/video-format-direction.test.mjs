import assert from 'node:assert/strict';
import test from 'node:test';
import {formatBeats} from '../src/video-format-direction.ts';
import {basicVideoShots,validVideoShots} from '../src/video-prompt.ts';
import {normalizeVideoPromptRequest,videoPromptMessages} from '../server/video-prompt-assistant.mjs';
import {quotedVideoProvider} from '../server/quoted-video.mjs';
import {seedancePayload} from '../server/seedance-video.mjs';

const product = {kind:'product',field:'패션',industry:'의류',title:'겨울 롱패딩',description:'정류장 조명 아래 검은 후드에 눈이 쌓여 있다.',highlight:'첫 장면에 눈가루를 털고 마지막에는 무릎 기장을 보여준다.'};
const service = {kind:'service',field:'식음료',industry:'카페',title:'아이스 카페라떼',description:'햇살 드는 바에서 아이스 카페라떼를 주문 즉시 만든다.',highlight:'첫 방울이 우유에 닿는 순간을 보여준다.'};
const formats = [[product,'product','Product ad:'],[product,'unboxing','Unboxing:'],[product,'presenter','Product UGC:'],[service,'service','Service introduction:'],[service,'presenter','Service UGC:']];
const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
for (const [facts,style,marker] of formats) test(marker+' selected brief reaches planning and rendering',()=>{
  const brief={...facts,style,seconds:15,ratio:'9:16',caption:'',contact:'',music:false,voice:false,musicStyle:'',voiceStyle:'',narration:''};
  const references=facts.kind==='product' ? [jpeg,jpeg] : [];
  const request=normalizeVideoPromptRequest({requestId:'format-check-001',planVersion:facts.kind==='product'?2:1,targetLocale:'ko',brief,references});
  const [instructions,user]=videoPromptMessages(request);
  assert.ok(instructions.content.includes(formatBeats(brief,'en').join(' ')));
  const actual=JSON.parse(user.content[0].text).brief;
  for(const key of ['kind','style','field','industry','title','description','highlight']) assert.equal(actual[key],brief[key]);
  for(const language of ['ko','en']){
    const shots=basicVideoShots(brief,language);
    assert.ok(validVideoShots(shots));
    assert.ok(shots[0].includes(formatBeats(brief,language)[0]));
    for(const key of ['field','industry','title','description','highlight']) assert.ok(shots.join(' ').includes(brief[key]));
    assert.ok(validVideoShots(basicVideoShots({...brief,title:'x'.repeat(100),field:'a'.repeat(120),industry:'b'.repeat(160),description:'d'.repeat(2000),highlight:'h'.repeat(600)},language)));
  }
  const reviewed=['첫 장면은 지정한 구도','중간 장면은 편집한 동작','마지막은 그대로 유지'];
  const body={brief:{kind:brief.kind,style,title:brief.title,description:brief.description,emphasis:brief.highlight},seconds:15,shots:reviewed,promptMode:'auto',references,music:false,voice:false,musicStyle:'',voiceStyle:'',narration:''};
  const wan=quotedVideoProvider('topview');
  const plan=seedancePayload(body,wan.model);
  const wire=wan.input(wan.preparePlan(plan,body),[]).input.input.prompt;
  for(const item of [marker,brief.title,brief.description,brief.highlight,...reviewed]) assert.ok(wire.includes(item));
  assert.ok(!quotedVideoProvider('topview','topview/alibaba/wan-3.0/reviewed-brief-v5').preparePlan(plan,body).content[0].text.includes('Selected format, within the approved shots only'));
});
