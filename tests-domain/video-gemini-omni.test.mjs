import test from 'node:test';
import assert from 'node:assert/strict';
import {quotedVideoProvider} from '../server/quoted-video.mjs';
import {GenerationService} from '../server/generation-service.mjs';

const provider=quotedVideoProvider('gemini');
const photo='data:image/jpeg;base64,/9j/2Q==';
const body={pilot:'gemini',requestId:'gemini-pilot-one',seconds:10,ratio:'9:16',promptMode:'auto',references:[photo],brief:{kind:'product',style:'presenter'}};

test('pilot requires administrator and a reviewed vertical ten-second product ad',async()=>{
  assert.equal(provider.accepts(body),true);
  for(const change of [{seconds:20},{promptMode:'manual'},{references:[]},{ratio:'16:9'}])assert.equal(provider.accepts({...body,...change}),false);
  const db={prepare:()=>({get:()=>null})};
  await assert.rejects(GenerationService.prototype.startVideo.call({sharedWalletReady:true,db},body),e=>e.code==='VIDEO_TRIAL_UNAVAILABLE');
  assert.equal(provider.singleSubmit,true);
  assert.equal(quotedVideoProvider('gemini','other-revision'),null);
});

test('approved photo and directions produce one background request and replayable MP4 downloads',async t=>{
  const plan={content:[{type:'text',text:'Lift one slice, then show the empty plate.'},{image_url:{url:photo}}]};
  const payload=provider.input(plan);
  assert.deepEqual(payload.input,[{type:'image',mime_type:'image/jpeg',data:'/9j/2Q=='},plan.content[0]]);
  assert.deepEqual(payload.response_format,{type:'video',aspect_ratio:'9:16',resolution:'720p',duration:'10s'});
  assert.equal(payload.model,'gemini-omni-1.2-flash');
  const file=Buffer.from([0,0,0,12,102,116,121,112,105,115,111,109]);
  let posts=0,reads=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.headers['x-goog-api-key'],'unit-test');
    if(options.method==='POST'){posts++;assert.deepEqual(JSON.parse(options.body),payload);return Response.json({id:'v1_pilot'});}
    assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions/v1_pilot');
    if(reads++===0)return Response.json({status:'in_progress'});
    return Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'video',mime_type:'video/mp4',data:file.toString('base64')}]}]});
  });
  const id=await provider.submit('unit-test',payload);
  assert.deepEqual(await provider.poll('unit-test',id),{state:'running'});
  assert.equal((await provider.poll('unit-test',id)).state,'ready');
  assert.deepEqual((await provider.poll('unit-test',id,true)).file,file);
  assert.equal(posts,1);
});

test('an explicit provider rejection retains its HTTP status',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:403}));
  await assert.rejects(provider.submit('unit-test',{}),e=>e.providerStatus===403);
});
