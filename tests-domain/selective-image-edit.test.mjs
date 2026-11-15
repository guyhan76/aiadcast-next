import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import sharp from 'sharp';
import {GenerationService} from '../server/generation-service.mjs';import {hashBytes,ProviderFailure,OpenAIImageAdapter} from '../server/openai-image-adapter.mjs';
import {rasterizeEditRegion} from '../server/locate-edit-region.mjs';
import {prepareSelectiveEdit,compositeSelectiveEdit,selectiveEditForm} from '../server/selective-image-edit.mjs';
const bytes=await sharp({create:{width:8,height:8,channels:4,background:'#345678'}}).png().toBuffer(),sha=hashBytes(bytes);
const asset={width:8,height:8,sha256:sha,dataUrl:'data:image/png;base64,'+bytes.toString('base64')};
async function mask(alpha=0,width=8){const b=await sharp({create:{width,height:8,channels:4,background:{r:0,g:0,b:0,alpha}}}).png().toBuffer();return {width,height:8,sha256:hashBytes(b),data:'data:image/png;base64,'+b.toString('base64')};}
const editBytes=await sharp({create:{width:8,height:8,channels:4,background:'#aa7744'}}).png().toBuffer();
const result={bytes,width:8,height:8,mime:'image/png',sha256:sha,role:'creative',composition:'complete-ad',cost:{microUsd:100},usage:{},model:'mock'};
async function fixture(t,generated=result){let calls=0;const s=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:2000000,adapter:{selectiveEditReady:true,generate:async()=>generated,editRegion:async()=>{calls++;return {...result,bytes:editBytes,sha256:hashBytes(editBytes)};}}});t.after(()=>s.close());const request={version:1,mode:'creative',operation:'image-product-concept',subjectType:'physical-product',productName:'컵',productProfile:{category:'other'},brief:'test',source:{sha256:sha},references:[],copy:{},specifications:[],output:{format:'1:1',locale:'ko',compositionKey:'{}'}};const p=await s.create({requestId:randomUUID(),projectId:randomUUID(),request,source:{...asset,data:asset.dataUrl}});await s.waitForIdle();s.accept(p.job.id,generated.sha256);s.selectiveEditingEnabled=true;return {s,calls:()=>calls,body:{requestId:randomUUID(),projectId:randomUUID(),sourceJobId:p.job.id,sourceHash:generated.sha256,prompt:'배경을 파랗게',mask:await mask()}};}
test('binary alpha mask preserves every unselected RGBA byte including transparency',async()=>{const raw=Buffer.alloc(8*8*4);for(let i=0;i<raw.length;i++)raw[i]=(i*37)%256;const original=await sharp(raw,{raw:{width:8,height:8,channels:4}}).png().toBuffer();const mraw=Buffer.alloc(8*8*4,255);mraw[3]=0;const mb=await sharp(mraw,{raw:{width:8,height:8,channels:4}}).png().toBuffer();const p=await prepareSelectiveEdit({...asset,dataUrl:'data:image/png;base64,'+original.toString('base64'),sha256:hashBytes(original)},{data:'data:image/png;base64,'+mb.toString('base64'),width:8,height:8,sha256:hashBytes(mb)});const output=await compositeSelectiveEdit(p.source,p.mask,result);const decoded=await sharp(output.bytes).ensureAlpha().raw().toBuffer();assert.deepEqual(decoded.subarray(4),raw.subarray(4));assert.deepEqual(decoded.subarray(0,4),(await sharp(bytes).raw().toBuffer()).subarray(0,4));assert.equal(output.width,8);});
test('empty, nonbinary, wrong-size/hash, malformed masks reject before transport',async()=>{for(const m of [await mask(1),await mask(.5),await mask(0,7),{...await mask(),sha256:'0'.repeat(64)},{data:'https://evil.invalid'}])await assert.rejects(prepareSelectiveEdit(asset,m));});
test('form has correct mask alpha contract and no response_format/markup; unsupported model fails closed',async()=>{const b=await sharp({create:{width:1024,height:1024,channels:4,background:'blue'}}).png().toBuffer(),m=await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();const p=await prepareSelectiveEdit({dataUrl:'data:image/png;base64,'+b.toString('base64'),sha256:hashBytes(b),width:1024,height:1024},{data:'data:image/png;base64,'+m.toString('base64'),sha256:hashBytes(m),width:1024,height:1024});const f=selectiveEditForm({...p,model:'gpt-image-2.5-sunburst',prompt:'edit'});assert.equal(f.get('n'),'1');assert.equal(f.has('response_format'),false);assert.equal(f.has('markup'),false);assert.throws(()=>selectiveEditForm({...p,model:'gpt-image-2.5-sunburst',instruction:true,prompt:'edit'}),/EDIT_TARGET_UNCLEAR/);assert.equal(f.get('mask').type,'image/png');assert.throws(()=>selectiveEditForm({...p,model:'unknown'}));let n=0;await assert.rejects(new OpenAIImageAdapter({apiKey:'mock',fetchImpl:()=>n++}).editRegion(p),/REGION_EDIT_NOT_AVAILABLE/);assert.equal(n,0);});
test('copy and original are distinct, same ID idempotent, original bytes and record unchanged',async t=>{const {s,body,calls}=await fixture(t),before=JSON.stringify(s.job(body.sourceJobId));const a=await s.createSelectiveEdit(body);await s.waitForIdle();const b=await s.createSelectiveEdit(body);assert.equal(a.job.id,b.job.id);assert.equal(calls(),1);assert.notEqual(a.job.projectId,s.job(body.sourceJobId).projectId);assert.equal(JSON.stringify(s.job(body.sourceJobId)),before);assert.equal(s.job(a.job.id).selectiveEdit.sourceHash,sha);s.selectiveEditingEnabled=false;assert.equal(s.job(a.job.id).state,'ready');s.accept(a.job.id,s.job(a.job.id).artifactId);assert.equal(s.job(a.job.id).state,'accepted');});
test('foreign job, forged URL, same project and disabled gate never call provider',async t=>{const {s,body,calls}=await fixture(t);for(const change of [{sourceJobId:randomUUID()},{source:'https://evil.invalid'},{projectId:s.job(body.sourceJobId).projectId},{sourceHash:'0'.repeat(64)}])await assert.rejects(s.createSelectiveEdit({...body,...change}));s.selectiveEditingEnabled=false;await assert.rejects(s.createSelectiveEdit(body),/REGION_EDIT_NOT_AVAILABLE/);assert.equal(calls(),0);});
test('concurrent identical requests share one reservation/provider attempt',async t=>{const {s,body,calls}=await fixture(t);const [a,b]=await Promise.all([s.createSelectiveEdit(body),s.createSelectiveEdit(body)]);await s.waitForIdle();assert.equal(a.job.id,b.job.id);assert.equal(calls(),1);assert.equal(s.status().budget.spentMicros,200);});
test('released edits retain the supplier hold and dispatch again only for a fresh submission',async t=>{
 const {s,body}=await fixture(t);let calls=0;
 s.adapter.editRegion=async()=>{calls++;throw new ProviderFailure('PROVIDER_UNCERTAIN');};
 const a=await s.createSelectiveEdit(body);await s.waitForIdle();
 const failed=s.job(a.job.id);
 assert.equal(failed.state,'failed');assert.equal(failed.errorCode,'EDIT_NOT_DELIVERED');
 assert.equal(s.status().budget.heldMicros,500000);
 assert.equal((await s.createSelectiveEdit(body)).job.id,a.job.id);assert.equal(calls,1);
 const retry=await s.createSelectiveEdit({...body,requestId:randomUUID(),projectId:randomUUID()});await s.waitForIdle();
 assert.notEqual(retry.job.id,a.job.id);assert.equal(calls,2);
 assert.equal(s.status().budget.heldMicros,1000000);assert.equal(s.job(body.sourceJobId).state,'accepted');
});
test('budget admission blocks edit using same supplier wallet',async t=>{const {s,body,calls}=await fixture(t);s.budgetMicros=100;await assert.rejects(s.createSelectiveEdit(body),/BUDGET_NOT_AVAILABLE/);assert.equal(calls(),0);});
test('two tabs with different destination IDs deduplicate even after acceptance and recover same copy',async t=>{const {s,body,calls}=await fixture(t);const a=await s.createSelectiveEdit(body);await s.waitForIdle();s.accept(a.job.id,s.job(a.job.id).artifactId);const second={...body,projectId:randomUUID(),requestId:randomUUID()};const b=await s.createSelectiveEdit(second);assert.equal(a.job.id,b.job.id);assert.equal(calls(),1);assert.equal(s.selectiveRequestStatus(second.requestId,body.sourceJobId).projectId,a.job.projectId);await assert.rejects(s.createSelectiveEdit({...body,prompt:'different'}),/IDEMPOTENCY_CONFLICT/);});
test('real foreign tenant source and request key cannot be used',async t=>{const a=await fixture(t),b=await fixture(t);await assert.rejects(b.s.createSelectiveEdit({...b.body,sourceJobId:a.body.sourceJobId}),/JOB_NOT_FOUND/);const edit=await a.s.createSelectiveEdit(a.body);await a.s.waitForIdle();assert.equal(b.s.selectiveRequestStatus(a.body.requestId,a.body.sourceJobId).jobId,null);assert.throws(()=>b.s.job(edit.job.id),/JOB_NOT_FOUND/);assert.equal(b.calls(),0);});
test('all-history $100 includes old hold/spend and blocks extra edit without resetting monthly budget',async t=>{const {s,body,calls}=await fixture(t),owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';s.cloudUser=owner;s.adminTestUnlimited=true;s.ledger.budgetOwner=owner;s.ledger.budgetAdmin=true;s.db.prepare("INSERT INTO supplier_budget_policy VALUES(1,?,100000000,'all-history',0,?)").run(owner,Date.now()-1000);s.db.prepare('INSERT INTO budgets VALUES(?,?,?,?)').run('2026-10',100000000,99000000,499900);const before=s.status().budget;assert.equal(before.availableMicros,500000);const a=await s.createSelectiveEdit(body);await s.waitForIdle();assert.equal(calls(),1);assert.equal(s.status().budget.heldMicros,499900);assert.equal(s.status().budget.spentMicros,99000200);await assert.rejects(s.createSelectiveEdit({...body,requestId:randomUUID(),prompt:'other'}),/BUDGET_NOT_AVAILABLE/);assert.equal(calls(),1);assert.equal(s.job(a.job.id).state,'ready');});
test('known provider failure and missing usage preserve respective failure/uncertain policies',async t=>{for(const uncertain of [false,true]){const {s,body}=await fixture(t);s.adapter.editRegion=async()=>{if(!uncertain)throw new ProviderFailure('PROVIDER_HTTP',{uncertain:false});return {...result,cost:null};};const a=await s.createSelectiveEdit(body);await s.waitForIdle();assert.equal(s.job(a.job.id).state,'failed');assert.equal(s.job(a.job.id).errorCode,uncertain?'EDIT_NOT_DELIVERED':'PROVIDER_HTTP');assert.equal(s.status().budget.heldMicros,uncertain?500000:0);assert.equal(s.wallet().reserved,0);}});
for(const count of [1,2,4,6,8,10])test(`selected immutable item in ${count}-result mock collection preserves all originals after reorder`,async t=>{
 const {s,body,calls}=await fixture(t);s.adminTestUnlimited=true;
 const request=JSON.parse(s.db.prepare('SELECT request_json FROM generation_records WHERE id=?').get(body.sourceJobId).request_json),projectId=randomUUID(),ids=[];
 for(let i=0;i<count;i++){const r=await s.create({requestId:randomUUID(),projectId,request:{...request,brief:`collection item ${i}`},source:{...asset,data:asset.dataUrl}});await s.waitForIdle();s.accept(r.job.id,sha);ids.push(r.job.id);}
 const selected=ids[Math.floor(count/2)],before=ids.map(id=>JSON.stringify(s.job(id))),displayOrder=[...ids].reverse();
 const edited=await s.createSelectiveEdit({...body,sourceJobId:selected});await s.waitForIdle();
 assert.equal(calls(),1);assert.equal(s.job(edited.job.id).selectiveEdit.sourceJobId,selected);assert.equal(s.job(edited.job.id).selectiveEdit.sourceProjectId,projectId);assert.equal(s.job(edited.job.id).selectiveEdit.sourceHash,sha);
 assert.deepEqual(ids.map(id=>JSON.stringify(s.job(id))),before);assert.equal(displayOrder.includes(selected),true);
 assert.equal(s.selectiveRequestStatus(body.requestId,selected).jobId,edited.job.id);
 if(count>1)assert.throws(()=>s.selectiveRequestStatus(body.requestId,ids.find(id=>id!==selected)),/REQUEST_PROJECT_MISMATCH/);
});
test('local edited copy round-trip retains immutable parent identity and rejects malformed parent',async()=>{
 const {starterProject,prepareCampaign}=await import('../src/consumer-campaign.ts'),{generatedCompatibilityKey,parseGenerated}=await import('../src/generated.ts'),{completeAdKey}=await import('../src/complete-ad.ts');
 let p=starterProject('other');p.product={name:'product.png',data:asset.dataUrl,sha256:sha,width:8,height:8};p=prepareCampaign(p);
 const parent={jobId:randomUUID(),projectId:randomUUID(),artifactId:sha},value={editParent:parent,jobId:randomUUID(),mode:'creative',sourceHash:sha,asset:p.product,role:'creative',model:'mock',createdAt:new Date().toISOString(),specificationKey:generatedCompatibilityKey(p),composition:'complete-ad',compositionKey:completeAdKey(p)};
 const restored=await parseGenerated(value,async a=>a);assert.deepEqual(restored.editParent,parent);await assert.rejects(parseGenerated({...value,editParent:{...parent,artifactId:'invalid'}},async a=>a),/INVALID_EDIT_PARENT/);
});
test('wrong provider output dimensions never become a ready copy or release unknown supplier hold',async t=>{const {s,body}=await fixture(t);const wrong=await sharp({create:{width:9,height:8,channels:4,background:'red'}}).png().toBuffer();s.adapter.editRegion=async()=>({...result,bytes:wrong});const original=JSON.stringify(s.job(body.sourceJobId));const r=await s.createSelectiveEdit(body);await s.waitForIdle();assert.equal(s.job(r.job.id).state,'failed');assert.equal(s.job(r.job.id).artifact,null);assert.equal(s.status().budget.heldMicros,500000);assert.equal(JSON.stringify(s.job(body.sourceJobId)),original);});
test('2.6 standard-size edit transport contract and usage estimate use mocked fetch only',async()=>{
 const b=await sharp({create:{width:1024,height:1024,channels:4,background:'blue'}}).png().toBuffer(),m=await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();const p=await prepareSelectiveEdit({dataUrl:'data:image/png;base64,'+b.toString('base64'),sha256:hashBytes(b),width:1024,height:1024},{data:'data:image/png;base64,'+m.toString('base64'),sha256:hashBytes(m),width:1024,height:1024});let calls=0,usage={input_tokens:30,input_tokens_details:{text_tokens:10,image_tokens:20,cached_tokens:15},output_tokens:30};
 const adapter=new OpenAIImageAdapter({apiKey:'local-fixture-only',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');assert.equal(options.body.get('model'),'gpt-image-2.6-sunburst');assert.equal(options.body.get('size'),'1024x1024');assert.equal(options.body.get('quality'),'high');assert.equal(options.body.get('n'),'1');for(const k of ['response_format','markup','stream'])assert.equal(options.body.has(k),false);assert.equal(options.body.get('output_format'),'png');assert.deepEqual(Buffer.from(await options.body.get('image').arrayBuffer()),p.source.bytes);assert.deepEqual(Buffer.from(await options.body.get('mask').arrayBuffer()),p.mask.bytes);return new Response(JSON.stringify({data:[{b64_json:b.toString('base64')}],usage}),{headers:{'content-type':'application/json'}});}});
 await assert.rejects(adapter.editRegion({...p,prompt:'edit',attemptId:'mock'}),/REGION_EDIT_NOT_AVAILABLE/);assert.equal(calls,0);adapter.selectiveEditReady=true;adapter.validateSelectiveInput(p);assert.throws(()=>adapter.validateSelectiveInput({...p,mask:{...p.mask,bytes:Buffer.alloc(4_000_000)}}),/INVALID_EDIT_MASK/);const r=await adapter.editRegion({...p,prompt:'edit',attemptId:'mock'});assert.equal(calls,1);assert.equal(r.cost.microUsd,1110);usage=undefined;assert.equal((await adapter.editRegion({...p,prompt:'edit',attemptId:'mock2'})).cost,null);
 const small=await prepareSelectiveEdit(asset,await mask());adapter.validateSelectiveInput(small);assert.throws(()=>adapter.validateSelectiveInput({...small,source:{...small.source,width:1600}}),/INVALID_EDIT_MASK/);assert.throws(()=>selectiveEditForm({...small,model:'gpt-image-2.6-sunburst',prompt:'edit'}),/UNSUPPORTED_EDIT_SIZE/);assert.equal(calls,2);
});
test('real-adapter size validation rejects before reservation and dispatch without resizing',async t=>{const oversized=await sharp({create:{width:1600,height:8,channels:4,background:'blue'}}).png().toBuffer();const {s,body,calls}=await fixture(t,{...result,bytes:oversized,width:1600,sha256:hashBytes(oversized)}),adapter=new OpenAIImageAdapter();body.mask=await mask(0,1600);s.adapter.validateSelectiveInput=p=>adapter.validateSelectiveInput(p);s.adapter.prepareSelectiveInput=p=>adapter.prepareSelectiveInput(p);const before=s.status().budget;await assert.rejects(s.createSelectiveEdit(body),/UNSUPPORTED_EDIT_SIZE/);assert.deepEqual(s.status().budget,before);assert.equal(calls(),0);assert.equal(s.selectiveRequestStatus(body.requestId,body.sourceJobId).jobId,null);});
test('large ROI uses normal source ownership and one ledger attempt for concurrent duplicate IDs',async t=>{
 const width=1080,height=1920,raw=Buffer.alloc(width*height*4,123),original=await sharp(raw,{raw:{width,height,channels:4}}).png().toBuffer();
 const {s,body}=await fixture(t,{...result,bytes:original,width,height,sha256:hashBytes(original)}),before=JSON.stringify(s.job(body.sourceJobId));
 const mr=Buffer.alloc(raw.length,255),point=(1800*width+1000)*4;mr[point+3]=0;const mb=await sharp(mr,{raw:{width,height,channels:4}}).png().toBuffer();body.mask={width,height,sha256:hashBytes(mb),data:'data:image/png;base64,'+mb.toString('base64')};
 let calls=0;const generated=await sharp({create:{width:1024,height:1024,channels:4,background:'red'}}).png().toBuffer();
 const adapter=new OpenAIImageAdapter({apiKey:'mock',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({data:[{b64_json:generated.toString('base64')}],usage:{input_tokens:1,input_tokens_details:{text_tokens:1,image_tokens:0},output_tokens:1}}));}});adapter.selectiveEditReady=true;
 s.adapter=adapter;const [a,b]=await Promise.all([s.createSelectiveEdit(body),s.createSelectiveEdit({...body,projectId:randomUUID()})]);assert.equal(a.job.id,b.job.id);await s.waitForIdle();const job=s.job(a.job.id);assert.equal(job.state,'ready');assert.equal(calls,1);assert.equal(JSON.stringify(s.job(body.sourceJobId)),before);
 const output=await sharp(Buffer.from(job.artifact.dataUrl.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();assert.deepEqual(output.subarray(0,point),raw.subarray(0,point));assert.deepEqual(output.subarray(point+4),raw.subarray(point+4));assert.notDeepEqual(output.subarray(point,point+4),raw.subarray(point,point+4));
});

test('uploaded pixels and mask use one reservation and preserve the original size',async t=>{
 const {s,body,calls}=await fixture(t);
 const original={...asset},request={original,sourceHash:original.sha256,prompt:'Change the sky',mask:body.mask,requestId:randomUUID(),projectId:randomUUID(),creditQuote:s.creditQuote()};
 const before=calls();
 await assert.rejects(s.createUploadedEdit({...request,sourceHash:'f'.repeat(64)}),/INVALID_EDIT_SOURCE/);
 await assert.rejects(s.createUploadedEdit({...request,mask:await mask(1)}),/EMPTY_EDIT_MASK/);
 assert.equal(calls(),before);
 const first=await s.createUploadedEdit(request);await s.waitForIdle();
 const second=await s.createUploadedEdit(request);
 assert.equal(second.job.id,first.job.id);assert.equal(calls(),before+1);
 const job=s.job(first.job.id);
 assert.equal(job.state,'ready');assert.equal(job.preservation.changedOutsidePixels,0);
 assert.equal(job.selectiveEdit.sourceJobId,'upload-'+original.sha256);
 assert.equal(s.accept(job.id,job.artifactId).job.state,'accepted');
});

test('a text edit locates disjoint regions, masks the provider and preserves every protected pixel in a tall ad',async()=>{
 const width=1080,height=1920;
 const original=await sharp({create:{width,height,channels:4,background:'#276485'}}).png().toBuffer();
 const input=await prepareSelectiveEdit({width,height,sha256:hashBytes(original),dataUrl:'data:image/png;base64,'+original.toString('base64')},{mode:'instruction'});
 const box=(l,t,r,b)=>[[l,t],[r,t],[r,b],[l,b]];
 const proposal={located:true,edit:[box(0,0,1000,590),box(285,740,525,795)],protect:[box(150,80,250,190)]};
 const calls=[];
 const adapter=new OpenAIImageAdapter({apiKey:'test-only',enableEdits:true,fetchImpl:async(url,options)=>{
  calls.push(url);
  if(url.endsWith('/chat/completions')){
   const body=JSON.parse(options.body);assert.equal(body.response_format.json_schema.strict,true);
   assert.match(body.messages[1].content[0].text,/599,000원/);
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(proposal)}}],usage:{prompt_tokens:100,completion_tokens:60}});
  }
  assert.equal(url,'https://api.openai.com/v1/images/edits');assert.ok(options.body.get('mask'));
  const [w,h]=options.body.get('size').split('x').map(Number);
  const changed=await sharp({create:{width:w,height:h,channels:4,background:'red'}}).png().toBuffer();
  return Response.json({data:[{b64_json:changed.toString('base64')}],usage:{input_tokens:2,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens:1}});
 }});
 const result=await adapter.editRegion({...input,prompt:'가격은 599,000원, 하늘은 화창하게',attemptId:'text-edit-test'});
 const final=await compositeSelectiveEdit(input.source,input.mask,result);
 assert.equal(calls.length,2);assert.equal(result.cost.microUsd,388);assert.equal(final.preservation.maskHash,result.locatedMask.sha256);
 assert.notEqual(final.preservation.maskHash,input.mask.sha256);assert.equal(final.preservation.changedOutsidePixels,0);
 const rgba=await sharp(final.bytes).ensureAlpha().raw().toBuffer(),before=await sharp(original).ensureAlpha().raw().toBuffer();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const nx=(x+.5)*1000/width,ny=(y+.5)*1000/height,offset=(y*width+x)*4;
  const editable=ny<590&&!(nx>=150&&nx<250&&ny>=80&&ny<190)||nx>=285&&nx<525&&ny>=740&&ny<795;
  if(!editable&&rgba.readUInt32BE(offset)!==before.readUInt32BE(offset))assert.fail('Protected pixel changed');
 }
 assert.ok(final.preservation.changedSelectedPixels>0);
 await assert.rejects(compositeSelectiveEdit(input.source,input.mask,{...result,locatedMask:null}),/EDIT_PRESERVATION_FAILED/);
});
test('ambiguous or whole-canvas proposals never dispatch image editing; supplier localization cost is retained',async t=>{
 for(const proposal of [{located:false,edit:[],protect:[]},{located:true,edit:[[[0,0],[1000,0],[1000,1000],[0,1000]]],protect:[]}]){
  const {s,body}=await fixture(t);let calls=0;
  s.adapter=new OpenAIImageAdapter({apiKey:'mock',enableEdits:true,fetchImpl:async url=>{
   calls++;assert.ok(url.endsWith('/chat/completions'));
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(proposal)}}],usage:{prompt_tokens:100,completion_tokens:60}});
  }});
  const before=s.status().budget.spentMicros;
  const a=await s.createSelectiveEdit({...body,mask:{mode:'instruction'}});await s.waitForIdle();
  const job=s.job(a.job.id);assert.equal(job.errorCode,'EDIT_TARGET_UNCLEAR');assert.equal(calls,1);
  assert.equal(s.status().budget.spentMicros-before,345);assert.equal(job.creditCaptured,false);
 }
});
test('ready and accepted receipts bind to the resolved mask and keep a stable request identity on retry',async t=>{
 const {s,body}=await fixture(t);
 const locatedMask=await rasterizeEditRegion({located:true,edit:[[[0,500],[1000,500],[1000,1000],[0,1000]]],protect:[]},8,8);
 let calls=0;
 s.adapter.editRegion=async()=>{calls++;return {...result,bytes:editBytes,locatedMask};};
 const request={...body,mask:{mode:'instruction'}},first=await s.createSelectiveEdit(request);
 await s.waitForIdle();
 const ready=s.job(first.job.id);
 assert.equal(ready.state,'ready');assert.equal(ready.selectiveEdit.maskHash,locatedMask.sha256);
 assert.equal(ready.preservation.selectedPixels,32);assert.equal(ready.preservation.changedOutsidePixels,0);
 const accepted=s.accept(ready.id,ready.artifactId).job;assert.equal(accepted.state,'accepted');
 assert.equal(accepted.preservation.requestMaskHash,first.job.selectiveEdit.maskHash);
 assert.equal((await s.createSelectiveEdit(request)).job.id,ready.id);assert.equal(calls,1);
});

