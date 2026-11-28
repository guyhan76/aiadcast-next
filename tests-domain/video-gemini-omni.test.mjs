import test from 'node:test';
import assert from 'node:assert/strict';
import {quotedVideoProvider} from '../server/quoted-video.mjs';
import {GenerationService} from '../server/generation-service.mjs';

const provider=quotedVideoProvider('gemini');
const photo='data:image/jpeg;base64,/9j/2Q==';
const body={pilot:'gemini',requestId:'gemini-pilot-one',seconds:10,ratio:'9:16',promptMode:'auto',references:[photo],brief:{kind:'product',style:'presenter'}};

test('administrator can compare service and product plans at supported lengths and ratios',async()=>{
  assert.equal(provider.accepts(body),true);
  for(const seconds of [10,15,16,20,25,26,30])for(const promptMode of ['manual','auto']){
    assert.equal(provider.accepts({...body,seconds,promptMode,ratio:'16:9',references:[],brief:{kind:'service',style:'presenter'}}),true);
  }
  for(const change of [{seconds:31},{references:Array(7).fill(photo)},{references:[]},{ratio:'1:1'}])assert.equal(provider.accepts({...body,...change}),false);
  const db={prepare:()=>({get:()=>null})};
  await assert.rejects(GenerationService.prototype.startVideo.call({sharedWalletReady:true,db},body),e=>e.code==='VIDEO_TRIAL_UNAVAILABLE');
  assert.equal(provider.singleSubmit,true);
  assert.equal(quotedVideoProvider('gemini','other-revision'),null);
});

test('approved photo and directions produce one background request and replayable MP4 downloads',async t=>{
  const plan={duration:10,ratio:'9:16',content:[{type:'text',text:'Lift one slice, then show the empty plate.'},{image_url:{url:photo}}]};
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

function sampleMp4(seconds){
  const data=Buffer.alloc(48);
  data.writeUInt32BE(12,0); data.write('ftyp',4); data.write('isom',8);
  data.writeUInt32BE(36,12); data.write('moov',16);
  data.writeUInt32BE(28,20); data.write('mvhd',24);
  data.writeUInt32BE(1000,40); data.writeUInt32BE(seconds*1000,44);
  return data;
}
test('a 30s restaurant UGC job resumes each approved continuation once and delivers the final MP4',async t=>{
  const previous=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='unit-test';
  t.after(()=>{if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;});
  const service=new GenerationService({budgetMicros:8_000_000});
  service.adminTestUnlimited=true;
  t.after(()=>service.close());
  const posts=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(options.method==='POST'){
      const payload=JSON.parse(options.body);posts.push(payload);
      assert.equal(payload.response_format.duration,'10s');
      assert.equal(payload.localExtension,undefined);
      if(posts.length>1)assert.equal(payload.previous_interaction_id,'clip'+(posts.length-1));
      return Response.json({id:'clip'+posts.length});
    }
    const index=Number(url.slice(-1));
    return Response.json({status:'completed',usage:{total_input_tokens:100,total_output_tokens:1000},steps:[{type:'model_output',content:[{type:'video',mime_type:'video/mp4',data:sampleMp4(index*10).toString('base64')}]}]});
  });
  const ad={...body,requestId:'restaurant-service-ugc',seconds:30,promptMode:'manual',promptPolicy:'owner-only',manualPrompt:'손님이 매장에서 한 조각 먹고 한 판 더 주문한다.',
    music:false,voice:false,musicStyle:'',voiceStyle:'',narration:'',brief:{kind:'service',style:'presenter',title:'',description:'',emphasis:''}};
  await service.startVideo(ad);
  for(let i=0;i<2;i++)await Promise.all([service.videoResult(ad.requestId),service.videoResult(ad.requestId)]);
  assert.deepEqual(await service.videoResult(ad.requestId),{state:'ready'});
  assert.deepEqual(await service.videoResult(ad.requestId,true),sampleMp4(30));
  await service.startVideo(ad);
  assert.equal(posts.length,3);
});

test('a short final file cannot be delivered as a 20s ad',async t=>{
  const state=JSON.stringify({total:20,turn:1,ratio:'9:16',id:'v2',cost:100});
  t.mock.method(globalThis,'fetch',async()=>Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'video',mime_type:'video/mp4',data:sampleMp4(10).toString('base64')}]}]}));
  assert.equal((await provider.poll('key',state,true)).state,'failed');
});

test('a lost continuation response leaves one claim and prevents duplicate paid posts',async t=>{
  let stored=JSON.stringify({total:20,ratio:'9:16',id:'first',turn:0,cost:0}),posts=0;
  const replace=async(previous,next)=>{
    if(previous!==stored)return false;
    stored=next;return true;
  };
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    if(options.method==='POST'){posts++;throw Error('response lost');}
    return Response.json({status:'completed',steps:[{type:'model_output',content:[{type:'video',mime_type:'video/mp4',data:sampleMp4(10).toString('base64')}]}]});
  });
  const before=stored;
  const states=await Promise.all([provider.poll('key',before,false,replace),provider.poll('key',before,false,replace)]);
  assert.ok(states.some(x=>x.state==='uncertain'));
  const claim=JSON.parse(stored);
  stored=JSON.stringify({...claim,claimed:Date.now()-70000});
  assert.deepEqual(await provider.poll('key',stored,false,replace),{state:'uncertain'});
  assert.equal(posts,1);
});
