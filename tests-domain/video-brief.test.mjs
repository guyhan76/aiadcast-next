import test from 'node:test';
import assert from 'node:assert/strict';
import {GenerationService} from '../server/generation-service.mjs';
import {seedancePayload} from '../server/seedance-video.mjs';
import {projectVideoBrief,videoPlan,captionAt,sceneCaptions,sceneCaptionAt} from '../src/video-brief.ts';

const brief={kind:'service',title:'박스접기 계약직',description:'인천 물류센터에서 근무합니다.',emphasis:'한 달 최대 369만 원',contact:'010-1234-5678'};
const input={requestId:'video-request-01',brief,references:[],seconds:15,music:true,voice:true,musicStyle:'경쾌한 연주곡',voiceStyle:'또렷하게',narration:'한 달 최대 삼백육십구만 원.'};

test('project brief keeps exact facts and manual copy for preview and export',()=>{
 const project={productName:brief.title,locale:'ko',productProfile:{category:'services',material:brief.description},campaign:{creative:{note:brief.emphasis}},copy:{ko:{contact:brief.contact,email:'hidden@example.com'}},footer:{email:false}};
 assert.deepEqual(projectVideoBrief(project),brief);
 const plan=videoPlan(brief,'첫 문장\n두 번째 문장','직접 쓴 대사');
 assert.deepEqual(plan.captions,['첫 문장','두 번째 문장',brief.contact]);
 assert.equal(captionAt(plan.captions,1),brief.contact);
 assert.equal(plan.voice,'직접 쓴 대사');
 assert.ok(videoPlan(brief,'','').captions.includes('한 달 최대 369만 원'));
 const payload=seedancePayload(input,'model');
 assert.equal(payload.generate_audio,true);
 assert.match(payload.content[0].text,/한 달 최대/);
 assert.equal(seedancePayload({...input,music:false,voice:false},'model').generate_audio,false);
 assert.throws(()=>seedancePayload({...input,references:['file:///private']},'model'));
});

test('trial submits once, reserves budget, restricts members, and serves the finished asset',async t=>{
 const settings={AIADCAST_SEEDANCE_API_KEY:'test',AIADCAST_SEEDANCE_MODEL:'test-model',AIADCAST_SEEDANCE_MAX_JOB_MICROS:'500000',AIADCAST_SEEDANCE_USD_PER_MILLION_TOKENS:'4'};
 for(const [key,value] of Object.entries(settings)){const prior=process.env[key];process.env[key]=value;t.after(()=>prior===undefined?delete process.env[key]:process.env[key]=prior);}
 const service=new GenerationService({budgetMicros:2_000_000});t.after(()=>service.close());
 let posts=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
   if(init.method==='POST'){posts++;return Response.json({id:'provider-task-1'});}
   if(String(url).startsWith('https://fixture.example/'))return new Response(Buffer.from([0,0,0,12,102,116,121,112,105,115,111,109]));
   return Response.json({status:'succeeded',content:{video_url:'https://fixture.example/video.mp4'},usage:{completion_tokens:10000}});
 });
 await assert.rejects(service.startVideo(input),/VIDEO_TRIAL_UNAVAILABLE/);
 service.adminTestUnlimited=true;
 const shots=['automatic opening','automatic detail','automatic closing'];
 const manualPrompt='owner direction';
 for(const fields of [
   {promptMode:'auto',shots,manualPrompt},{promptMode:'manual',shots,manualPrompt},
   {promptMode:'manual',shots},{promptMode:'auto',manualPrompt},
   {promptMode:'auto'},{promptMode:'manual'},{promptMode:'other',shots},
 ]){
   await assert.rejects(service.startVideo({...input,...fields}),/INVALID_VIDEO/);
 }
 assert.equal(posts,0);
 assert.equal(service.ledger.budget(service.period())?.held_micros??0,0);
 for(const [mode,fields] of [['auto',{shots}],['manual',{manualPrompt}]]){
   assert.deepEqual(seedancePayload({...input,promptMode:mode,...fields},'model'),seedancePayload({...input,...fields},'model'));
 }
 await Promise.all([service.startVideo(input),service.startVideo(input)]);
 await service.startVideo({...input,ratio:'9:16'});
 assert.equal(posts,1);await assert.rejects(service.startVideo({...input,seconds:20}),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(service.startVideo({...input,ratio:'16:9'}),/IDEMPOTENCY_CONFLICT/);
 assert.equal(service.ledger.budget(service.period()).held_micros,500000);
 assert.deepEqual(await service.videoResult(input.requestId),{state:'ready'});
 assert.equal((await service.videoResult(input.requestId,true)).toString('ascii',4,8),'ftyp');
 assert.equal(service.ledger.budget(service.period()).spent_micros,40000);
 assert.equal(service.ledger.budget(service.period()).held_micros,0);
});

