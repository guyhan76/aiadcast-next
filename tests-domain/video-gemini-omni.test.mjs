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

test('a lost create response cannot charge again when the same ad is retried',async t=>{
  const prev=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='unit-test';
  t.after(()=>{if(prev===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=prev;});
  const service=new GenerationService({budgetMicros:5_000_000});
  service.adminTestUnlimited=true;
  t.after(()=>service.close());
  let posts=0;
  t.mock.method(globalThis,'fetch',async()=>{posts++;throw Error('response lost');});
  const ad={...body,shots:['피자 조각을 든다.','접힌 도우를 보여준다.','추가 주문한다.'],music:false,voice:false,
    musicStyle:'',voiceStyle:'',narration:'',brief:{...body.brief,title:'피자',description:'치즈 피자',emphasis:'도우'}};
  await assert.rejects(service.startVideo(ad),e=>e.code==='VIDEO_SUBMISSION_UNCERTAIN');
  assert.deepEqual(await service.startVideo(ad),{id:ad.requestId});
  assert.deepEqual(await service.videoResult(ad.requestId),{state:'uncertain'});
  assert.equal(posts,1);
});
