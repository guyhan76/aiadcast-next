import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTopview,uploadTopviewImages,topviewInput,topviewConnection,submitTopview} from '../server/topview-video.mjs';

import sharp from 'sharp';
import {basicVideoShots} from '../src/video-prompt.ts';
import {videoPromptMessages} from '../server/video-prompt-assistant.mjs';
const sample = await sharp({create:{width:260,height:300,channels:3,background:'#765432'}}).jpeg().toBuffer();
const sampleUrl = 'data:image/jpeg;base64,'+sample.toString('base64');

import {quotedVideoProvider} from '../server/quoted-video.mjs';

test('WAN requests preserve reference order, timing, ratio and audio; old jobs replay T1',()=>{
  const urls=Array.from({length:10},(_,i)=>'https://example.com/ref'+i+'.jpg');
  for(const duration of [10,15,20,30]) for(const audio of [false,true]){
    const plan={duration,ratio:'9:16',resolution:'720p',generate_audio:audio,content:[{type:'text',text:'Iced latte'}]};
    for(const images of [[],urls.slice(0,1),urls]){
      const {modelKey,input}=topviewInput(plan,images);
      assert.equal(modelKey,'alibaba/wan-3.0/'+(images.length?'reference-to-video':'text-to-video'));
      assert.equal(input.input.prompt,'Iced latte');
      assert.deepEqual(input.input.media,images.length?images.map(url=>({type:'reference_image',url})):undefined);
      assert.deepEqual(input.parameters,{duration,ratio:'9:16',resolution:'720P',audio});
    }
    const previous=quotedVideoProvider('topview','topview/topview-t1');
    assert.equal(previous.model,'topview/topview-t1');
    assert.deepEqual(previous.input(plan,[urls[0]]),{
      modelKey:'topview/topview-t1/omni-reference-to-video',
      input:{duration,ratio:'9:16',resolution:'720p',generate_audio:audio,
        content:[plan.content[0],{type:'image_url',role:'reference_image',image_url:{url:urls[0]}}]}
    });
    assert.equal(quotedVideoProvider('topview').revision,'topview/alibaba/wan-3.0/hook-cta-v4');
  }
});

test('manual 15s quote retries a temporary failure and keeps the same reference and prompt',async t=>{
  const plan={duration:15,resolution:'720p',ratio:'9:16',generate_audio:true,content:[
    {type:'text',text:'눈길을 걷는 모델의 롱코트'}, {type:'image_url',image_url:{url:sampleUrl}}]};
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.endsWith('/media/files'))return Response.json({data:{download_url:'https://example.com/coat.png'}});
    assert.ok(url.endsWith('/predictions/quote'));
    calls.push(JSON.parse(options.body));
    return calls.length===1?new Response(null,{status:503}):Response.json({data:{reserveUsd:'2.86011'}});
  });
  const urls=await uploadTopviewImages('test',plan.content);
  assert.equal(await estimateTopview('test',topviewInput(plan,urls)),2860110);
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1].input.input.prompt,plan.content[0].text);
  assert.equal(calls[1].input.parameters.duration,15);
});

test('image and quote errors retain their stage and invalid input is not retried',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:422});});
  await assert.rejects(uploadTopviewImages('test',[{}, {image_url:{url:sampleUrl}}]),{videoPreflightCode:'VIDEO_REFERENCE_FORMAT'});
  await assert.rejects(estimateTopview('test',{}),{videoPreflightCode:'VIDEO_PROVIDER_INPUT'});
  assert.equal(calls,2);
});

test('hosted connection probe uploads an opaque reference and quotes 10s without submitting',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.endsWith('/media/files')){
      assert.equal(options.body.get('file').type,'image/jpeg');
      return Response.json({data:{download_url:'https://example.com/icon.jpg'}});
    }
    assert.ok(url.endsWith('/predictions/quote'));
    const {modelKey,input}=JSON.parse(options.body);
    assert.equal(modelKey,'alibaba/wan-3.0/reference-to-video');assert.equal(input.parameters.duration,10);
    assert.equal(input.input.media[0].url,'https://example.com/icon.jpg');
    return Response.json({data:{estimatedUsd:'2.6',reserveUsd:'2.86'}});
  });
  assert.equal((await topviewConnection({TOPVIEW_API_PLATFORM_KEY:'test'},true)).state,'estimate_verified');
});

test('temporary prediction submission errors do not trigger a second submission',async t=>{
  let count=0;
  t.mock.method(globalThis,'fetch',async()=>{count++;return new Response(null,{status:503});});
  await assert.rejects(submitTopview('test',{modelKey:'test',input:{}},'same-id'),{providerStatus:503});
  assert.equal(count,1);
});

test('WAN upload fits a transparent small PNG into the allowed frame without cropping',async t=>{
  const tiny = await sharp({create:{width:24,height:8,channels:4,background:'#77440088'}}).png().toBuffer();
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const file=options.body.get('file');
    const metadata=await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    assert.equal(metadata.format,'jpeg');
    assert.equal(metadata.hasAlpha,false);
    assert.ok(metadata.width>=240 && metadata.height>=240);
    return Response.json({data:{download_url:'https://example.com/reference.jpg'}});
  });
  await uploadTopviewImages('test',[{}, {image_url:{url:'data:image/png;base64,'+tiny.toString('base64')}}]);
});

