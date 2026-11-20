import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {withReferences,importProject} from '../src/model.ts';
import {photoRole,withPhotoRole,parsePhotoRoles,needsPhotoPurposeServer} from '../src/photo-roles.ts';
import {buildGenerationRequest,generationIssues} from '../src/generation.ts';
import {generatedCompatibilityKey,hasUsableCreative,hasUsableOriginal,projectWithGenerated,visualAsset} from '../src/generated.ts';
import {withCreative} from '../src/creative.ts';
import {assessReference} from '../src/specification.ts';
import {GenerationService,normalizeGenerationRequest} from '../server/generation-service.mjs';
import {OpenAIImageAdapter,hashBytes,promptFor} from '../server/openai-image-adapter.mjs';

async function asset(color){const bytes=await sharp({create:{width:32,height:24,channels:4,background:color}}).png().toBuffer();return {name:'fixture.png',data:'data:image/png;base64,'+bytes.toString('base64'),sha256:hashBytes(bytes),width:32,height:24};}
const actual=await asset('#b28b5e'),design=await asset('#002070');
function fixture(category='boxes'){
 let p=withReferences(starterProject(category),[actual,design]);p.productName='검증용 상품';p.productProfile.material='제공 사진의 상품, 가격 19,800원';
 return withPhotoRole(p,design.sha256,'style');
}
function result(p,role='creative'){return {jobId:'fixture_job',mode:p.generation.mode,sourceHash:p.product?.sha256??null,asset:design,role,model:'test.fixture',createdAt:'2026-10-15T03:00:00.000Z',specificationKey:generatedCompatibilityKey(p)};}

