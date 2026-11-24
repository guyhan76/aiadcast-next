import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTopview,uploadTopviewImages,topviewInput,topviewConnection,submitTopview} from '../server/topview-video.mjs';

import sharp from 'sharp';
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
    assert.equal(quotedVideoProvider('topview').revision,'topview/alibaba/wan-3.0');
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

test('hosted connection probe quotes a 15s reference video without submitting',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.ok(url.endsWith('/predictions/quote'));
    const {modelKey,input}=JSON.parse(options.body);
    assert.equal(modelKey,'alibaba/wan-3.0/reference-to-video');assert.equal(input.parameters.duration,15);
    assert.equal(input.input.media[0].url,'https://example.com/icon.png');
    return Response.json({data:{estimatedUsd:'2.6',reserveUsd:'2.86'}});
  });
  assert.equal((await topviewConnection({TOPVIEW_API_PLATFORM_KEY:'test'},'https://example.com/icon.png')).state,'estimate_verified');
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
