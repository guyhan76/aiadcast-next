import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateHiggsfield,higgsfieldConnection} from '../server/higgsfield-video.mjs';
import {GenerationService} from '../server/generation-service.mjs';
import {CloudGenerationService} from '../server/cloud/beta.mjs';
import {PostgresDatabase} from '../server/cloud/postgres.mjs';
import {pgPool} from './helpers/recommendation-pg-pool.mjs';

const brief = {kind:'service',title:'영상 제작',description:'광고 영상을 만듭니다.',emphasis:''};
const input = {brief,requestId:'higgsfield-trial-01',seconds:10,music:false,voice:false,
  musicStyle:'',voiceStyle:'',narration:'',manualPrompt:'Show a steady close-up.',promptMode:'manual',ratio:'3:4',references:[]};
const reference = 'data:image/png;base64,YWJj';
async function fixture(t, database) {
  for (const [k, v] of Object.entries({AIADCAST_VIDEO_PROVIDER:'higgsfield',HF_CREDENTIALS:'fixture:fixture'})) {
    const prior=process.env[k]; process.env[k]=v;
    t.after(()=>{if(prior===undefined)delete process.env[k];else process.env[k]=prior;});
  }
  if(database==='pg'){
    const pool=await pgPool();t.after(()=>pool.end());
    const db=await new PostgresDatabase(pool,'aiadcast_user_'+'1'.repeat(32)).initialize();
    return new CloudGenerationService().initialize({db,budgetMicros:5000000});
  }
  const service=new GenerationService({budgetMicros:5000000});t.after(()=>service.close());return service;
}
for(const database of ['sqlite','pg'])test(database+' uploads, quotes, submits once and loads the MP4 after a provider switch',async t=>{
  const service=await fixture(t,database);
  const model='https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video';
  const movie='https://media.example/ad.mp4';
  let quotes=0,submissions=0,status='in_progress',quoted;
  const original={...input,references:[reference]};
  t.mock.method(globalThis,'fetch',async (url, options)=>{
    url=String(url);
    if(url.startsWith('https://api.higgsfield.ai/'))assert.equal(options.headers.Authorization,'Key fixture:fixture');
    if(url.endsWith('/files/generate-upload-url')){
      assert.deepEqual(JSON.parse(options.body),{content_type:'image/png'});
      return Response.json({upload_url:'https://upload.example/signed',public_url:'https://media.example/source',upload_headers:{'content-type':'image/png'}});
    }
    if(url==='https://upload.example/signed'){
      assert.equal(options.headers.has('authorization'),false);assert.equal(options.body.toString(),'abc');return new Response();
    }
    if(url.includes('/estimate/')){
      quoted=JSON.parse(options.body);quotes++;return Response.json({usd:'1.2345'});
    }
    if(url===model){
      submissions++;assert.ok(options.headers['Idempotency-Key']);assert.deepEqual(JSON.parse(options.body),quoted);
      assert.deepEqual(quoted.image_urls,['https://media.example/source']);assert.equal(quoted.duration,10);assert.equal(quoted.aspect_ratio,'3:4');
      assert.equal(quoted.generate_audio,false);assert.match(quoted.prompt,/steady close-up/);return Response.json({request_id:'provider-01'});
    }
    if(url===movie){assert.equal(options.headers,undefined);return new Response(Buffer.from([0,0,0,12,102,116,121,112,105,115,111,109]));}
    assert.ok(url.endsWith('/requests/provider-01/status'));return Response.json({request_id:'provider-01',status,video:{url:movie}});
  });
  await assert.rejects(service.startVideo(original),/VIDEO_TRIAL_UNAVAILABLE/);assert.equal(quotes,0);
  service.adminTestUnlimited=true;
  await Promise.all([service.startVideo(original),service.startVideo(original)]);
  assert.equal(submissions,1);assert.equal((await service.ledger.budget(service.period())).held_micros,1234500);
  process.env.AIADCAST_VIDEO_PROVIDER='byteplus';
  await service.startVideo(original);await assert.rejects(service.startVideo({...original,seconds:20}),/IDEMPOTENCY_CONFLICT/);
  assert.deepEqual(await service.videoResult(input.requestId),{state:'running'});
  status='completed';assert.deepEqual(await service.videoResult(input.requestId),{state:'ready'});
  assert.equal((await service.videoResult(input.requestId,true)).toString('ascii',4,8),'ftyp');
  assert.equal((await service.ledger.budget(service.period())).spent_micros,1234500);assert.equal(submissions,1);
});

test('ambiguous text submission replays the original key and payload, moderation releases the full hold',async t=>{
  const service=await fixture(t,'sqlite');service.adminTestUnlimited=true;
  const posts=[];let quotes=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.includes('/estimate/')){quotes++;return Response.json({usd:'1.00'});}
    if(options.method==='POST'){
      assert.ok(url.endsWith('/text-to-video'));posts.push([options.headers['Idempotency-Key'],options.body]);
      if(posts.length===1)throw Error('connection lost');
      return Response.json({request_id:'text-01'});
    }
    return Response.json({status:'nsfw',request_id:'text-01'});
  });
  await assert.rejects(service.startVideo(input),/VIDEO_SUBMISSION_UNCERTAIN/);
  assert.deepEqual(await service.videoResult(input.requestId),{state:'uncertain'});
  await service.startVideo(input);assert.equal(quotes,1);assert.deepEqual(posts[0],posts[1]);
  assert.deepEqual(await service.videoResult(input.requestId),{state:'failed'});
  const budget=service.ledger.budget(service.period());assert.equal(budget.spent_micros,0);assert.equal(budget.held_micros,0);
});