test('WAN hooks new auto and manual product requests while retaining the old revision for retries',()=>{
  const body={brief:{kind:'product'},shots:['ice tips','milk marbles','glass rests']};
  const plan={content:[{type:'text',text:body.shots.join('\n')}],resolution:'720p',duration:10,ratio:'9:16',generate_audio:false};
  const current=quotedVideoProvider('topview');
  const old=quotedVideoProvider('topview','topview/alibaba/wan-3.0');
  const text=current.input(current.preparePlan(plan,body),[]).input.input.prompt;
  assert.match(text,/By 0\.8 seconds/);assert.match(text,/At 3s switch/);assert.match(text,/At 7s switch/);
  assert.ok(text.includes(plan.content[0].text));
  const prior=quotedVideoProvider('topview','topview/alibaba/wan-3.0/opening-v2');
  for (const style of ['product','presenter','unboxing']) {
    const manual={brief:{kind:'product',style},manualPrompt:'One continuous shot. No narration or subtitles.',promptPolicy:'owner-only'};
    const manualPlan={...plan,content:[{type:'text',text:manual.manualPrompt}]};
    const refs=['https://example.org/product.jpg','https://example.org/person.jpg'];
    const {input,parameters}=current.input(current.preparePlan(manualPlan,manual),refs).input;
    assert.match(input.prompt,/^FRAME 1/);
    assert.match(input.prompt,/By 0\.8 seconds/);
    assert.ok(input.prompt.includes(manual.manualPrompt));
    assert.doesNotMatch(input.prompt,/At 3s switch/);
    assert.deepEqual(input.media.map(item=>item.url),refs);
    assert.equal(parameters.audio,false);
    assert.deepEqual(prior.preparePlan(manualPlan,manual),old.preparePlan(manualPlan));
  }
  const service={brief:{kind:'service'},shots:body.shots};
  assert.match(current.preparePlan(plan,service).content[0].text,/FRAME 1.*mid-task/);
  assert.deepEqual(quotedVideoProvider('topview','topview/alibaba/wan-3.0/product-hook-v3').preparePlan(plan,service),old.preparePlan(plan));
  assert.ok(!old.preparePlan(plan,body).content[0].text.includes('At 3s switch'));
});

test('iced latte gets impact, swirl and a whole-glass finish in both the fallback and planner input',()=>{
  const brief={kind:'product',style:'product',field:'식품',title:'아이스라떼',description:'에스프레소, 얼음과 우유',highlight:'강렬한 시작',seconds:10};
  const [opening,detail,closing]=basicVideoShots(brief,'ko');
  assert.match(opening,/얼음이 부딪/);assert.match(detail,/잔 옆면으로 컷/);assert.match(closing,/잔 전체/);
  const [instructions]=videoPromptMessages({brief,references:[],targetLocale:'ko'});
  assert.match(instructions.content,/Two ice cubes collide at frame one/);
  const presenter={...brief,style:'presenter'};
  assert.match(basicVideoShots(presenter,'ko')[0],/잔 벽을 치고/);
  assert.match(videoPromptMessages({brief:presenter,references:[],targetLocale:'ko'})[0].content,/Ice slides into the glass wall/);
  for(const change of [{title:'아이스 말차라떼'},{description:'에스프레소 캡슐 밀봉'},{style:'unboxing'},{style:'presenter'}]){
    assert.doesNotMatch(basicVideoShots({...brief,...change},'ko')[0],/얼음이 부딪/);
  }
});

test('quote payload connects a mute opening, proof and one closing action in both modes',()=>{
  const provider=quotedVideoProvider('topview');
  for(const style of ['product','presenter','unboxing'])for(const manual of [false,true]){
    const brief={kind:'product',style,title:'아이스라떼',description:'얼음과 커피',highlight:''};
    const shots=basicVideoShots(brief,'ko');
    const direction=manual?'One take. No speech.':shots.join('\n');
    const body=manual?{brief,manualPrompt:direction}:{brief,shots};
    const plan={content:[{type:'text',text:direction}],duration:15,ratio:'9:16',resolution:'720p',generate_audio:false};
    const payload=provider.input(provider.preparePlan(plan,body),['https://example.org/glass']);
    const prompt=payload.input.input.prompt;
    assert.match(prompt,/^FRAME 1/);
    assert.match(prompt,/By 0\.8 seconds/);
    assert.match(prompt,/one visible demonstration/);
    assert.match(prompt,/Closing action/);
    assert.ok(prompt.includes(direction));
    assert.match(prompt,style==='presenter'?/offer the same item/:style==='unboxing'?/first use/:/invitation to try it/);
    assert.equal(payload.input.parameters.audio,false);
    assert.doesNotMatch(quotedVideoProvider('topview','topview/alibaba/wan-3.0/product-hook-v3').preparePlan(plan,body).content[0].text,/Closing action/);
  }
});
