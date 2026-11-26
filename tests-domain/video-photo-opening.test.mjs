import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {videoPromptMessages} from '../server/video-prompt-assistant.mjs';
import {assistCopy} from '../server/text-assistant.mjs';
import {seedancePayload} from '../server/seedance-video.mjs';
import {openingReference} from '../server/video-photo-opening.mjs';
import {quotedVideoProvider} from '../server/quoted-video.mjs';

test('pizza photo and selling point reach the director, approved opening reaches WAN',async()=>{
  const brief={kind:'product',style:'product',title:'치즈 피자',description:'토마토와 바질',highlight:'풍성한 토핑',seconds:10};
  const image=await sharp({create:{width:160,height:160,channels:3,background:'#b43119'}}).jpeg().toBuffer();
  const ref='data:image/jpeg;base64,'+image.toString('base64');
  const [system,user]=videoPromptMessages({brief,references:[ref],targetLocale:'ko',planVersion:3});
  assert.match(system.content,/highlight.*|customer highlight/);
  assert.match(system.content,/product-explosion/);
  assert.equal(user.content[1].image_url.url,ref);
  assert.match(user.content[0].text,/풍성한 토핑/);
  const region=(y)=>[{x:200,y},{x:600,y},{x:550,y:y+220},{x:250,y:y+200}];
  const layout={mode:'layers',source:1,regions:[region(100),region(550)]};
  const guide=await openingReference(layout,[ref],'9:16');
  const bytes=Buffer.from(guide.split(',')[1],'base64');
  const info=await sharp(bytes).metadata();
  assert.equal(info.height,512);
  assert.equal(info.width,288);
  const pixel=await sharp(bytes).extract({left:145,top:125,width:1,height:1}).raw().toBuffer();
  assert.ok(pixel[0]>130 && pixel[1]<90);
  const base={ratio:'9:16',resolution:'720p',duration:10,content:[{type:'text',text:'Approved shots: lift toppings'}, {image_url:{url:ref}}]};
  const body={brief,shots:['lift toppings','bake','cheese pull'],frameLayout:layout};
  const wan=quotedVideoProvider('topview');
  const plan=wan.preparePlan(base,body);
  assert.deepEqual(plan.frameLayout,layout);
  const wire=wan.input(plan,['identity','guide']).input.input;
  assert.deepEqual(wire.media.map(item=>item.url),['identity','guide']);
  assert.match(wire.prompt,/LAST reference/);
  assert.doesNotMatch(wan.input(plan,['identity']).input.input.prompt,/LAST reference/);
  assert.equal(await openingReference({...layout,source:2},[ref],'9:16'),undefined);
  assert.equal(await openingReference(layout,Array(10).fill(ref),'9:16'),undefined);
  assert.equal(quotedVideoProvider('topview','topview/alibaba/wan-3.0/subject-framing-v7').preparePlan(base,body).frameLayout,undefined);
  assert.deepEqual(wan.preparePlan(base,{...body,promptPolicy:'owner-only',manualPrompt:'own'}),base);
});

test('a reviewed hook carries the selected recipe and photographed detail to the provider',async()=>{
  const photo='data:image/jpeg;base64,/9j/2Q==';
  const brief={kind:'product',style:'product',title:'아이스 카페라떼',description:'유리잔에 우유와 커피가 층을 이룬다.',
    highlight:'얼음 옆에서 갈색 소용돌이가 생기는 순간',ratio:'9:16',seconds:20,field:'',industry:'',
    caption:'',contact:'',music:false,voice:false,musicStyle:'',voiceStyle:'',narration:''};
  const request={kind:'video-prompt',requestId:'photo-skill-latte',targetLocale:'ko',planVersion:3,brief,references:[photo]};
  const idea={openingTechnique:'flowing-liquid',photoDetail:'투명한 유리잔 속 각얼음',opening:'커피가 우유에 닿는다.',
    reaction:'얼음 아래에서 갈색 소용돌이가 번진다.',detail:'우유와 커피가 섞이는 경계를 따라간다.',closing:'잔 전체를 보여준다.',
    musicMood:'조용한 피아노',narration:'',recommendVoice:false,frameLayout:{mode:'original',source:1,regions:[]}};
  const draft=answer=>assistCopy({request,apiKey:'fixture',fetchImpl:async(_,options)=>{
    const payload=JSON.parse(options.body);
    const schema=payload.response_format.json_schema.schema;
    assert.ok(schema.required.includes('openingTechnique') && schema.required.includes('photoDetail'));
    for (const id of ['product-explosion','flowing-liquid','fabric-texture']) assert.ok(schema.properties.openingTechnique.enum.includes(id));
    assert.deepEqual(JSON.parse(payload.messages[1].content[0].text).brief,brief);
    assert.equal(payload.messages[1].content[1].image_url.url,photo);
    return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(answer)}}]});
  }});
  const {shots}=await draft(idea);
  const body={requestId:request.requestId,seconds:20,brief:{...brief,emphasis:brief.highlight},references:[photo],shots,music:false,voice:false,musicStyle:'',voiceStyle:'',narration:''};
  const provider=quotedVideoProvider('topview');
  const wire=provider.input(provider.preparePlan(seedancePayload(body,provider.model),body),['https://example.org/reference.jpg']).input.input.prompt;
  assert.ok(wire.includes(shots[0]));
  for (const cue of ['흐르는 액체',idea.photoDetail,idea.opening,idea.reaction]) assert.ok(shots[0].includes(cue));
  for (const change of [{openingTechnique:'unknown'},{openingTechnique:undefined},{photoDetail:' '}])
    await assert.rejects(draft({...idea,...change}),/PROVIDER_INVALID_RESPONSE/);
});
