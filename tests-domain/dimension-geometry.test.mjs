import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {dimensionGeometry,geometryMesh,geometryProjection,geometryGuideSvg,parseGeometryContract} from '../src/dimension-geometry.ts';
import {structuralGuide} from '../server/dimension-geometry-guide.mjs';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {completeAdKey,completeAdPlacement} from '../src/complete-ad.ts';
import {generatedCompatibilityKey,parseGenerated} from '../src/generated.ts';
import {projectAiDimensionKey} from '../src/ai-dimension-display.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {OpenAIImageAdapter,promptFor} from '../server/openai-image-adapter.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const contract=(values,extra={})=>dimensionGeometry({category:'boxes',specType:'rectangular',specifications:values.map((value,i)=>({axis:['width','depth','height'][i],value:String(value),unit:'mm'})),...extra});
for(const values of [[350,300,250],[600,100,50],[100,600,500],[50,50,800],[.5,.25,.125]])test(`world geometry preserves ${values.join(':')} before perspective, with one projection scale`,()=>{
 const c=contract(values),mesh=geometryMesh(c),view=geometryProjection(c);
 const span=[0,1,2].map(a=>Math.max(...mesh.vertices.map(p=>p[a]))-Math.min(...mesh.vertices.map(p=>p[a])));
 assert.deepEqual(span,values);assert.deepEqual(view.span,values);assert.equal(view.camera.projection,'perspective');assert.ok(view.points.every(p=>p.x>=79&&p.x<=721&&p.y>=79&&p.y<=721));
 assert.equal(c.outputGeometryVerified,false);assert.doesNotMatch(geometryGuideSvg(c),/<text|marker|arrow/);
});
test('350:300:250 is 7:6:5 in world space, not ratios of projected pixel edges',()=>{
 const g=geometryProjection(contract([350,300,250]));assert.deepEqual(g.span.map(v=>v/50),[7,6,5]);
 const len=(a,b)=>Math.hypot(g.points[a].x-g.points[b].x,g.points[a].y-g.points[b].y);
 assert.ok(Math.abs(len(0,1)/len(0,2)-7/6)>.01);
});
test('garments, bags, irregular and incomplete bottle shapes are never silently cuboids',()=>{
 for(const category of ['fashion','bags','shoes','pouches']){const c=contract([350,300,250],{category,shape:'cuboid'});assert.equal(c.shape,'unresolved');assert.equal(geometryMesh(c),null);assert.ok(c.missing.length);}
 const bottle=dimensionGeometry({category:'containers',specType:'cylindrical',specifications:[{axis:'diameter',value:'80',unit:'mm'},{axis:'height',value:'220',unit:'mm'}]});assert.equal(bottle.shape,'unresolved');assert.equal(geometryGuideSvg(bottle),null);
 const cylinder=dimensionGeometry({...bottle,shape:'straight-cylinder',specifications:bottle.measurements});assert.equal(cylinder.coverage,'body-only');assert.deepEqual(geometryProjection(cylinder).span,[80,80,220]);
 const plane=dimensionGeometry({category:'labels',specType:'flat',specifications:[{axis:'width',value:'350',unit:'mm'},{axis:'depth',value:'250',unit:'mm'}]});assert.deepEqual(geometryProjection(plane).span,[350,0,250]);
 assert.equal(contract([350,300,250],{basis:'inner-body'}).shape,'unresolved');
});
test('invalid shape, axis, unit and claimed verification cannot enter the contract',()=>{
 const c=contract([350,300,250]);assert.deepEqual(parseGeometryContract(c),c);assert.throws(()=>parseGeometryContract({...c,outputGeometryVerified:true}));
 for(const values of [[0,300,250],[-1,300,250],[NaN,300,250]])assert.throws(()=>contract(values));
 assert.throws(()=>contract([350,300,250],{shape:'straight-cylinder'}));
});
const source=await sharp({create:{width:800,height:300,channels:4,background:'#b78844'}}).png().toBuffer();
function project(layout='none') {const p=starterProject('boxes');return prepareCampaign({...p,format:'1:1',product:{name:'appearance.png',data:'data:image/png;base64,'+source.toString('base64'),sha256:hash(source),width:800,height:300},productName:'Box fixture',productProfile:{...p.productProfile,specType:'rectangular',material:'Printed cardboard'},dimensions:{...p.dimensions,width:'350',depth:'300',height:'250',displayUnit:'mm',visible:layout!=='none'},dimensionAnnotation:{method:'ai',mode:layout,snapshot:''}});}
test('hidden dimensions and shape changes invalidate composition; annotation does not alter construction',async()=>{
 const a=project(),b=structuredClone(a);b.dimensions.height='700';assert.notEqual(completeAdKey(a),completeAdKey(b));assert.notEqual(generatedCompatibilityKey(a),generatedCompatibilityKey(b));
 const guides=[];for(const layout of ['none','main','inset']){const p=project(layout),r=normalizeGenerationRequest(buildGenerationRequest(p));guides.push((await structuralGuide(r.dimensionGeometry)).sha256);if(layout!=='none')assert.equal(r.dimensionDisplay.inputKey,projectAiDimensionKey(p));assert.equal(r.dimensionGeometry.outputGeometryVerified,false);}
 assert.equal(new Set(guides).size,1);
 const a2=project('main'),b2=structuredClone(a2);b2.generation.dimensionBasis='inner-body';assert.notEqual(projectAiDimensionKey(a2),projectAiDimensionKey(b2));
});
test('adapter sends deterministic guide first and unchanged appearance bytes second; final pixels stay explicitly unverified',async()=>{
 const r=normalizeGenerationRequest(buildGenerationRequest(project('inset'))),guide=await structuralGuide(r.dimensionGeometry),returned=await sharp({create:{width:1024,height:1024,channels:4,background:'#224466'}}).png().toBuffer();let calls=0;
 const adapter=new OpenAIImageAdapter({apiKey:'local-fixture-only',fetchImpl:async(url,options)=>{calls++;assert.match(url,/images\/edits$/);const images=options.body.getAll('image[]');assert.equal(images.length,2);assert.equal(hash(Buffer.from(await images[0].arrayBuffer())),guide.sha256);assert.deepEqual(Buffer.from(await images[1].arrayBuffer()),source);assert.match(options.body.get('prompt'),/Input physical measurements take precedence/);assert.match(options.body.get('prompt'),/INSET layout/);assert.match(options.body.get('prompt'),/ACTUAL SUBJECT images: 2/);return new Response(JSON.stringify({data:[{b64_json:returned.toString('base64')}],usage:{input_tokens:1,output_tokens:1}}),{status:200,headers:{'Content-Type':'application/json'}});}});
 const result=await adapter.generate({request:r,source:{bytes:source,mime:'image/png',sha256:hash(source),width:800,height:300},attemptId:'geometry-fixture'});assert.equal(calls,1);assert.deepEqual(result.bytes,returned);assert.equal(result.geometryGuide.outputGeometryVerified,false);assert.equal(result.geometryGuide.guideHash,guide.sha256);
 const p=project();p.generated={asset:{width:1024,height:1024}};p.format='9:16';const placement=completeAdPlacement(p);assert.equal(placement.w/placement.h,1);assert.match(promptFor(r),/GEOMETRY AND ANNOTATION ARE SEPARATE/);
});
test('legacy saved advertisements retain legacy reuse keys until an explicit new draft upgrades them',()=>{
 const p=project();delete p.generation.geometryVersion;const key=JSON.parse(generatedCompatibilityKey(p));assert.equal(key.dimensionGeometry,undefined);assert.equal(JSON.parse(completeAdKey(p)).dimensionGeometry,undefined);
 const draft=prepareCampaign(p);assert.equal(draft.generation.geometryVersion,1);assert.ok(JSON.parse(generatedCompatibilityKey(draft)).dimensionGeometry);assert.equal(p.generation.geometryVersion,undefined);
});
test('blank measurements invalidate reuse safely without crashing an annotation editor',()=>{
 const p=project('main');p.dimensions.height='';assert.doesNotThrow(()=>projectAiDimensionKey(p));assert.doesNotThrow(()=>completeAdKey(p));assert.throws(()=>buildGenerationRequest(p));
});

