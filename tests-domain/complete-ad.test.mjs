import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject,exportErrors} from '../src/model.ts';
import {withCategory} from '../src/product.ts';
import {defaultCreative} from '../src/creative.ts';
import {defaultCampaign} from '../src/campaign.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {completeAdKey,completeAdPlacement} from '../src/complete-ad.ts';
import {generatedCompatibilityKey,hasUsableCreative,projectWithGenerated,parseGenerated} from '../src/generated.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {promptFor,displayedSpecifications,photographSize,GENERATION_SIZES} from '../server/openai-image-adapter.mjs';

function fixture(category='boxes'){
 const p=withCategory(newProject(),category);p.generation.mode='creative';p.presentation='campaign';p.campaign={...defaultCampaign(),creative:defaultCreative()};
 p.product={name:'source.png',data:'data:image/png;base64,example',width:561,height:397,sha256:'a'.repeat(64)};
 p.productName='우체국3호박스';p.productProfile.material='B골, 크라프트재질. 튼튼하고 습기에 강하다. 빠른배송. 10개 19,800원';
 p.dimensions={...p.dimensions,width:'340',depth:'250',height:'210',displayUnit:'mm'};
 p.copy.ko={title:'보내는 마음까지, 든든하게.',description:'B골 크라프트재질 · 빠른배송 · 10개 19,800원',company:'셀업랩스',contact:'010-5635-6211',email:'selluplabs@gmail.com',website:'https://selluplabs-homepage.selluplabs.workers.dev/'};
 return p;
}
function generated(p){return {jobId:'complete_fixture',mode:'creative',role:'creative',model:'verification.fixture',sourceHash:p.product?.sha256??null,createdAt:'2026-10-13T00:00:00.000Z',specificationKey:generatedCompatibilityKey(p),composition:'complete-ad',compositionKey:completeAdKey(p),asset:{name:'ad.png',data:'data:image/png;base64,example',width:864,height:1536,sha256:'b'.repeat(64)}};}
test('finished campaigns select industry-specific scenes while preserving supplied copy and CTA policy',()=>{
 const expected={boxes:'actual carton',beauty:'actual cosmetic packaging',food:'food or produce',fashion:'fabric drape',jewelry:'actual setting, cut and metal',electronics:'appliance or device',travel:'destination or experience',lodging:'documented room',restaurant:'supplied menu item',hospital:'supplied consultation',insurance:'conceptual planning scene',lease:'actual vehicle',industrial:'actual component'};
 const scenes=new Set();
 for(const [category,subject] of Object.entries(expected)){
  const p=fixture(category);p.campaign.creative.copyMode='manual';
  const r=normalizeGenerationRequest(buildGenerationRequest(p)),prompt=promptFor(r);
  const scene=prompt.split('INDUSTRY SCENE: ')[1]?.split('\n')[0];assert.ok(scene?.includes(subject),category);scenes.add(scene);
  assert.match(prompt,/Korean syllable blocks intact/);assert.match(prompt,/never override source identity/);
  assert.match(prompt,/MANUAL COPY: Typeset the supplied title and description verbatim/);
  assert.match(prompt,/Do not add a CTA/);assert.ok(prompt.includes(p.copy.ko.title));
 }
 assert.equal(scenes.size,Object.keys(expected).length);
});
test('finished ad hierarchy follows each supported ratio without changing named geometry',()=>{
 const p=fixture();
 for(const [ratio,layout] of Object.entries({'1:1':'SQUARE:','4:5':'PORTRAIT:','3:4':'PORTRAIT:','2:3':'PORTRAIT:','9:16':'TALL PORTRAIT:','16:9':'LANDSCAPE:','1.91:1':'LANDSCAPE:'})){
  p.format=ratio;const r=normalizeGenerationRequest(buildGenerationRequest(p));assert.ok(promptFor(r).includes(`RATIO AND LEGIBILITY: ${layout}`));
  assert.deepEqual(displayedSpecifications(r).map(s=>s.value),['340 mm','250 mm','210 mm']);
 }
});
test('complete-ad quality instructions never enter original, legacy photo or planar-control paths',()=>{
 const r=normalizeGenerationRequest(buildGenerationRequest(fixture()));
 for(const changed of [{...r,mode:'original'},{...r,output:{...r.output,compositionKey:undefined}},{...r,proportionControl:{kind:'planar'}}]){
  const prompt=promptFor(changed);assert.doesNotMatch(prompt,/FINISHED-AD QUALITY|INDUSTRY SCENE/);
 }
 assert.match(promptFor({...r,mode:'original'}),/ONLY an empty/);
});
test('finished production brief carries exact product, offer, contacts and named measured axes',()=>{
 const p=fixture(),r=normalizeGenerationRequest(buildGenerationRequest(p)),prompt=promptFor(r);
 for(const fact of [p.productName,p.copy.ko.title,'B골','크라프트재질','10개 19,800원','셀업랩스','010-5635-6211','selluplabs@gmail.com',p.copy.ko.website])assert.ok(prompt.includes(fact),fact);
 assert.deepEqual(displayedSpecifications(r),[{axis:'width',label:'가로',value:'340 mm'},{axis:'depth',label:'세로',value:'250 mm'},{axis:'height',label:'높이',value:'210 mm'}]);
 assert.match(prompt,/TWO flat liners and ONE corrugated middle layer/);assert.match(prompt,/never two fluted layers/);
 assert.match(prompt,/Do not illustrate a material cross-section.*not established/);assert.match(prompt,/without implying waterproof coating or an invented water test/);
 assert.match(prompt,/ONE FINISHED/);assert.match(prompt,/top 12%, bottom 24%, left 6%, right 15%/);
 assert.equal(r.output.compositionKey,completeAdKey(p));assert.match(prompt,/Do not add a CTA/);
});
test('older APK requests receive photograph-only results until their renderer supports finished ads',()=>{
 const r=normalizeGenerationRequest(buildGenerationRequest(fixture()));delete r.output.compositionKey;
 assert.equal(photographSize(r),'1536x864');assert.match(promptFor(r),/HERO PLATE/);assert.doesNotMatch(promptFor(r),/ONE FINISHED/);
});
test('hidden dimensions remain geometry input but never appear as displayed labels; hidden footer is not sent',()=>{
 const p=fixture();p.dimensions.visible=false;p.footer={company:false,contact:false,email:false,website:false};
 const request=buildGenerationRequest(p),r=normalizeGenerationRequest(request),prompt=promptFor(r);
 assert.deepEqual(r.specifications,[{axis:'width',value:'340',unit:'mm'},{axis:'depth',value:'250',unit:'mm'},{axis:'height',value:'210',unit:'mm'}]);
 assert.deepEqual(displayedSpecifications(r),[]);assert.equal(request.copy.dimensionText,'');
 for(const secret of ['セルアップ','010-5635-6211','selluplabs@gmail.com',p.copy.ko.website])assert.ok(!prompt.includes(secret));
 assert.equal(request.copy.company,'');assert.equal(r.marketingPlan.input.brand,'');
 assert.match(prompt,/Do NOT add numeric dimensions/);
});
test('actual photo identities and named physical ratios reach finished-ad generation even with dimension labels hidden',()=>{
 const p=fixture();p.dimensions={...p.dimensions,width:'400',depth:'300',height:'350',visible:false};
 const style={...p.product,name:'style.png',sha256:'c'.repeat(64)},side={...p.product,name:'side.png',sha256:'d'.repeat(64)};
 p.references=[style,side];p.referenceRoles={[style.sha256]:'style',[side.sha256]:'subject'};
 const r=normalizeGenerationRequest(buildGenerationRequest(p)),geometry=r.creativeDirection.referenceGeometry;
 assert.deepEqual(geometry.subjectReferenceHashes,[p.product.sha256,side.sha256]);
 assert.deepEqual(geometry.dimensions,[{axis:'width',value:400,unit:'mm'},{axis:'depth',value:300,unit:'mm'},{axis:'height',value:350,unit:'mm'}]);
 assert.deepEqual(geometry.normalizedRatios,[{axis:'width',ratio:1},{axis:'depth',ratio:.75},{axis:'height',ratio:.875}]);
 assert.equal(geometry.dimensionLabelsVisible,false);assert.equal(geometry.canvasRatioIndependent,true);assert.equal(geometry.geometryVerified,false);
 assert.equal(r.source.purpose,'subject');assert.deepEqual(r.references.map(a=>a.purpose),['style','subject']);assert.deepEqual(displayedSpecifications(r),[]);
 const prompt=promptFor(r);assert.ok(prompt.includes(JSON.stringify(geometry)));assert.match(prompt,/named physical dimensions together/);
 p.dimensions.height='200';p.format='1:1';const changed=normalizeGenerationRequest(buildGenerationRequest(p));
 assert.equal(changed.creativeDirection.referenceGeometry.normalizedRatios[2].ratio,.5);
 p.format='9:16';assert.deepEqual(normalizeGenerationRequest(buildGenerationRequest(p)).creativeDirection.referenceGeometry,changed.creativeDirection.referenceGeometry);
});
test('dimension guidance respects cylinder axes, actual photos, original mode and dimensionless services',()=>{
 const p=fixture();p.productProfile.specType='cylindrical';p.dimensions.width='100';p.dimensions.height='250';
 p.references=[{...p.product,name:'actual.png',sha256:'d'.repeat(64)}];p.referenceRoles={[p.product.sha256]:'style'};
 const geometry=normalizeGenerationRequest(buildGenerationRequest(p)).creativeDirection.referenceGeometry;
 assert.deepEqual(geometry.subjectReferenceHashes,[p.references[0].sha256]);
 assert.deepEqual(geometry.normalizedRatios,[{axis:'diameter',ratio:1},{axis:'height',ratio:2.5}]);
 p.referenceRoles={};p.generation.mode='original';assert.equal(normalizeGenerationRequest(buildGenerationRequest(p)).creativeDirection.referenceGeometry,null);
 p.generation.mode='creative';p.productProfile.specType='none';assert.equal(normalizeGenerationRequest(buildGenerationRequest(p)).creativeDirection.referenceGeometry,null);
 const service=withCategory(p,'lease');service.product=null;service.references=[];
 assert.equal(normalizeGenerationRequest(buildGenerationRequest(service)).creativeDirection.referenceGeometry,null);
});
test('display units are derived from canonical values; caller-supplied dimension text cannot override them',()=>{
 const p=fixture();p.dimensions.displayUnit='cm';const r=normalizeGenerationRequest(buildGenerationRequest(p));
 r.copy.dimensionText='999 × 999 × 999 mm';
 assert.deepEqual(displayedSpecifications(r).map(s=>s.value),['34 cm','25 cm','21 cm']);assert.ok(!promptFor(r).includes('999 × 999'));
 p.productProfile.specType='cylindrical';p.locale='en';const cylinder=normalizeGenerationRequest(buildGenerationRequest(p));
 assert.deepEqual(displayedSpecifications(cylinder),[{axis:'diameter',label:'Diameter',value:'34 cm'},{axis:'height',label:'Height',value:'21 cm'}]);
});
test('dimensionless products and services receive finished campaigns without invented dimensions',()=>{
 for(const category of ['beauty','bags','fashion','jewelry','electronics','travel','lodging','insurance','hospital','lease','education','other']){
  const p=fixture(category);p.productProfile.specType='none';p.productName='제공된 상품 또는 서비스';
  if(['travel','lodging','insurance','hospital','lease','education'].includes(category)){p.product=null;p.generation.brief='제공한 서비스 소개';}
  const r=normalizeGenerationRequest(buildGenerationRequest(p)),prompt=promptFor(r);
  assert.deepEqual(r.specifications,[]);assert.deepEqual(displayedSpecifications(r),[]);assert.match(prompt,/ONE FINISHED/);assert.match(prompt,/Missing dimensions remain unknown/);
  if(r.subjectType==='service')assert.match(prompt,/SERVICE: Build a service campaign/);
 }
});
test('all native sizes are independent of product proportions and complete exported images are uniformly contained',()=>{
 const p=fixture();p.generated=generated(p);
 for(const format of ['1:1','4:5','3:4','2:3','9:16','16:9','1.91:1']){
  p.format=format;assert.equal(photographSize(buildGenerationRequest(p)),GENERATION_SIZES[format]);
  const g=completeAdPlacement(p);assert.ok(g.x>=0&&g.y>=0);assert.ok(g.x+g.w<=g.width+.00001&&g.y+g.h<=g.height+.00001);
  assert.ok(Math.abs(g.w/p.generated.asset.width-g.h/p.generated.asset.height)<1e-10);assert.equal(hasUsableCreative(p),true);
 }
 p.format='9:16';assert.deepEqual(completeAdPlacement(p),{width:1080,height:1920,x:0,y:0,w:1080,h:1920});
});
test('flattened ad cannot silently reuse old copy, locale, product name, dimension visibility or contacts',()=>{
 const edits=[p=>p.copy.ko.title='Changed',p=>p.copy.ko.description='10개 29,800원',p=>p.copy.ko.contact='010-0000-0000',p=>p.copy.ko.email='new@example.com',p=>p.copy.ko.website='https://example.com',p=>p.locale='en',p=>p.productName='Other',p=>p.campaign.attributes=[{name:'판매가',value:'29,800원'}],p=>p.dimensions.visible=false,p=>p.dimensions.lines=true,p=>p.dimensions.displayUnit='cm',p=>p.footer={company:false,contact:true,email:true,website:true}];
 for(const edit of edits){const p=fixture(),r=generated(p);p.generated=r;edit(p);assert.equal(hasUsableCreative(p),false);assert.ok(exportErrors(p).length);assert.throws(()=>projectWithGenerated(p,r),/STALE_AD_COPY/);}
 const p=fixture();p.footer={company:false,contact:true,email:true,website:true};p.generated=generated(p);p.copy.ko.company='Hidden new value';assert.equal(hasUsableCreative(p),true);
 p.format='1:1';p.scale=.6;p.generation.brief='Next concept';assert.equal(hasUsableCreative(p),true);
});
test('complete review preserves approved facts exactly and import keeps composition metadata',async()=>{
 const p=fixture(),r=generated(p),review=projectWithGenerated(p,r);assert.deepEqual(review.copy,p.copy);assert.equal(review.generated,r);assert.equal(review.product,p.product);
 const parsed=await parseGenerated(r,async()=>r.asset);assert.equal(parsed.composition,'complete-ad');assert.equal(parsed.compositionKey,r.compositionKey);
 for(const invalid of [{...r,composition:'unknown'},{...r,compositionKey:undefined},{...r,compositionKey:'not-json'},{...r,compositionKey:'[]'},{...r,mode:'original',role:'background'}])await assert.rejects(()=>parseGenerated(invalid,async()=>assert.fail('Must validate before image decode')));
});
