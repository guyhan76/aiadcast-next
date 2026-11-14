import {test} from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {planarOutline,planarRatio,parsePlanarReport} from '../src/planar-proportion.ts';
import {preparePlanarSource,controlPlanarResult} from '../server/planar-proportion.mjs';
import {newProject} from '../src/model.ts';
import {buildGenerationRequest,parseGeneration} from '../src/generation.ts';
import {generatedCompatibilityKey} from '../src/generated.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {photographSize,completeAdRequest,promptFor} from '../server/openai-image-adapter.mjs';
import {defaultCampaign} from '../src/campaign.ts';
import {defaultCreative} from '../src/creative.ts';
async function fixture(w=180,h=120,extra=''){
 return sharp(Buffer.from(`<svg width="300" height="300"><rect width="300" height="300" fill="white"/><rect x="50" y="60" width="${w}" height="${h}" fill="#304f60"/>${extra}</svg>`)).png().toBuffer();
}
async function pixels(bytes){const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,width:info.width,height:info.height};}
const hash=b=>createHash('sha256').update(b).digest('hex');
test('only fully visible declared planar rectangles qualify; ambiguity stays unverified',async()=>{
 assert.equal(planarOutline(await pixels(await fixture())).ratio,1.5);
 const cases=[await fixture(180,120,'<rect x="50" y="90" width="35" height="35" fill="white"/>'),await fixture(180,120,'<rect x="250" y="200" width="40" height="65" fill="black"/>'),await sharp(Buffer.from('<svg width="300" height="300"><rect width="300" height="300" fill="white"/><polygon points="40,60 230,80 210,210 65,185" fill="black"/></svg>')).png().toBuffer()];
 for(const bytes of cases){assert.equal(planarOutline(await pixels(bytes)).bounds,null);const r=await controlPlanarResult(bytes,1.5);assert.equal(r.report.state,'unverified');assert.equal(r.report.outputRatio,null);assert.deepEqual(r.bytes,bytes);await assert.rejects(preparePlanarSource(bytes,1.5),/PLANAR_SOURCE/);}
 assert.throws(()=>planarRatio(0,100));assert.throws(()=>planarRatio(10000,1));
});
test('isolated generated plane is corrected locally and raw bytes remain available',async()=>{
 const bytes=await fixture(180,100),before=Buffer.from(bytes),r=await controlPlanarResult(bytes,1.5),meta=await sharp(r.bytes).metadata();
 assert.equal(r.report.state,'adjusted');assert.equal(r.report.observedRatio,1.8);assert.ok(Math.abs(meta.width/meta.height-1.5)<.002);
 assert.equal(r.report.originalHash,hash(bytes));assert.equal(r.report.geometryVerified,false);assert.equal(r.report.identityVerified,false);assert.deepEqual(bytes,before);assert.equal(parsePlanarReport(r.report).state,'adjusted');
 const normal=await controlPlanarResult(await fixture(),1.5);assert.equal(normal.report.state,'within-tolerance');
 const wrong=await controlPlanarResult(await fixture(180,70),1.5);assert.equal(wrong.report.state,'unverified');assert.equal(wrong.report.reason,'large-ratio-mismatch');
 assert.throws(()=>parsePlanarReport({...r.report,geometryVerified:true}));assert.throws(()=>parsePlanarReport({...r.report,outputRatio:3}));
});
test('size variants build distinct deterministic guides without mutating source',async()=>{
 const bytes=await fixture(),original=hash(bytes),a=await preparePlanarSource(bytes,1.5),b=await preparePlanarSource(bytes,1);
 assert.notEqual(hash(a),hash(b));assert.equal(hash(bytes),original);assert.deepEqual(await sharp(a).metadata().then(m=>[m.width,m.height]),[1024,1024]);
});
function project(){const p=newProject();p.product={name:'plane.png',data:'data:image/png;base64,test',sha256:'a'.repeat(64),width:300,height:300};p.generation={mode:'creative',brief:''};p.productProfile.specType='flat';p.dimensions.width='180';p.dimensions.depth='120';p.campaign={...defaultCampaign(),creative:defaultCreative()};return p;}
test('control is opt-in, server validated and variants do not reuse old results',()=>{
 const p=project(),ordinary=buildGenerationRequest(p),normalKey=generatedCompatibilityKey(p);assert.equal(ordinary.proportionControl,undefined);assert.equal(completeAdRequest(ordinary),true);
 p.generation.dimensionBased=true;p.generation.planarSourceHash=p.product.sha256;p.generation.dimensionVariant='A';const request=buildGenerationRequest(p),normalized=normalizeGenerationRequest(request),key=generatedCompatibilityKey(p);
 assert.equal(normalized.proportionControl.variantLabel,'A');assert.equal(photographSize(normalized),'1024x1024');assert.equal(completeAdRequest(normalized),false);assert.match(promptFor(normalized),/isolated flat rectangular product/);assert.notEqual(key,normalKey);
 p.dimensions.depth='180';p.generation.dimensionVariant='B';assert.notEqual(generatedCompatibilityKey(p),key);assert.equal(request.specifications[1].value,'120');assert.equal(request.proportionControl.variantLabel,'A');
 for(const specType of ['rectangular','cylindrical','none'])assert.throws(()=>normalizeGenerationRequest({...request,productProfile:{...request.productProfile,specType}}),/INVALID_(PLANAR_CONTROL|DIMENSION_PLAN)/);
 assert.throws(()=>normalizeGenerationRequest({...request,proportionControl:{...request.proportionControl,confirmedSourceHash:'b'.repeat(64)}}),/INVALID_PLANAR_CONTROL/);
 p.dimensions.depth='120';p.generation=parseGeneration({mode:'creative',brief:''});assert.deepEqual(buildGenerationRequest(p),ordinary);assert.equal(generatedCompatibilityKey(p),normalKey);
});