const characterInstructions=[
 '모든 배경과 글씨는 그대로 하고 캐릭터를 3D 애니메이션 다른 캐릭터로 변경해줘.',
 '모든 배경과 글씨는 그대로 하고 우측 남자 캐릭터를 3D 애니메이션 다른 남자 캐릭터로 변경해줘.'
];
for(const prompt of characterInstructions)test('character outline recovered in crop coordinates: '+prompt,async()=>{
 const width=80,height=64;
 const source=await sharp({create:{width,height,channels:4,background:'#34778e'}}).png().toBuffer();
 const input=await prepareSelectiveEdit({width,height,sha256:hashBytes(source),dataUrl:'data:image/png;base64,'+source.toString('base64')},{mode:'instruction'});
 const stages=[];
 const adapter=new OpenAIImageAdapter({apiKey:'test',enableEdits:true,fetchImpl:async(url,options)=>{
  if(url.endsWith('/chat/completions')){
   const body=JSON.parse(options.body),stage=body.response_format.json_schema.name;
   stages.push(stage);
   assert.equal(JSON.parse(body.messages[1].content[0].text).requestedChange,prompt);
   const proposal=stage==='ad_edit_region'?{located:false,edit:[],protect:[]}:
    stage==='locate_subject'?{identified:true,left:500,top:250,right:900,bottom:950}:
    {located:true,edit:[[[80,110],[750,80],[910,900],[300,960]]],protect:[[[400,420],[650,420],[650,650],[400,650]]]};
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(proposal)}}],usage:{prompt_tokens:100,completion_tokens:60}});
  }
  assert.equal(url,'https://api.openai.com/v1/images/edits');stages.push('image');
  assert.match(options.body.get('prompt'),/different face/);
  const changed=await sharp({create:{width:1024,height:1024,channels:4,background:'red'}}).png().toBuffer();
  return Response.json({data:[{b64_json:changed.toString('base64')}],usage:{input_tokens:2,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens:1}});
 }});
 const result=await adapter.editRegion({...input,prompt,attemptId:'person-test'});
 const final=await compositeSelectiveEdit(input.source,input.mask,result);
 assert.deepEqual(stages,['ad_edit_region','locate_subject','trace_subject','image']);
 assert.equal(result.cost.localizationMicros,3*345);
 assert.equal(final.preservation.changedOutsidePixels,0);
 assert.ok(final.preservation.changedSelectedPixels>0);
 const actual=await sharp(final.bytes).ensureAlpha().raw().toBuffer();
 const expected=await sharp(source).ensureAlpha().raw().toBuffer();
 const pixel=(data,x,y)=>data.readUInt32BE((y*width+x)*4);
 assert.equal(pixel(actual,13,35),pixel(expected,13,35),'outside the person, on the left');
 assert.equal(pixel(actual,57,38),pixel(expected,57,38),'protected object in front of the figure');
 assert.notEqual(pixel(actual,55,48),pixel(expected,55,48),'inside the figure');
});
test('a missing person or a full-crop rectangle never dispatches an image edit; all location costs settle',async()=>{
 for(const identified of [false,true]){
  let calls=0;
  const adapter=new OpenAIImageAdapter({apiKey:'test',enableEdits:true,fetchImpl:async url=>{
   assert.ok(url.endsWith('/chat/completions'));calls++;
   const proposal=calls===1?{located:false,edit:[],protect:[]}:calls===2?{identified,left:450,top:150,right:900,bottom:900}:
    {located:true,edit:[[[0,0],[1000,0],[1000,1000],[0,1000]]],protect:[]};
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(proposal)}}],usage:{prompt_tokens:100,completion_tokens:60}});
  }});
  const input=await prepareSelectiveEdit(asset,{mode:'instruction'});
  await assert.rejects(adapter.editRegion({...input,prompt:characterInstructions[0],attemptId:'unclear'}),e=>e.code==='EDIT_TARGET_UNCLEAR'&&e.knownCostMicros===(identified?3:2)*345);
  assert.equal(calls,identified?3:2);
 }
});