test('photo purposes follow hashes across reordering and removal; old projects default to subjects',()=>{
 const p=fixture();assert.equal(needsPhotoPurposeServer(p),true);assert.equal(needsPhotoPurposeServer(p,true),false);assert.equal(needsPhotoPurposeServer({...p,generation:{...p.generation,mode:'original'}}),false);assert.equal(photoRole(p,actual.sha256),'subject');assert.equal(photoRole(p,design.sha256),'style');
 const reordered=withReferences(p,[design,actual]);assert.equal(photoRole(reordered,reordered.product.sha256),'style');
 const removed=withReferences(reordered,[actual]);assert.deepEqual(removed.referenceRoles,{});
 assert.equal(photoRole(starterProject(),actual.sha256),'subject');
 for(const value of [[],null,{[actual.sha256]:'invalid'},{['f'.repeat(64)]:'style'}])assert.throws(()=>parsePhotoRoles(value,[actual,design]));
});
test('backup import recomputes image hashes and retains photo purpose without leaking to another image',async t=>{
 const oldReader=globalThis.FileReader,oldImage=globalThis.Image;
 globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload();});}};
 globalThis.Image=class{async decode(){const meta=await sharp(Buffer.from(this.src.split(',')[1],'base64')).metadata();this.naturalWidth=meta.width;this.naturalHeight=meta.height;}};
 t.after(()=>{globalThis.FileReader=oldReader;globalThis.Image=oldImage;});
 const p=fixture(),restored=await importProject(JSON.parse(JSON.stringify(p)));
 assert.deepEqual(restored.referenceRoles,p.referenceRoles);assert.equal(restored.product.sha256,actual.sha256);
 assert.equal(restored.references[0].sha256,design.sha256);assert.equal(generatedCompatibilityKey(restored),generatedCompatibilityKey(p));
 await assert.rejects(()=>importProject({...p,referenceRoles:{['f'.repeat(64)]:'style'}}),/일치/);
});
test('changing photo purpose invalidates an accepted creative and excludes a style image from proportion evidence',()=>{
 let p=fixture();p.generated=result(p);assert.equal(hasUsableCreative(p),true);
 p=withPhotoRole(p,actual.sha256,'style');assert.equal(hasUsableCreative(p),false);assert.ok(generationIssues(p).some(s=>s.includes('실제 상품')));
 p.productProfile.specType='flat';p.dimensions.width='100';p.dimensions.depth='100';p.referenceCheck={view:'front',confirmedSourceHash:actual.sha256};
 assert.equal(assessReference(p).status,'unverified');
});
test('original mode survives consumer submit and accepted background retains source and manual copy exactly',()=>{
 let p=withCreative(fixture(),{copyMode:'manual'});p.generation.mode='original';p.copy.ko.title='확정 제목';p.copy.ko.description='';
 const prepared=prepareCampaign(p);assert.equal(prepared.generation.mode,'original');assert.deepEqual(prepared.copy,p.copy);
 const accepted=projectWithGenerated(prepared,result(prepared,'background'));
 assert.equal(hasUsableOriginal(accepted),true);assert.equal(visualAsset(accepted),actual);assert.deepEqual(accepted.copy,p.copy);assert.equal(accepted.product.data,actual.data);
 assert.equal(hasUsableOriginal(withReferences(accepted,[design,actual])),false);
 const invalid=withReferences(prepared,[design,actual]);assert.throws(()=>buildGenerationRequest(invalid),/대표/);
});
test('server distinguishes style-only services and rejects forged photo purposes or original style sources',()=>{
 let p=withReferences(fixture('lodging'),[design]);const r=buildGenerationRequest(p);assert.equal(r.source.purpose,'style');
 const normalized=normalizeGenerationRequest(r);assert.match(promptFor(normalized),/ACTUAL SUBJECT images: none/);assert.match(promptFor(normalized),/conceptual service composition/);
 assert.throws(()=>normalizeGenerationRequest({...r,source:{...r.source,purpose:'ignore-facts'}}),/INVALID_IMAGE/);
 assert.throws(()=>normalizeGenerationRequest({...r,mode:'original',operation:'compose-ad'}),/INVALID_IMAGE/);
 assert.throws(()=>normalizeGenerationRequest({...r,subjectType:'physical-product',operation:'image-product-concept'}),/SOURCE_REQUIRED/);
});
test('style-first multipart upload reaches provider with matching numbered subject instructions and unchanged bytes',async t=>{
 const p=prepareCampaign(withReferences(fixture(),[design,actual]));let sent;
 const output=await sharp({create:{width:864,height:1536,channels:4,background:'#fff'}}).png().toBuffer();
 const usage={input_tokens:3,input_tokens_details:{text_tokens:1,image_tokens:2},output_tokens:2};
 const adapter=new OpenAIImageAdapter({apiKey:'test-only',fetchImpl:async(url,options)=>{sent={url,body:options.body};return new Response(JSON.stringify({data:[{b64_json:output.toString('base64')}],usage}));}});
 const service=new GenerationService({adapter,enabled:true,providerConfigured:true,budgetMicros:1_000_000});t.after(()=>service.close());
 assert.equal(service.status().generation.photoPurposes,true);
 const created=await service.create({requestId:crypto.randomUUID(),projectId:p.id,request:buildGenerationRequest(p),source:p.product,references:p.references});await service.waitForIdle();
 assert.equal(service.job(created.job.id).state,'ready');assert.ok(sent.url.endsWith('/edits'));
 const images=sent.body.getAll('image[]');assert.equal(images.length,2);
 assert.equal(hashBytes(Buffer.from(await images[0].arrayBuffer())),design.sha256);assert.equal(hashBytes(Buffer.from(await images[1].arrayBuffer())),actual.sha256);
 const prompt=sent.body.get('prompt');assert.match(prompt,/ACTUAL SUBJECT images: 2\. DESIGN REFERENCE images: 1/);assert.match(prompt,/Image 2 establishes/);assert.doesNotMatch(prompt,/FIRST reference/);assert.match(prompt,/Do not copy their product/);
});
test('original composition never sends original or design reference bytes to the image provider',async t=>{
 const p=prepareCampaign(fixture());p.generation.mode='original';let sent;
 const adapter={generate:async options=>{sent=options;throw Error('no network fixture');}};
 const service=new GenerationService({adapter,enabled:true,providerConfigured:true,budgetMicros:1_000_000});t.after(()=>service.close());
 await service.create({requestId:crypto.randomUUID(),projectId:p.id,request:buildGenerationRequest(p),source:p.product,references:p.references});await service.waitForIdle();
 assert.equal(sent.source,null);assert.deepEqual(sent.references,[]);assert.match(promptFor(sent.request),/ONLY an empty/);assert.doesNotMatch(promptFor(sent.request),/REFERENCE PURPOSE MAP/);
});