test('local provider fixture controls one plane, preserves raw result and billing through restart',async t=>{
 const {OpenAIImageAdapter}=await import('../server/openai-image-adapter.mjs');const {GenerationService}=await import('../server/generation-service.mjs');
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'planar-ledger-')),databasePath=join(dir,'ledger.sqlite');let service,calls=0,sent;
 t.after(async()=>{await service?.close();rmSync(dir,{recursive:true,force:true});});
 const raw=await sharp(Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" fill="white"/><rect x="200" y="260" width="600" height="340" fill="#305060"/></svg>')).png().toBuffer();
 const adapter=new OpenAIImageAdapter({apiKey:'local-fixture-only',fetchImpl:async(url,options)=>{calls++;sent=options.body;return new Response(JSON.stringify({data:[{b64_json:raw.toString('base64')}],usage:{input_tokens:3,input_tokens_details:{text_tokens:1,image_tokens:2},output_tokens:2}}));}});
 const make=()=>new GenerationService({databasePath,adapter,enabled:true,providerConfigured:true,budgetMicros:2000000,testCredits:0});service=make();service.adminTestUnlimited=true;
 const bytes=await fixture(),p=project();p.product={name:'plane.png',data:'data:image/png;base64,'+bytes.toString('base64'),width:300,height:300,sha256:hash(bytes)};p.generation.dimensionBased=true;p.generation.planarSourceHash=p.product.sha256;p.generation.dimensionVariant='규격 A';
 const body={requestId:'planar-request-001',projectId:'planar-project-001',request:buildGenerationRequest(p),source:p.product};
 const created=await service.create(body);await service.waitForIdle();const job=service.job(created.job.id);
 assert.equal(calls,1);assert.equal(sent.get('size'),'1024x1024');assert.match(sent.get('prompt'),/isolated flat rectangular/);assert.notEqual(hash(Buffer.from(await sent.get('image').arrayBuffer())),p.product.sha256);
 assert.equal(job.state,'ready');assert.equal(job.planarReport.state,'adjusted');assert.equal(job.planarReport.variantLabel,'규격 A');assert.equal(job.planarOriginal.sha256,hash(raw));assert.equal(job.composition,'photo-plate');assert.equal(job.creditCost,0);assert.equal(job.marketingPlan.input.specifications[1].value,'120');
 assert.notEqual(job.artifactId,hash(raw));assert.ok(Math.abs(job.artifact.width/job.artifact.height-1.5)<.002);service.accept(job.id,job.artifactId);assert.equal(service.wallet().available,0);assert.ok(service.status().budget.spentMicros>0);
 await service.close();service=make();service.adminTestUnlimited=true;const restored=service.job(job.id);assert.deepEqual(restored.planarReport,job.planarReport);assert.deepEqual(restored.planarOriginal,job.planarOriginal);assert.equal(restored.state,'accepted');assert.equal((await service.create(body)).job.id,job.id);assert.equal(calls,1);
 const bad=await fixture(180,120,'<rect x="50" y="90" width="30" height="30" fill="white"/>');const q=structuredClone(p);q.product={...p.product,data:'data:image/png;base64,'+bad.toString('base64'),sha256:hash(bad)};q.generation.planarSourceHash=q.product.sha256;
 await assert.rejects(service.create({...body,requestId:'planar-request-bad',request:buildGenerationRequest(q),source:q.product}),/PLANAR_SOURCE_UNCONFIRMED/);assert.equal(calls,1);assert.equal(service.wallet().reserved,0);
});
test('optional measured variants retain full-ad path for packaging, containers and garments without inferring sizes',async()=>{
 const {makeDimensionPlan,parseDimensionPlan}=await import('../src/dimension-generation.ts');
 const p=project(),ordinary=buildGenerationRequest(p),baseline=promptFor(ordinary);p.generation.dimensionBased=true;p.generation.dimensionVariant='500 ml';p.productProfile.specType='cylindrical';p.dimensions.width='65';p.dimensions.height='170';
 const container=normalizeGenerationRequest(buildGenerationRequest(p));assert.equal(completeAdRequest(container),true);assert.equal(container.proportionControl,undefined);assert.deepEqual(container.dimensionPlan.measurements.map(m=>[m.axis,m.value]),[['diameter','65'],['height','170']]);assert.match(promptFor(container),/volume alone does not establish geometry/);
 p.productProfile.specType='rectangular';p.dimensions.width='180';p.dimensions.depth='120';const box=normalizeGenerationRequest(buildGenerationRequest(p));assert.equal(box.dimensionPlan.measurements.length,3);assert.match(promptFor(box),/exclude open packaging flaps/);
 p.productProfile.specType='flat';p.generation.dimensionBasis='garment-flat';p.generation.dimensionVariant='M';p.dimensions.width='520';p.dimensions.depth='700';const garment=normalizeGenerationRequest(buildGenerationRequest(p));assert.deepEqual(garment.dimensionPlan.measurements.map(m=>m.meaning),['flat-chest-width','garment-length']);assert.equal(completeAdRequest(garment),true);assert.match(promptFor(garment),/Do not infer measurements from S\/M\/L/);assert.deepEqual(parseDimensionPlan(garment.dimensionPlan),garment.dimensionPlan);
 assert.throws(()=>makeDimensionPlan({...garment.dimensionPlan,specifications:[]}),/INVALID_DIMENSION_PLAN/);assert.throws(()=>makeDimensionPlan({...garment.dimensionPlan,specifications:[{axis:'width',value:'M',unit:'mm'},{axis:'depth',value:'700',unit:'mm'}]}),/INVALID_DIMENSION_PLAN/);
 assert.throws(()=>parseDimensionPlan({...garment.dimensionPlan,measurements:garment.dimensionPlan.measurements.map(m=>({...m,meaning:'volume'}))}),/INVALID_DIMENSION_PLAN/);
 const restored=project();assert.equal(promptFor(buildGenerationRequest(restored)),baseline);assert.equal(parseGeneration({mode:'creative',brief:'',dimensionBased:false,dimensionVariant:'M'}).dimensionBased,undefined);
});
test('saved container variant validates diameter mapping and rejects missing or mismatched measurement snapshots',async()=>{
 const {parseGenerated}=await import('../src/generated.ts');const p=project();p.generation.dimensionBased=true;p.generation.dimensionVariant='500 ml';p.productProfile.specType='cylindrical';p.dimensions.width='65';p.dimensions.height='170';
 const dimensionPlan=buildGenerationRequest(p).dimensionPlan;
 const generated={jobId:'variant-test',mode:'creative',sourceHash:p.product.sha256,asset:{...p.product,sha256:'b'.repeat(64)},role:'creative',model:'fixture',createdAt:'2026-10-17T00:00:00.000Z',specificationKey:generatedCompatibilityKey(p),dimensionPlan};
 assert.deepEqual((await parseGenerated(generated,async a=>a)).dimensionPlan,dimensionPlan);
 await assert.rejects(parseGenerated({...generated,dimensionPlan:undefined},async a=>a),/INVALID_DIMENSION_PLAN/);
 await assert.rejects(parseGenerated({...generated,dimensionPlan:{...dimensionPlan,measurements:dimensionPlan.measurements.map(m=>({...m,value:'900'}))}},async a=>a),/INVALID_DIMENSION_PLAN/);
 p.referenceCheck={view:'front',confirmedSourceHash:p.product.sha256};p.dimensions.anchors.width=[{x:0,y:0},{x:1,y:0}];p.dimensions.anchors.height=[{x:0,y:0},{x:0,y:1}];assert.doesNotThrow(()=>buildGenerationRequest(p));
});
test('switching a measured product to a dimensionless service clears hidden opt-in controls',async()=>{
 const {withCategory}=await import('../src/product.ts');const p=project();p.generation.dimensionBased=true;p.generation.planarSourceHash=p.product.sha256;const service=withCategory(p,'education');assert.equal(service.generation.dimensionBased,false);assert.equal(service.generation.planarSourceHash,undefined);assert.equal(buildGenerationRequest(service).dimensionPlan,undefined);
});
