import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTopview,uploadTopviewImages,topviewInput,topviewConnection,submitTopview} from '../server/topview-video.mjs';

test('manual 15s quote retries a temporary failure and keeps the same reference and prompt',async t=>{
  const plan={duration:15,resolution:'720p',ratio:'9:16',generate_audio:true,content:[
    {type:'text',text:'눈길을 걷는 모델의 롱코트'}, {type:'image_url',image_url:{url:'data:image/png;base64,YWJj'}}]};
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.endsWith('/media/files'))return Response.json({data:{download_url:'https://example.com/coat.png'}});
    assert.ok(url.endsWith('/predictions/quote'));
    calls.push(JSON.parse(options.body));
    return calls.length===1?new Response(null,{status:503}):Response.json({data:{reserveUsd:'2.86011'}});
  });
  const urls=await uploadTopviewImages('test',plan.content);
  assert.equal(await estimateTopview('test',topviewInput(plan,urls)),2860110);
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1].input.content[0].text,plan.content[0].text);
  assert.equal(calls[1].input.duration,15);
});

test('image and quote errors retain their stage and invalid input is not retried',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:422});});
  await assert.rejects(uploadTopviewImages('test',[{}, {image_url:{url:'data:image/png;base64,YWJj'}}]),{videoPreflightCode:'VIDEO_REFERENCE_FORMAT'});
  await assert.rejects(estimateTopview('test',{}),{videoPreflightCode:'VIDEO_PROVIDER_INPUT'});
  assert.equal(calls,2);
});

test('hosted connection probe quotes a 15s reference video without submitting',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.ok(url.endsWith('/predictions/quote'));
    const {modelKey,input}=JSON.parse(options.body);
    assert.ok(modelKey.endsWith('/omni-reference-to-video'));assert.equal(input.duration,15);
    assert.equal(input.content[1].image_url.url,'https://example.com/icon.png');
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