test('provider requests honor all five aspect ratios and default older requests to vertical',()=>{
 const legacy=seedancePayload(input,'model');
 assert.deepEqual(seedancePayload({...input,ratio:'9:16'},'model'),legacy);
 for(const [ratio,orientation] of [['16:9','landscape'],['4:3','landscape'],['1:1','square'],['3:4','vertical'],['9:16','vertical']]){
   const payload=seedancePayload({...input,ratio},'model');
   assert.equal(payload.ratio,ratio);
   assert.ok(payload.content[0].text.startsWith('Create a '+orientation+' commercial.'));
 }
 for(const ratio of ['4:5','',null,{}])assert.throws(()=>seedancePayload({...input,ratio},'model'),/INVALID_VIDEO/);
});

test('style-specific shots and AI direction use the selected format',async()=>{
 const {videoShot,sceneStops}=await import('../src/video-style.ts');
 assert.deepEqual(sceneStops(10),[0,3,7,10]);
 assert.equal(videoShot(2,10,2,'unboxing').source,0);
 assert.equal(videoShot(3,10,2,'unboxing').source,1);
 assert.ok(videoShot(5,10,1,'product').zoom>1);
 assert.equal(videoShot(9,10,1,'product').zoom,1);
 assert.match(seedancePayload({...input,brief:{...brief,style:'presenter'}},'model').content[0].text,/presenter-led/);
 assert.throws(()=>seedancePayload({...input,brief:{...brief,style:'other'}},'model'));
});

test('reuse the image industry in the video brief, including earlier project descriptions',()=>{
 const project={productName:'다운 재킷',locale:'ko',productProfile:{category:'fashion',material:'업종: 패션·잡화 > 의류\n겨울용 재킷입니다.'},copy:{ko:{}}};
 const video=projectVideoBrief(project);
 assert.deepEqual([video.kind,video.fieldId,video.category,video.industryDetail],['product','fashion','fashion','의류']);
 assert.equal(video.description,'겨울용 재킷입니다.');
 const contextFor=changes=>JSON.parse(seedancePayload({...input,brief:{...video,...changes}},'model').content[0].text.split('\n').find(line=>line.startsWith('{"subject"'))).industryContext;
 assert.equal(contextFor({}).field,'패션·잡화');
 assert.equal(contextFor({}).industry,'의류');
 assert.ok(contextFor({}).shotFocus);
 assert.throws(()=>contextFor({fieldId:'travel'}),/INVALID_VIDEO/);
 assert.throws(()=>contextFor({kind:'service'}),/INVALID_VIDEO/);
 assert.equal(contextFor({fieldId:'beauty',category:undefined,industryDetail:undefined}).field,'뷰티·건강');
});

test('reviewed camera directions replace default shots verbatim and preserve timing',()=>{
 const shots=['넓은 전경으로 시작.','후드 봉제선을 따라 천천히 이동.','마지막 구도를 고정.'];
 const {content}=seedancePayload({...input,seconds:10,shots},'model');
 assert.match(content[0].text,/3–7s · 후드 봉제선을 따라 천천히 이동\./);
 assert.ok(!content[0].text.includes('illustrate one supplied detail'));
 for(const bad of [[],['a',' ','b'],['x'.repeat(901),'b','c']])assert.throws(()=>seedancePayload({...input,shots:bad},'model'),/INVALID_VIDEO/);
});