const posePrompt='우측 남자 캐릭터를 다른 얼굴과 포즈의 남자 캐릭터로 변경해줘. 캐릭터는 3D애니메이션으로 부탁하고 우측 상단의 한국NCS자격개발원을 없애고 셀업랩스로 변경 부탁해';
for(const defect of [null,'previousGestureResolved','allOtherRequestedEditsCorrect'])test('pose and company name: verify final composite before delivery / '+(defect||'deliver'),async t=>{
 const {s}=await fixture(t);
 const stages=[];
 const rect=(l,t,r,b)=>[[l,t],[r,t],[r,b],[l,b]];
 const body=rect(600,300,800,900),logo=rect(820,0,990,90),oldHand=rect(500,205,610,320);
 const width=100,height=100;
 const original=await sharp({create:{width,height,channels:4,background:'#345678'}}).png().toBuffer();
 const hash=hashBytes(original);
 const before=s.status().budget.spentMicros;
 let inspected;
 s.adapter=new OpenAIImageAdapter({apiKey:'test',enableEdits:true,fetchImpl:async(url,options)=>{
  if(url.endsWith('/images/edits')){
   stages.push('image');
   assert.match(options.body.get('prompt'),/erase the entire vacated gesture/);
   const maskBytes=Buffer.from(await options.body.get('mask').arrayBuffer());
   const raw=await sharp(maskBytes).ensureAlpha().raw().toBuffer();
   const alpha=(x,y)=>raw[((y+462)*1024+x+462)*4+3];
   assert.equal(alpha(55,25),0,'old hand must be editable even when the body outline missed it');
   assert.equal(alpha(90,5),0,'separate name replacement');
   assert.equal(alpha(75,12),255,'drone between name and body stays protected');
   const png=await sharp({create:{width:1024,height:1024,channels:4,background:'red'}}).png().toBuffer();
   return Response.json({data:[{b64_json:png.toString('base64')}],usage:{input_tokens:2,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens:1}});
  }
  const payload=JSON.parse(options.body),stage=payload.response_format.json_schema.name;
  const images=payload.messages[1].content.filter(part=>part.type==='image_url').map(part=>Buffer.from(part.image_url.url.split(',')[1],'base64'));
  stages.push(stage);
  let answer;
  if(stage==='ad_edit_region')answer={located:true,changesPose:true,edit:[body,logo],protect:[]};
  else if(stage==='audit_pose_mask'){
   assert.equal(images.length,2);
   const overlay=await sharp(images[1]).removeAlpha().raw().toBuffer();
   const rgb=(x,y)=>[...overlay.subarray((y*width+x)*3,(y*width+x)*3+3)];
   assert.deepEqual(rgb(55,25),[52,86,120]);
   assert.notDeepEqual(rgb(70,50),rgb(55,25));
   answer={complete:true,add:[oldHand],protect:[]};
  }else{
   assert.equal(stage,'review_composited_pose');
   assert.equal(images.length,2);
   inspected=await sharp(images[1]).ensureAlpha().raw().toBuffer();
   const rgb=(x,y)=>[...inspected.subarray((y*width+x)*4,(y*width+x)*4+3)];
   assert.deepEqual(rgb(55,25),[255,0,0]);
   assert.deepEqual(rgb(90,5),[255,0,0]);
   assert.deepEqual(rgb(75,12),[52,86,120]);
   assert.deepEqual(rgb(20,70),[52,86,120]);
   answer={poseMatchesRequest:true,coherentLimbs:true,previousGestureResolved:true,allOtherRequestedEditsCorrect:true,unrelatedContentPreserved:true};
   if(defect)answer[defect]=false;
  }
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:60}});
 }});
 const made=await s.createUploadedEdit({requestId:randomUUID(),projectId:randomUUID(),creditQuote:s.creditQuote(),sourceHash:hash,prompt:posePrompt,mask:{mode:'instruction'},original:{sha256:hash,width,height,dataUrl:'data:image/png;base64,'+original.toString('base64')}});
 await s.waitForIdle();
 const job=s.job(made.job.id);
 assert.deepEqual(stages,['ad_edit_region','audit_pose_mask','image','review_composited_pose']);
 assert.equal(s.status().budget.spentMicros-before,3*345+43);
 if(defect){
  assert.equal(job.state,'failed');assert.equal(job.errorCode,'EDIT_POSE_QUALITY_FAILED');
  assert.ok(!job.artifactId);assert.equal(job.creditCaptured,false);assert.equal(s.wallet().reserved,0);
 }else{
  assert.equal(job.state,'ready');assert.equal(job.preservation.changedOutsidePixels,0);
  const delivered=await sharp(Buffer.from(job.artifact.dataUrl.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();
  assert.deepEqual(delivered,inspected);
  const metadata=JSON.parse(s.db.prepare('SELECT metadata_json FROM generation_records WHERE id=?').get(job.id).metadata_json);
  assert.equal(metadata.poseReview.resultHash,job.artifactId);
 }
});