test('missing credentials, refused quotes and insufficient local budget never submit a paid request',async t=>{
  const service=await fixture(t,'sqlite');service.adminTestUnlimited=true;let count=0,denied=true;
  t.mock.method(globalThis,'fetch',async url=>{
    assert.ok(url.includes('/estimate/'));count++;
    return denied?new Response(null,{status:401}):Response.json({usd:'5.10'});
  });
  delete process.env.HF_CREDENTIALS;await assert.rejects(service.startVideo(input),/VIDEO_TRIAL_UNAVAILABLE/);assert.equal(count,0);
  process.env.HF_CREDENTIALS='fixture:fixture';
  await assert.rejects(service.startVideo(input),/VIDEO_PROVIDER_AUTH/);denied=false;
  await assert.rejects(service.startVideo(input),/budget unavailable|BUDGET_UNAVAILABLE/);
  assert.equal(count,2);assert.equal(service.db.prepare('SELECT COUNT(*) AS n FROM higgsfield_video_jobs').get().n,0);
});

test('startup check accepts opaque and paired credentials and calls only the quote endpoint',async t=>{
  let status=200;let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.higgsfield.ai/estimate/bytedance/seedance-2.5/text-to-video');
    const body=JSON.parse(options.body);
    assert.deepEqual([body.duration,body.aspect_ratio,body.resolution,body.generate_audio],[10,'9:16','720p',false]);
    assert.ok(['Key opaque-example','Key id:secret'].includes(options.headers.Authorization));
    return status===200?Response.json({usd:'2.25'}):new Response('untrusted error body',{status});
  });
  assert.deepEqual(await higgsfieldConnection({}),{state:'key_missing'});
  assert.deepEqual(await higgsfieldConnection({HF_CREDENTIALS:'a b'}),{state:'key_format_invalid'});
  assert.deepEqual(await higgsfieldConnection({HF_CREDENTIALS:'id:secret',AIADCAST_VIDEO_PROVIDER:'byteplus'}),{state:'other_provider_selected'});
  for(const credential of ['opaque-example','id:secret']){
    assert.deepEqual(await higgsfieldConnection({HF_CREDENTIALS:credential}),{state:'estimate_verified',usd:2.25});
  }
  status=401;
  assert.deepEqual(await higgsfieldConnection({HF_CREDENTIALS:'id:secret'}),{state:'estimate_unavailable',httpStatus:401});
  assert.equal(calls,3);
});

test('the private estimate check distinguishes protocol, quote, and network failures without logging secrets',async t=>{
  let mode='price';
  t.mock.method(globalThis,'fetch',async()=>{
    if(mode==='price')return Response.json({usd:null});
    if(mode==='json')return new Response('untrusted non-JSON');
    if(mode==='redirect')return new Response(null,{status:307,headers:{Location:'https://example.com/secret'}});
    const failure=new TypeError('sensitive network details',{cause:{code:'ECONNRESET'}});
    throw failure;
  });
  const env={HF_CREDENTIALS:'example'};
  assert.deepEqual(await higgsfieldConnection(env),{state:'estimate_unavailable',reason:'ESTIMATE_USD_MISSING',httpStatus:200});
  mode='json';
  assert.deepEqual(await higgsfieldConnection(env),{state:'estimate_unavailable',reason:'INVALID_PROVIDER_JSON',httpStatus:200});
  mode='redirect';
  assert.deepEqual(await higgsfieldConnection(env),{state:'estimate_unavailable',httpStatus:307});
  mode='network';
  assert.deepEqual(await higgsfieldConnection(env),{state:'estimate_unavailable',reason:'ECONNRESET'});
});

test('price descriptions quote output seconds and distinguish photo references from video inputs',async t=>{
  const base='Standard self-serve rates in USD per second of generated video. ';
  const photoRates='480p: $0.1177; 720p: $0.2647; 1080p: $0.6518.';
  const videoRates='480p: $0.1387; 720p: $0.3264; 1080p: $0.7858.';
  const units=' Total price = selected rate × output duration in seconds.';
  let description='Standard self-serve rates in USD per video second: '+photoRates+units;
  t.mock.method(globalThis,'fetch',async()=>Response.json({type:'dynamic',pricing_description:description}));
  const body={duration:10,resolution:'720p',aspect_ratio:'9:16'};
  const run=(op,options=body)=>estimateHiggsfield('example',{endpoint:'bytedance/seedance-2.5/'+op,body:options});
  assert.equal(await run('text-to-video'),2647000);
  description=base+'- Without video input: '+photoRates+' - With video input: '+videoRates+units;
  assert.equal(await run('reference-to-video',{...body,duration:15,image_urls:['https://example.org/supplied-image.jpg']}),3970500);
  await assert.rejects(run('reference-to-video',{...body,video_urls:['https://example.org/video.mp4']}),/ESTIMATE_USD_MISSING/);
  description=base+'With video input: '+videoRates+units;
  await assert.rejects(run('reference-to-video'),/ESTIMATE_USD_MISSING/);
  description=base+'720p: $0.2647 per 1000 tokens.'+units;
  await assert.rejects(run('text-to-video'),/ESTIMATE_USD_MISSING/);
});