test('photo-aware prompt requests use the text assistant budget and retain only the three editable shots',async t=>{
 const {assistCopy}=await import('../server/text-assistant.mjs');
 const photo='data:image/jpeg;base64,/9j/2Q==';
 const request={kind:'video-prompt',requestId:'product-prompt-1',targetLocale:'ko',brief:{
  kind:'product',style:'product',ratio:'9:16',seconds:10,field:'패션·잡화',industry:'의류',title:'하이브리드 롱코트',description:'눈 덮인 산을 배경으로 촬영',highlight:'',caption:'',contact:'',music:true,voice:false,musicStyle:'',voiceStyle:'',narration:''},references:[photo]};
 let calls=0;
 const service=new GenerationService({assistantEnabled:true,providerConfigured:true,budgetMicros:100000,assistantAdapter:args=>assistCopy({...args,apiKey:'fixture',fetchImpl:async(_url,options)=>{
  calls++;const {messages,response_format}=JSON.parse(options.body);
  assert.equal(response_format.json_schema.name,'video_shot_directions');
  assert.equal(messages[1].content[1].image_url.url,photo);
  assert.deepEqual(JSON.parse(messages[1].content[0].text).sceneBoundariesSeconds,[0,3,7,10]);
  return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({opening:'설산 앞 코트를 전신 구도로 잡는다.',detail:'가슴 로고로 다가간다.',closing:'눈발을 배경으로 정지한다.'})}}],usage:{prompt_tokens:500,completion_tokens:100}});
 }})});t.after(()=>service.close());
 const first=await service.assist(request);
 assert.equal(first.shots.length,3);assert.deepEqual(await service.assist(request),JSON.parse(JSON.stringify(first)));assert.equal(calls,1);
 assert.ok(!JSON.stringify(first).includes(photo));assert.ok(service.ledger.budget(service.period()).spent_micros>0);
 await assert.rejects(service.assist({...request,references:['https://example.org/photo']}),/INVALID_ASSISTANT_REQUEST/);
});

test('manual video direction retains formatting and its own shot structure',()=>{
 const manualPrompt='  One continuous shot.\n\n천천히 다가간다.  ';
 const briefOnly={...input,brief:{...brief,title:'',description:''},manualPrompt};
 const {content,ratio,duration}=seedancePayload(briefOnly,'model');
 assert.ok(content[0].text.includes('\n'+manualPrompt+'\n'));
 assert.ok(!content[0].text.includes('Plan a clear opening'));
 assert.ok(!content[0].text.includes('owner-reviewed shot directions'));
 assert.deepEqual([ratio,duration],['9:16',15]);
 for(const bad of ['', ' \n ',null,42,'x'.repeat(8001)])assert.throws(()=>seedancePayload({...briefOnly,manualPrompt:bad},'model'),/INVALID_VIDEO/);
 assert.throws(()=>seedancePayload({...briefOnly,shots:['a','b','c']},'model'),/INVALID_VIDEO/);
 assert.throws(()=>seedancePayload({...briefOnly,brief:{...brief,kind:'product'}},'model'),/INVALID_VIDEO/);
});

test('reviewed captions keep full offer conditions and use the reviewed scene boundaries',()=>{
 const captions=sceneCaptions(brief,'');
 assert.deepEqual(captions,[brief.title,brief.description,brief.emphasis]);
 assert.deepEqual([0,2.99,3,6.99,7,10].map(t=>sceneCaptionAt(captions,t,10)),[captions[0],captions[0],captions[1],captions[1],captions[2],captions[2]]);
 assert.deepEqual(sceneCaptions(brief,'롱코트\n285,000원\n무료배송\n제주 추가 비용'),['롱코트','285,000원','무료배송\n제주 추가 비용']);
});

test('an owner-only prompt reaches the video provider verbatim without automatic copy or audio instructions',async()=>{
 const {higgsfieldInput}=await import('../server/higgsfield-video.mjs');
 const manualPrompt='  Keep one continuous shot.\n\n마지막 2초는 무음.  ';
 const fields={...input,manualPrompt,promptMode:'manual',promptPolicy:'owner-only'};
 const plan=seedancePayload(fields,'model');
 assert.equal(higgsfieldInput(plan,[]).body.prompt,manualPrompt);
 assert.deepEqual(plan.content,[{type:'text',text:manualPrompt}]);
 assert.throws(()=>seedancePayload({...fields,shots:['one','two','three']},'model'),/INVALID_VIDEO/);
 assert.throws(()=>seedancePayload({...input,promptMode:'auto',shots:['one','two','three'],promptPolicy:'owner-only'},'model'),/INVALID_VIDEO/);
});

