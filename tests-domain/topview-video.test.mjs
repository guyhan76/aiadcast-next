import test from 'node:test';
import assert from 'node:assert/strict';
import {GenerationService} from '../server/generation-service.mjs';
import {topviewConnection} from '../server/topview-video.mjs';
import {CloudGenerationService} from '../server/cloud/beta.mjs';
import {PostgresDatabase} from '../server/cloud/postgres.mjs';
import {pgPool} from './helpers/recommendation-pg-pool.mjs';

for(const engine of ['sqlite','pg'])test('TOPVIEW T1 '+engine+' reserves, submits once and settles the actual video cost',async t=>{
  const prev={AIADCAST_VIDEO_PROVIDER:process.env.AIADCAST_VIDEO_PROVIDER,TOPVIEW_API_PLATFORM_KEY:process.env.TOPVIEW_API_PLATFORM_KEY};
  Object.assign(process.env,{AIADCAST_VIDEO_PROVIDER:'topview',TOPVIEW_API_PLATFORM_KEY:'test-only'});
  t.after(()=>{for(const [key,value] of Object.entries(prev)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  let service;
  if(engine==='pg'){
    const pool=await pgPool();t.after(()=>pool.end());
    const db=await new PostgresDatabase(pool,'aiadcast_user_'+'2'.repeat(32)).initialize();
    service=await new CloudGenerationService().initialize({db,budgetMicros:5000000});
  }else{service=new GenerationService({budgetMicros:5000000});t.after(()=>service.close());}

  const brief={kind:'service',title:'스튜디오',description:'스튜디오 촬영',emphasis:''};
  const input={brief,requestId:'topview-ad-test-01',seconds:10,ratio:'9:16',music:false,voice:false,
    narration:'',voiceStyle:'',musicStyle:'',promptMode:'manual',manualPrompt:'A ceramic cup under soft studio light.',references:['data:image/png;base64,YWJj']};
  let status='processing',submissions=0,quote,denied=false;
  const source='https://media.example/reference',movie='https://media.example/movie';
  t.mock.method(globalThis,'fetch',async(raw,options)=>{
    const url=String(raw);
    if(url===movie){assert.equal(options.headers,undefined);return new Response(Buffer.from([0,0,0,12,102,116,121,112,105,115,111,109]));}
    assert.equal(new URL(url).origin,'https://platform-backend.topview.ai');
    assert.equal(options.headers.Authorization,'Bearer test-only');
    if(url.endsWith('/media/files')){
      if(denied)return new Response(null,{status:402});
      assert.equal(options.body.get('kind'),'image');assert.equal(await options.body.get('file').text(),'abc');
      return Response.json({data:{download_url:source}});
    }
    if(url.endsWith('/predictions/quote')){
      quote=JSON.parse(options.body);
      return Response.json({data:{estimatedUsd:'0.35',reserveUsd:'0.40'}});
    }
    if(options.method==='POST'){
      assert.equal(url,'https://platform-backend.topview.ai/api/v1/models/topview/topview-t1/omni-reference-to-video/predictions');
      assert.ok(options.headers['Idempotency-Key']);assert.deepEqual(JSON.parse(options.body),quote.input);
      assert.equal(quote.input.content[1].image_url.url,source);submissions++;return Response.json({data:{id:'topview-task-1'}});
    }
    assert.ok(url.endsWith('/predictions/topview-task-1'));
    return Response.json({data:{id:'topview-task-1',status,billing_state:status==='completed'?'CAPTURED':'RESERVED',charged_usd:'0.350000000000',outputs:[movie]}});
  });
  assert.deepEqual(await topviewConnection(),{state:'estimate_verified',estimatedUsd:.35,reserveUsd:.4});
  assert.ok(quote.modelKey.endsWith('/text-to-video'));
  await assert.rejects(service.startVideo(input),/VIDEO_TRIAL_UNAVAILABLE/);
  service.adminTestUnlimited=true;
  denied=true;await assert.rejects(service.startVideo(input),/VIDEO_PROVIDER_BALANCE/);denied=false;
  await service.startVideo(input);await service.startVideo(input);assert.equal(submissions,1);
  assert.equal((await service.ledger.budget(service.period())).held_micros,400000);
  process.env.AIADCAST_VIDEO_PROVIDER='higgsfield';
  assert.deepEqual(await service.videoResult(input.requestId),{state:'running'});
  status='payment_required';await assert.rejects(service.videoResult(input.requestId),/VIDEO_PROVIDER_BALANCE/);
  status='completed';assert.deepEqual(await service.videoResult(input.requestId),{state:'ready'});
  assert.equal((await service.videoResult(input.requestId,true)).toString('ascii',4,8),'ftyp');
  const budget=await service.ledger.budget(service.period());assert.equal(budget.spent_micros,350000);assert.equal(budget.held_micros,0);
  const summary=await service.videoAdminSummary();assert.equal(summary.jobs,1);assert.equal(summary.spentMicros,350000);assert.equal(summary.heldMicros,0);
});