const stormPrompt='오른쪽 남자 캐릭터를 다른 포즈의 얼굴이 다른 캐릭터로 교체해 주세요.\n캐릭터는 3D 애니메이션을 적용해주세요. 날씨는 먹구름이 가득한 날씨로 변경해 주세요.';
for(const direct of [false,true])test('person and storm sky reach the image editor and final review / '+(direct?'selected on original':'automatic'),async t=>{
 const {s}=await fixture(t);
 const stages=[];
 const person=[500,250,750,900],sky=[0,0,1000,500],drone=[750,0,1000,250];
 s.adapter=new OpenAIImageAdapter({apiKey:'test',enableEdits:true,fetchImpl:async(url,options)=>{
  if(url.endsWith('/images/edits')){
   stages.push('image');
   assert.ok(options.body.get('prompt').includes(stormPrompt));
   const raw=await sharp(Buffer.from(await options.body.get('mask').arrayBuffer())).ensureAlpha().raw().toBuffer();
   const alpha=(x,y)=>raw[((y+508)*1024+x+508)*4+3];
   assert.equal(alpha(4,3),0,'arm over sky survives the sky-only protection');
   assert.equal(alpha(2,1),0,'clear sky can change to overcast');
   assert.equal(alpha(7,0),255,'foreground drone');
   assert.equal(alpha(0,7),255,'price under the skyline');
   const changed=await sharp({create:{width:1024,height:1024,channels:4,background:'red'}}).png().toBuffer();
   return Response.json({data:[{b64_json:changed.toString('base64')}],usage:{input_tokens:2,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens:1}});
  }
  const request=JSON.parse(options.body),stage=request.response_format.json_schema.name;
  stages.push(stage);
  let answer;
  if(stage==='locate_person_areas')answer={edit:[person],protect:[]};
  else if(stage==='locate_sky_areas')answer={edit:[sky],protect:[person,drone]};
  else{
   assert.equal(stage,'review_composited_pose');
   assert.match(request.messages[0].content,/weather/);
   answer={poseMatchesRequest:true,coherentLimbs:true,previousGestureResolved:true,allOtherRequestedEditsCorrect:true,unrelatedContentPreserved:true};
  }
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:60}});
 }});
 const request={original:asset,sourceHash:sha,prompt:stormPrompt,mask:direct?{mode:'regions',regions:[person,[0,0,750,500]]}:{mode:'instruction'},requestId:randomUUID(),projectId:randomUUID(),creditQuote:s.creditQuote()};
 const made=await s.createUploadedEdit(request);await s.waitForIdle();
 assert.deepEqual(stages,direct?['image','review_composited_pose']:['locate_person_areas','locate_sky_areas','image','review_composited_pose']);
 const job=s.job(made.job.id);assert.equal(job.state,'ready');assert.equal(job.preservation.changedOutsidePixels,0);
 assert.equal((await s.createUploadedEdit(request)).job.id,job.id);
});
test('explicit selections reject empty, invalid and full-frame masks',async()=>{
 for(const regions of [[],[[900,100,100,600]],[[0,0,500,1000],[500,0,1000,1000]],[[0,0,2000,500]]]){
  await assert.rejects(prepareSelectiveEdit(asset,{mode:'regions',regions}),/INVALID_EDIT_MASK/);
 }
});