test('saved results cannot lose their geometry contract while retaining a new reuse key',async()=>{
 const p=project(),dimensionGeometry=buildGenerationRequest(p).dimensionGeometry;
 const result={jobId:'geometry-save',model:'local.fixture',createdAt:'2026-10-19T00:00:00.000Z',mode:'creative',role:'creative',sourceHash:p.product.sha256,asset:p.product,specificationKey:generatedCompatibilityKey(p),dimensionGeometry};
 assert.deepEqual((await parseGenerated(result,async x=>x)).dimensionGeometry,dimensionGeometry);
 await assert.rejects(parseGenerated({...result,dimensionGeometry:undefined},async x=>x),/INVALID_GEOMETRY/);
});
test('partial monitor body extents preserve reference structure without inventing a box, depth or image offset',async()=>{
 const p=project('main');p.productName='49인치 커브드 울트라와이드 모니터';p.productProfile={...p.productProfile,category:'electronics',specType:'frontal'};p.dimensions={...p.dimensions,width:'1189',height:'366.6',depth:'999'};
 const r=normalizeGenerationRequest(buildGenerationRequest(p)),c=r.dimensionGeometry;
 assert.deepEqual(r.specifications,[{axis:'width',value:'1189',unit:'mm'},{axis:'height',value:'366.6',unit:'mm'}]);
 assert.equal(c.shape,'unresolved');assert.equal(c.outputGeometryVerified,false);assert.equal(await structuralGuide(c),null);assert.equal(geometryMesh(c),null);assert.deepEqual(parseGeometryContract(c),c);
 for(const shape of ['cuboid','plane','straight-cylinder'])assert.throws(()=>dimensionGeometry({category:'electronics',specType:'frontal',shape,specifications:r.specifications}));
 const prompt=promptFor(r);assert.match(prompt,/No deterministic structural guide is attached/);assert.match(prompt,/Never span the stand with a body-height arrow/);assert.doesNotMatch(prompt,/Input dimensions override its silhouette|IMAGE 1 is a deterministic/);assert.match(prompt,/ACTUAL SUBJECT images: 1/);assert.match(prompt,/DIRECT layout/);assert.doesNotMatch(prompt,/999/);
 let calls=0;const adapter=new OpenAIImageAdapter({apiKey:'local-fixture-only',fetchImpl:async(url,options)=>{calls++;assert.equal(options.body.getAll('image[]').length,1);assert.deepEqual(Buffer.from(await options.body.getAll('image[]')[0].arrayBuffer()),source);return new Response(JSON.stringify({data:[{b64_json:source.toString('base64')}]}),{status:200});}});
 const result=await adapter.generate({request:r,source:{bytes:source,mime:'image/png',sha256:hash(source),width:800,height:300},attemptId:'monitor-local-fixture'});assert.equal(calls,1);assert.equal(result.geometryGuide.guideHash,null);assert.equal(result.geometryGuide.outputGeometryVerified,false);
 const changed=structuredClone(p);changed.dimensions.height='367';assert.notEqual(projectAiDimensionKey(p),projectAiDimensionKey(changed));
});
