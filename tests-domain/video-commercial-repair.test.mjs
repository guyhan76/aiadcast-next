import test from 'node:test';
import assert from 'node:assert/strict';
import {assistCopy,normalizeAssistantRequest} from '../server/text-assistant.mjs';
import {quotedVideoProvider} from '../server/quoted-video.mjs';
import {videoResponseSchema} from '../server/video-prompt-assistant.mjs';
const photo='data:image/jpeg;base64,/9j/2Q==';
const brief={kind:'product',style:'presenter',ratio:'9:16',seconds:20,music:false,voice:false,field:'',industry:'',title:'피자',description:'',highlight:'',caption:'',contact:'',musicStyle:'',voiceStyle:'',narration:''};
const request={kind:'video-prompt',requestId:'shot-test-ugd',targetLocale:'ko',planVersion:4,brief,references:[photo]};
const json=result=>async()=>Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(result)}}]});
test('new UGC plans repair a repeated action before rendering',async()=>{
  const reply={opening:'조각을 든다.',reaction:'끝이 접힌다.',detail:'다시 든다.',closing:'빈 판을 본다.',photoDetail:'치즈',frameLayout:{mode:'original',source:1,regions:[]},
    sceneRecipes:{opening:['showcase'],detail:['showcase'],closing:['showcase']},narration:'',musicMood:'기타',recommendVoice:false,
    actionCheck:{events:['lift','lift','invite'],continuous:false,detailAlternative:'접힌 도우 단면을 보여준다.',closingAlternative:'친구가 추가 주문을 제안한다.'}};
  assert.ok(videoResponseSchema(request).schema.required.includes('actionCheck'));
  const result=await assistCopy({request,apiKey:'test',fetchImpl:json(reply)});
  assert.match(result.shots[1],/단면/);assert.doesNotMatch(result.shots[1],/다시 든다/);
});
test('new crop uses actual opening pixels while a saved v8 quote replays reference mode',()=>{
  const plan={content:[{type:'text',text:'owner'},{image_url:{url:photo}}],duration:20,ratio:'9:16',resolution:'720p'};
  const body={brief:{...brief,style:'product'},shots:['opening','detail','close'],frameLayout:{mode:'crop',source:1,regions:[[{x:10,y:10},{x:900,y:900}]]}};
  const now=quotedVideoProvider('topview'), old=quotedVideoProvider('topview','topview/alibaba/wan-3.0/photo-opening-v8');
  assert.equal(now.input(now.preparePlan(plan,body),['original','crop']).input.input.media[0].type,'first_frame');
  assert.equal(old.input(old.preparePlan(plan,body),['original','crop']).input.input.media[0].type,'reference_image');
});
test('frame review reports sampled timestamps only',async()=>{
  const req={kind:'video-review',requestId:'visual-review-test',targetLocale:'ko',brief:'접시',frames:[{time:0,image:photo},{time:3,image:photo}]};
  assert.deepEqual((await assistCopy({request:req,apiKey:'test',fetchImpl:json({issues:[{time:3,note:'접시 형태 변경'}]})})).issues[0].time,3);
  assert.throws(()=>normalizeAssistantRequest({...req,frames:req.frames.toReversed()}));
  await assert.rejects(assistCopy({request:req,apiKey:'test',fetchImpl:json({issues:[{time:2,note:'unseen'}]})}),/INVALID_RESPONSE/);
});
