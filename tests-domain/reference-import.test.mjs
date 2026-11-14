import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {referenceAssets,withReferences} from '../src/model.ts';
import {importReferenceFiles} from '../src/reference-import.ts';
import {referenceBytes,maximumReferenceBytes} from '../src/reference-limits.ts';
import {buildGenerationRequest,generationIssues} from '../src/generation.ts';
import {GenerationService} from '../server/generation-service.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function photo(name,color,byteLength){
 const png=await sharp({create:{width:32,height:24,channels:4,background:color}}).png().toBuffer();
 const bytes=byteLength?Buffer.concat([png,Buffer.alloc(byteLength-png.length)]):png;
 const file=new File([bytes],name,{type:'image/png'});
 return {file,bytes,asset:{name,data:'data:image/png;base64,'+bytes.toString('base64'),width:32,height:24,sha256:hash(bytes)}};
}
function readers(t){
 const oldReader=globalThis.FileReader,oldImage=globalThis.Image;
 globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload();});}};
 globalThis.Image=class{async decode(){const meta=await sharp(Buffer.from(this.src.split(',')[1],'base64')).metadata();this.naturalWidth=meta.width;this.naturalHeight=meta.height;}};
 t.after(()=>{globalThis.FileReader=oldReader;globalThis.Image=oldImage;});
}
function campaign(p){p.productName='실제 상품';p.productProfile.material='제공한 실제 사진의 상품';return prepareCampaign(p);}

test('combined-size overflow keeps the first valid photo and later fitting files, then reaches generation with identical bytes',async t=>{
 readers(t);
 const front=await photo('front.png','#a66b37',6*1024*1024),side=await photo('side.png','#875e35',6*1024*1024),detail=await photo('detail.png','#413020');
 const original=starterProject('boxes');const imported=await importReferenceFiles(original,[front.file,side.file,detail.file]);
 assert.throws(()=>withReferences(original,[front.asset,side.asset]),/전체 용량/);
 assert.equal(imported.addedCount,2);assert.deepEqual(imported.issues.map(i=>[i.name,i.code]),[['side.png','total-size']]);
 assert.deepEqual(imported.assets.map(a=>a.sha256),[hash(front.bytes),hash(detail.bytes)]);assert.equal(original.product,null);
 const p=campaign(withReferences(original,imported.assets));assert.deepEqual(generationIssues(p),[]);
 assert.equal(p.product.data,front.asset.data);assert.equal(p.references[0].data,detail.asset.data);
 let supplied;
 const service=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:1_000_000,adapter:{generate:async args=>{supplied=args;throw Error('fixture-stop-after-source-validation');}}});t.after(()=>service.close());
 await service.create({projectId:p.id,requestId:crypto.randomUUID(),request:buildGenerationRequest(p),source:p.product,references:p.references});await service.waitForIdle();
 assert.deepEqual(supplied.source.bytes,front.bytes);assert.deepEqual(supplied.references[0].bytes,detail.bytes);
});
test('bad or oversized files do not cancel valid photos in the same selection',async t=>{
 readers(t);const valid=await photo('usable.png','#884422');
 const oversized=new File([Buffer.alloc(maximumReferenceBytes+1)],'too-big.png',{type:'image/png'});
 const broken=new File(['not a photo'],'broken.png',{type:'image/png'});
 const result=await importReferenceFiles(starterProject('boxes'),[oversized,broken,valid.file]);
 assert.equal(result.addedCount,1);assert.equal(result.assets[0].sha256,valid.asset.sha256);
 assert.deepEqual(result.issues.map(i=>i.code),['file-size','invalid']);
});
test('an exact 10MB source is accepted without counting base64 padding as image bytes',async t=>{
 readers(t);const limit=await photo('at-limit.png','#000000',maximumReferenceBytes);
 const result=await importReferenceFiles(starterProject('boxes'),[limit.file]);
 assert.equal(referenceBytes(result.assets),maximumReferenceBytes);assert.equal(result.addedCount,1);assert.deepEqual(result.issues,[]);
 assert.equal(withReferences(starterProject('boxes'),result.assets).product.sha256,hash(limit.bytes));
 for(const bytes of [1,2,3,4,5])assert.equal(referenceBytes([{data:'data:image/png;base64,'+Buffer.alloc(bytes).toString('base64')}]),bytes);
 const over={...limit.asset,data:'data:image/png;base64,'+Buffer.alloc(maximumReferenceBytes+1).toString('base64')};
 assert.throws(()=>withReferences(starterProject('boxes'),[over]),/전체 용량/);
});
test('existing photos, roles, source bytes and confirmed inputs survive failed additions in original mode',async t=>{
 readers(t);const existing=await photo('original.png','#bbaa99',8*1024*1024),large=await photo('excess.png','#998877',3*1024*1024),small=await photo('detail.png','#776655');
 let p=withReferences(starterProject('boxes'),[existing.asset]);p.generation.mode='original';p.referenceRoles={[existing.asset.sha256]:'subject'};p.copy.ko.title='확정 문구';p.dimensions.width='400';
 const result=await importReferenceFiles(p,[large.file,small.file]);const next=withReferences(p,result.assets);
 assert.equal(result.addedCount,1);assert.equal(result.issues[0].code,'total-size');
 assert.equal(next.product,p.product);assert.equal(next.product.data,existing.asset.data);assert.deepEqual(next.referenceRoles,p.referenceRoles);assert.deepEqual(next.copy,p.copy);assert.deepEqual(next.dimensions,p.dimensions);assert.equal(next.generation.mode,'original');
 assert.equal(referenceAssets(p).length,1);assert.equal(referenceAssets(next).length,2);
});
test('duplicates and count overflow preserve accepted photos instead of rolling back the batch',async()=>{
 const fixture=await photo('fixture.png','#111111');const files=Array.from({length:11},(_,i)=>new File([fixture.bytes],`image-${i}.png`,{type:'image/png'}));
 const read=async file=>({...fixture.asset,name:file.name,sha256:hash(file.name)});
 const result=await importReferenceFiles(starterProject('boxes'),files,read);
 assert.equal(result.assets.length,10);assert.equal(result.issues[0].code,'count');
 const deduped=await importReferenceFiles(starterProject('boxes'),[fixture.file,fixture.file],async()=>fixture.asset);
 assert.equal(deduped.assets.length,1);assert.equal(deduped.issues[0].code,'duplicate');
});
