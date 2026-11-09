import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {GenerationService} from '../server/generation-service.mjs';
import {OpenAIImageAdapter,hashBytes,IMAGE_MODEL,validateImage} from '../server/openai-image-adapter.mjs';
import {prepareSelectiveProviderInput,selectiveEditForm} from '../server/selective-image-edit.mjs';

async function image(color,mime='image/png'){
 const raw=sharp({create:{width:8,height:8,channels:4,background:color}});
 const bytes=await (mime==='image/jpeg'?raw.jpeg():mime==='image/webp'?raw.webp():raw.png()).toBuffer();
 const meta=await validateImage(bytes,mime);
 return {...meta,bytes,data:`data:${mime};base64,${bytes.toString('base64')}`};
}
const photos=await Promise.all(Array.from({length:10},(_,i)=>image(`rgb(${i*20},30,60)`,i===1?'image/jpeg':i===2?'image/webp':'image/png')));
const ad=await image('#fefefe'),edited=await image('#abcdef'),mask=await image({r:0,g:0,b:0,alpha:0});
const output=a=>({...a,role:'creative',composition:'complete-ad',cost:{microUsd:100},usage:{},model:'mock'});
async function fixture(t,{count=3,designIndex=2}={}){
 const calls=[];
 const adapter={selectiveEditReady:true,generate:async()=>output(ad),editRegion:async input=>{calls.push(input);return output(calls.length%2?edited:ad);}};
 const s=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:2000000,adapter});
 s.adminTestUnlimited=true;t.after(()=>s.close());
 const refs=photos.slice(0,count),descriptor=(a,i)=>({sha256:a.sha256,width:a.width,height:a.height,purpose:i===designIndex?'style':'subject'});
 const request={version:1,mode:'creative',operation:'image-product-concept',subjectType:'physical-product',productName:'shoe',productProfile:{category:'other'},brief:'single unworn shoe',source:descriptor(refs[0],0),references:refs.slice(1).map((r,i)=>descriptor(r,i+1)),copy:{},specifications:[],output:{format:'1:1',locale:'ko',compositionKey:'{}'}};
 const created=await s.create({requestId:randomUUID(),projectId:randomUUID(),request,source:refs[0],references:refs.slice(1)});
 await s.waitForIdle();s.accept(created.job.id,ad.sha256);s.selectiveEditingEnabled=true;
 return {s,calls,body:{sourceJobId:created.job.id,sourceHash:ad.sha256,projectId:randomUUID(),requestId:randomUUID(),prompt:'Correct the outer shoe panel from its actual photos',mask}};
}
test('saved actual photographs accompany the ad; styling references do not become product evidence',async t=>{
 const {s,calls,body}=await fixture(t),before=JSON.stringify(s.job(body.sourceJobId));
 const edit=await s.createSelectiveEdit(body);await s.waitForIdle();
 assert.equal(calls.length,1);assert.equal(calls[0].source.sha256,ad.sha256);
 assert.deepEqual(calls[0].references.map(r=>r.sha256),photos.slice(0,2).map(r=>r.sha256));
 assert.deepEqual(calls[0].references.map(r=>r.bytes),photos.slice(0,2).map(r=>r.bytes));
 assert.equal(s.job(edit.job.id).selectiveEdit.productReferences.length,2);
 assert.equal(JSON.stringify(s.job(body.sourceJobId)),before);
});
test('all ten original product photos are retained, including after another selective edit',async t=>{
 const {s,calls,body}=await fixture(t,{count:10,designIndex:-1});
 const first=await s.createSelectiveEdit(body);await s.waitForIdle();s.accept(first.job.id,edited.sha256);
 const second=await s.createSelectiveEdit({...body,sourceJobId:first.job.id,sourceHash:edited.sha256,projectId:randomUUID(),requestId:randomUUID()});await s.waitForIdle();
 assert.equal(s.job(second.job.id).state,'ready');assert.equal(calls.length,2);
 assert.deepEqual(calls[1].references.map(r=>r.sha256),photos.map(r=>r.sha256));
 assert.equal(calls[1].source.sha256,edited.sha256);
});
test('a legacy edit recovers the actual photos from its tenant-scoped parent history',async t=>{
 const {s,calls,body}=await fixture(t);const first=await s.createSelectiveEdit(body);await s.waitForIdle();s.accept(first.job.id,edited.sha256);
 const row=s.db.prepare('SELECT request_json FROM generation_records WHERE id=?').get(first.job.id),request=JSON.parse(row.request_json);
 delete request.selectiveEdit.productReferences;s.db.prepare('UPDATE generation_records SET request_json=? WHERE id=?').run(JSON.stringify(request),first.job.id);
 await s.createSelectiveEdit({...body,sourceJobId:first.job.id,sourceHash:edited.sha256,projectId:randomUUID(),requestId:randomUUID()});await s.waitForIdle();
 assert.deepEqual(calls[1].references.map(r=>r.sha256),photos.slice(0,2).map(r=>r.sha256));
});
test('missing or corrupt product evidence fails before a reservation or provider request',async t=>{
 for(const corrupt of [false,true]){
  const {s,calls,body}=await fixture(t),before=s.status().budget;
  if(corrupt)s.db.prepare('UPDATE generation_assets SET bytes=? WHERE hash=?').run(Buffer.from('broken'),photos[0].sha256);
  else s.db.prepare('DELETE FROM generation_assets WHERE hash=?').run(photos[0].sha256);
  await assert.rejects(s.createSelectiveEdit(body),/INVALID_EDIT_SOURCE/);
  assert.deepEqual(s.status().budget,before);assert.equal(calls.length,0);assert.equal(s.selectiveRequestStatus(body.requestId,body.sourceJobId).jobId,null);
 }
});
test('edit clients cannot replace the server-derived reference list',async t=>{
 const {s,calls,body}=await fixture(t);
 for(const key of ['references','productReferences'])await assert.rejects(s.createSelectiveEdit({...body,[key]:[photos[9]]}),/INVALID_EDIT_REQUEST/);
 assert.equal(calls.length,0);
});
test('concurrent duplicate edits with references still have one request and one cost settlement',async t=>{
 const {s,calls,body}=await fixture(t);const [a,b]=await Promise.all([s.createSelectiveEdit(body),s.createSelectiveEdit({...body,projectId:randomUUID()})]);await s.waitForIdle();
 assert.equal(a.job.id,b.job.id);assert.equal(calls.length,1);assert.equal(s.status().budget.spentMicros,200);assert.equal(s.status().budget.heldMicros,0);
});
test('references never bypass the existing budget admission gate',async t=>{
 const {s,calls,body}=await fixture(t);s.budgetMicros=100;const before=s.status().budget;
 await assert.rejects(s.createSelectiveEdit(body),/BUDGET_NOT_AVAILABLE/);
 assert.deepEqual(s.status().budget,before);assert.equal(calls.length,0);
});
test('unknown usage with product references retains the hold and cannot dispatch again',async t=>{
 const {s,body}=await fixture(t);let calls=0;
 s.adapter.editRegion=async input=>{calls++;assert.equal(input.references.length,2);return {...output(edited),cost:null};};
 const first=await s.createSelectiveEdit(body);await s.waitForIdle();
 assert.equal(s.job(first.job.id).state,'uncertain');assert.equal(s.status().budget.heldMicros,500000);
 const retry=await s.createSelectiveEdit(body);assert.equal(retry.job.id,first.job.id);assert.equal(calls,1);
});
test('multipart sends the masked advertisement first and untouched PNG/JPEG/WebP photos afterward',async()=>{
 const p=await prepareSelectiveProviderInput({model:IMAGE_MODEL,source:ad,mask,references:photos.slice(0,3)});
 const form=selectiveEditForm({model:IMAGE_MODEL,...p,prompt:'Correct logo'}),files=form.getAll('image[]');
 assert.equal(files.length,4);assert.equal(form.has('image'),false);assert.equal(form.get('n'),'1');
 assert.deepEqual(Buffer.from(await files[0].arrayBuffer()),p.source.bytes);
 for(let i=0;i<3;i++){assert.deepEqual(Buffer.from(await files[i+1].arrayBuffer()),photos[i].bytes);assert.equal(files[i+1].type,photos[i].mime);}
 assert.deepEqual(Buffer.from(await form.get('mask').arrayBuffer()),p.mask.bytes);
 assert.match(form.get('prompt'),/Image 1 is the advertisement/);assert.match(form.get('prompt'),/Images 2 through 4/);assert.match(form.get('prompt'),/does not authorize adding a person/);
});
test('changed reference bytes, order or metadata invalidate preflight before transport',async()=>{
 const refs=photos.slice(0,2),p=await prepareSelectiveProviderInput({model:IMAGE_MODEL,source:ad,mask,references:refs});let calls=0;
 const adapter=new OpenAIImageAdapter({apiKey:'mock-only',fetchImpl:()=>{calls++;throw Error('network not expected');}});adapter.selectiveEditReady=true;
 for(const references of [[...refs].reverse(),[{...refs[0],bytes:Buffer.from('bad')},refs[1]],[{...refs[0],width:9},refs[1]],[]])await assert.rejects(adapter.editRegion({source:ad,mask,providerInput:p,references,prompt:'test'}),/INVALID_EDIT_REFERENCE/);
 assert.equal(calls,0);
});
test('invalid reference count, duplicate, hash, format, dimensions and absent bytes fail preflight',async()=>{
 for(const references of [null,[null],Array(11).fill(photos[0]),[photos[0],photos[0]],[{...photos[0],sha256:'0'.repeat(64)}],[{...photos[0],mime:'image/gif'}],[{...photos[0],width:9}],[{...photos[0],bytes:undefined}]])await assert.rejects(prepareSelectiveProviderInput({model:IMAGE_MODEL,source:ad,mask,references}),/INVALID_EDIT_REFERENCE/);
});
test('preflight snapshots product bytes and the in-flight transport cannot be changed through caller buffers',async()=>{
 const reference={...photos[0],bytes:Buffer.from(photos[0].bytes)},p=await prepareSelectiveProviderInput({model:IMAGE_MODEL,source:ad,mask,references:[reference]});
 reference.bytes[0]=0;assert.deepEqual(p.references[0].bytes,photos[0].bytes);
 let form,finish;const adapter=new OpenAIImageAdapter({apiKey:'mock-only',fetchImpl:async(_url,options)=>{form=options.body;return new Promise(resolve=>{finish=resolve;});}});adapter.selectiveEditReady=true;
 const pending=adapter.editRegion({source:ad,mask,providerInput:p,references:[photos[0]],prompt:'test'});
 const expected=Buffer.from(p.references[0].bytes);p.references[0].bytes[0]=0;
 assert.deepEqual(Buffer.from(await form.getAll('image[]')[1].arrayBuffer()),expected);
 const generated=await sharp({create:{width:1024,height:1024,channels:4,background:'red'}}).png().toBuffer();
 finish(new Response(JSON.stringify({data:[{b64_json:generated.toString('base64')}],usage:{input_tokens:2,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens:1}})));
 const result=await pending;assert.equal(result.width,8);assert.equal(result.cost.microUsd,43);
});
test('cloud reference resolution awaits tenant asset reads, including legacy ancestry',async()=>{
 const {GenerationService:Cloud}=await import('../server/cloud/generation-base.mjs');
 const parent={source:{sha256:photos[0].sha256},references:[{sha256:photos[1].sha256,purpose:'style'}]};
 const context={db:{prepare:()=>({get:async()=>({request_json:JSON.stringify(parent)})})},asset:async hash=>({...photos.find(p=>p.sha256===hash),dataUrl:photos.find(p=>p.sha256===hash).data})};
 const refs=await Cloud.prototype.selectiveProductReferences.call(context,{selectiveEdit:{sourceJobId:randomUUID()}},ad.sha256);
 assert.deepEqual(refs.map(r=>r.bytes),[photos[0].bytes]);
});