test('a versioned plan returns editable audio with the three directions and charges a retry once',async t=>{
 const {assistCopy}=await import('../server/text-assistant.mjs');
 const audio={musicMood:'작은 타악기와 피아노',narration:'인천 물류센터에서 근무합니다.',recommendVoice:true};
 const request={kind:'video-prompt',planVersion:1,requestId:'full-video-plan-01',targetLocale:'ko',references:[],
   brief:{kind:'service',style:'presenter',ratio:'9:16',seconds:10,title:brief.title,description:brief.description,highlight:brief.emphasis,field:'',industry:'',caption:'',contact:'',music:true,voice:true,musicStyle:'',voiceStyle:'',narration:''}};
 let count=0;
 const service=new GenerationService({assistantEnabled:true,providerConfigured:true,budgetMicros:100000,assistantAdapter:args=>assistCopy({...args,apiKey:'fixture',fetchImpl:async(_url,opts)=>{
   count++;
   assert.equal(JSON.parse(opts.body).response_format.json_schema.name,'advertising_video_plan');
   return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({opening:'전경',detail:'가까이',closing:'정면',...audio})}}],usage:{prompt_tokens:300,completion_tokens:70}});
 }})});t.after(()=>service.close());
 const result=await service.assist(request);
 assert.deepEqual(result.shots,['전경','가까이','정면']);assert.deepEqual(result.audio,audio);
 assert.deepEqual((await service.assist(request)).audio,audio);assert.equal(count,1);
 await assert.rejects(service.assist({...request,planVersion:2}),/INVALID_ASSISTANT_REQUEST/);
});

test('a product plan requires a first-frame event and a distinct visible response in the actual WAN request',async()=>{
 const {assistCopy}=await import('../server/text-assistant.mjs');
 const {quotedVideoProvider}=await import('../server/quoted-video.mjs');
 const {productDirection}=await import('../src/video-product-direction.ts');
 const photo='data:image/jpeg;base64,/9j/2Q==';
 const latte={kind:'product',style:'product',ratio:'9:16',seconds:10,field:'',industry:'',title:'아이스라떼',description:'사진 속 유리잔',highlight:'',caption:'',contact:'',music:true,voice:false,musicStyle:'',voiceStyle:'',narration:''};
 assert.match(productDirection(latte,'ko')[0],/흰 우유/);
 const request={kind:'video-prompt',planVersion:2,requestId:'opening-beats-001',targetLocale:'ko',brief:latte,references:[photo]};
 const proposal={opening:'얼음과 흰 우유가 담긴 잔으로 에스프레소가 떨어진다.',reaction:'흰 표면에 첫 갈색 실선이 생긴다.',detail:'잔 옆면의 우유 층',closing:'완성된 한 잔',musicMood:'타악기',narration:'',recommendVoice:false};
 async function draft(answer){
  return assistCopy({request,apiKey:'fixture',fetchImpl:async(_url,options)=>{
   const schema=JSON.parse(options.body).response_format.json_schema;
   assert.ok(schema.schema.required.includes('reaction'));
   return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(answer)}}],usage:{prompt_tokens:250,completion_tokens:60}});
  }});
 }
 for(const reaction of ['',proposal.opening])await assert.rejects(draft({...proposal,reaction}),/PROVIDER_INVALID_RESPONSE/);
 const {shots}=await draft(proposal);
 const body={...input,seconds:10,brief:{...latte,emphasis:latte.highlight},references:[photo],shots,music:true,voice:false,narration:''};
 const wan=quotedVideoProvider('topview');
 const plan=seedancePayload(body,'wan');
 const payload=wan.input(wan.preparePlan(plan,body),['https://example.org/ref.jpg']);
 const prompt=payload.input.input.prompt;
 assert.ok(prompt.startsWith('FRAME 1'));
 assert.ok(prompt.indexOf(proposal.opening)<prompt.indexOf(proposal.reaction));
 assert.ok(prompt.indexOf(proposal.reaction)<prompt.indexOf(proposal.detail));
 assert.match(prompt,/0\.8초 이내/);
 assert.match(prompt,/No speech or vocals/);
 const old=quotedVideoProvider('topview','topview/alibaba/wan-3.0/cuts-v1');
 assert.ok(old.preparePlan(plan,body).content[0].text.startsWith('Render the three approved shots'));
});
