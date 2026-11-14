import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {hashBytes} from '../server/openai-image-adapter.mjs';
import {prepareSelectiveEdit,compositeSelectiveEdit,inspectSelectivePixels,selectiveEditPrompt} from '../server/selective-image-edit.mjs';
import {verifiedPreservation,comparisonViewport} from '../src/selective-preservation.ts';
import {GenerationService} from '../server/generation-service.mjs';
const w=16,h=16;
async function fixture(){
 const raw=Buffer.alloc(w*h*4);for(let i=0;i<raw.length;i++)raw[i]=(i*31)%256;raw[3]=0;
 const source=await sharp(raw,{raw:{width:w,height:h,channels:4}}).png().toBuffer(),m=Buffer.alloc(raw.length,255);
 for(const [x,y] of [[2,3],[3,3],[2,4]])m[(y*w+x)*4+3]=0;
 const mask=await sharp(m,{raw:{width:w,height:h,channels:4}}).png().toBuffer(),generated=await sharp({create:{width:w,height:h,channels:4,background:'#ccaa33'}}).png().toBuffer();
 const prepared=await prepareSelectiveEdit({dataUrl:'data:image/png;base64,'+source.toString('base64'),sha256:hashBytes(source),width:w,height:h},{data:'data:image/png;base64,'+mask.toString('base64'),sha256:hashBytes(mask),width:w,height:h});
 return {raw,m,source,generated,prepared};
}
test('encoded image report binds actual source, mask, final output and counts without approving anatomy',async()=>{
 const {prepared,generated,raw}=await fixture(),r=await compositeSelectiveEdit(prepared.source,prepared.mask,{bytes:generated}),proof=r.preservation;
 assert.equal(proof.changedOutsidePixels,0);assert.equal(proof.selectedPixels,3);assert.equal(proof.changedSelectedPixels,3);assert.deepEqual(proof.bounds,{x:2,y:3,width:2,height:2});assert.equal(proof.semanticQuality,'not-assessed');
 assert.equal(proof.resultHash,hashBytes(r.bytes));assert.equal(proof.maskHash,prepared.mask.sha256);assert.equal(proof.sourceHash,prepared.source.sha256);
 assert.ok(verifiedPreservation(proof,{...proof}));const decoded=await sharp(r.bytes).ensureAlpha().raw().toBuffer();assert.deepEqual(decoded.subarray(0,4),raw.subarray(0,4));
});
test('one changed protected pixel, including hidden RGB, rejects the whole output',async()=>{
 const {raw,m}=await fixture();for(const channel of [0,1,2,3]){const changed=Buffer.from(raw);changed[channel]^=1;assert.throws(()=>inspectSelectivePixels(raw,m,changed,w,h),/EDIT_PRESERVATION_FAILED/);}
});
test('unexpected resize, empty/nonbinary mask and truncated pixels never yield proof',async()=>{
 const {raw,m}=await fixture();for(const [a,mask,b,width,height] of [[raw,m,raw,w-1,h],[raw,Buffer.alloc(m.length,255),raw,w,h],[raw,Buffer.alloc(m.length,128),raw,w,h],[raw,m,raw.subarray(4),w,h]])assert.throws(()=>inspectSelectivePixels(a,mask,b,width,height),/EDIT_PRESERVATION_FAILED/);
});
test('same pixels remain detectable even if encoding differs',async()=>{
 const {prepared,source}=await fixture(),r=await compositeSelectiveEdit(prepared.source,prepared.mask,{bytes:source});assert.equal(r.preservation.changedSelectedPixels,0);assert.equal(r.preservation.changedOutsidePixels,0);
});
test('stale source/mask/output identities and forged numerical claims cannot enable acceptance',async()=>{
 const {prepared,generated}=await fixture(),r=await compositeSelectiveEdit(prepared.source,prepared.mask,{bytes:generated}),proof=r.preservation;
 for(const update of [{sourceHash:'b'.repeat(64)},{maskHash:'b'.repeat(64)},{resultHash:'b'.repeat(64)},{changedOutsidePixels:1},{changedSelectedPixels:4},{changedSelectedPixels:-1},{width:941},{selectedPixels:0},{bounds:{x:-1,y:0,width:16,height:16}},{bounds:{x:15,y:0,width:2,height:16}},{semanticQuality:'passed'},{}]){
  const mutated={...proof,...update};if(Object.keys(update).length)assert.equal(verifiedPreservation(mutated,proof),null);
 }
 assert.equal(verifiedPreservation(undefined,proof),null);
});
test('full and enlarged comparisons use the same bounded source coordinates',()=>{
 assert.deepEqual(comparisonViewport(941,1672),{x:0,y:0,width:941,height:1672});
 const v=comparisonViewport(941,1672,{x:830,y:782,width:95,height:48});assert.ok(v.x<=830&&v.y<=782&&v.x+v.width>=925&&v.y+v.height>=830);assert.ok(v.x+v.width<=941&&v.y+v.height<=1672);
 assert.deepEqual(comparisonViewport(16,16,{x:0,y:0,width:1,height:1}),{x:0,y:0,width:16,height:16});
});
async function serviceFixture(t,{noChange=false,creditV2=false,unknownCost=false}={}){
 const source=await sharp({create:{width:16,height:16,channels:4,background:'blue'}}).png().toBuffer(),edited=noChange?source:await sharp({create:{width:16,height:16,channels:4,background:'red'}}).png().toBuffer(),hash=hashBytes(source);let calls=0;
 const asset={bytes:source,mime:'image/png',width:16,height:16,sha256:hash,role:'creative',composition:'complete-ad',model:'fixture',cost:{microUsd:100},usage:{}};
 const s=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:2000000,adapter:{selectiveEditReady:true,generate:async()=>asset,editRegion:async()=>{calls++;return {...asset,bytes:edited,sha256:hashBytes(edited),cost:unknownCost?null:{microUsd:100}};}}});t.after(()=>s.close());
 const request={version:1,mode:'creative',operation:'image-product-concept',subjectType:'physical-product',productName:'shoe',productProfile:{category:'other'},brief:'product only',source:{sha256:hash},references:[],copy:{},specifications:[],output:{format:'1:1',locale:'ko',compositionKey:'{}'}};
 const first=await s.create({requestId:randomUUID(),projectId:randomUUID(),request,source:{...asset,data:'data:image/png;base64,'+source.toString('base64')}});await s.waitForIdle();s.accept(first.job.id,hash);s.selectiveEditingEnabled=true;
 if(creditV2){const owner='aiadcast-next-local-developer';s.db.prepare('UPDATE wallets SET available=0 WHERE user_id=?').run(owner);s.db.prepare('INSERT INTO credit_wallets(user_id,available,reserved) VALUES(?,20,0) ON CONFLICT(user_id) DO UPDATE SET available=20,reserved=0').run(owner);}
 const m=Buffer.alloc(16*16*4,255);m[(4*16+5)*4+3]=0;const mb=await sharp(m,{raw:{width:16,height:16,channels:4}}).png().toBuffer();
 const body={requestId:randomUUID(),projectId:randomUUID(),sourceJobId:first.job.id,sourceHash:hash,prompt:'remove only the inside logo',mask:{data:'data:image/png;base64,'+mb.toString('base64'),width:16,height:16,sha256:hashBytes(mb)},creditQuote:s.creditQuote()};
 return {s,body,calls:()=>calls};
}
test('service persists proof across history, duplicate lookup and acceptance; original is immutable',async t=>{
 const {s,body,calls}=await serviceFixture(t),original=JSON.stringify(s.job(body.sourceJobId)),a=await s.createSelectiveEdit(body);await s.waitForIdle();const job=s.job(a.job.id);
 assert.equal(s.status().generation.selectiveEditProofVersion,1);assert.equal(job.preservation.sourceHash,body.sourceHash);assert.equal(job.preservation.maskHash,body.mask.sha256);assert.equal(job.preservation.resultHash,job.artifactId);assert.equal(job.preservation.changedSelectedPixels,1);
 assert.deepEqual(s.history(job.projectId).jobs[0].preservation,job.preservation);assert.deepEqual((await s.createSelectiveEdit(body)).job.preservation,job.preservation);
 assert.equal(s.accept(job.id,job.artifactId).job.state,'accepted');assert.equal(calls(),1);assert.equal(JSON.stringify(s.job(body.sourceJobId)),original);
});
for(const creditV2 of [false,true])test(`unchanged output releases customer reservation, records supplier spend and never auto-retries (${creditV2?'credit-v2':'legacy'})`,async t=>{
 const {s,body,calls}=await serviceFixture(t,{noChange:true,creditV2}),before=s.wallet(),a=await s.createSelectiveEdit(body);await s.waitForIdle();const job=s.job(a.job.id);
 assert.equal(job.state,'failed');assert.equal(job.errorCode,'EDIT_NO_CHANGE');assert.equal(job.artifact,null);assert.equal(job.creditCaptured,false);assert.deepEqual(s.wallet(),before);assert.equal(s.status().budget.spentMicros,200);assert.equal(s.status().budget.heldMicros,0);
 await s.createSelectiveEdit(body);assert.equal(calls(),1);assert.throws(()=>s.accept(job.id,job.artifactId),/EDIT_PRESERVATION_UNVERIFIED/);
});
test('missing usage stays uncertain with its cost hold even when no pixels changed',async t=>{
 const {s,body,calls}=await serviceFixture(t,{noChange:true,unknownCost:true}),a=await s.createSelectiveEdit(body);await s.waitForIdle();assert.equal(s.job(a.job.id).state,'uncertain');assert.equal(s.status().budget.heldMicros,500000);await s.createSelectiveEdit(body);assert.equal(calls(),1);
});
test('server rejects acceptance when persisted proof is missing or refers to a different result',async t=>{
 const {s,body}=await serviceFixture(t),a=await s.createSelectiveEdit(body);await s.waitForIdle();const job=s.job(a.job.id),metadata=JSON.parse(s.db.prepare('SELECT metadata_json FROM generation_records WHERE id=?').get(job.id).metadata_json);
 for(const proof of [undefined,{...metadata.preservation,resultHash:'f'.repeat(64)}]){s.db.prepare('UPDATE generation_records SET metadata_json=? WHERE id=?').run(JSON.stringify({...metadata,preservation:proof}),job.id);assert.throws(()=>s.accept(job.id,job.artifactId),/EDIT_PRESERVATION_UNVERIFIED/);assert.equal(s.job(job.id).state,'ready');}
});
test('local edit brief protects pose and keeps explicit customer instruction without promising quality',()=>{
 const p=selectiveEditPrompt('오른발 안쪽 마크만 제거');assert.ok(p.includes('오른발 안쪽 마크만 제거'));assert.ok(p.includes('must not move a foot'));assert.ok(p.includes('Do not mirror a logo'));assert.ok(p.includes('not a guarantee'));
});
