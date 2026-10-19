import {test} from 'node:test';
import assert from 'node:assert/strict';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {buildGenerationRequest,buildNewGenerationRequest,withoutDimensionReshape} from '../src/generation.ts';
import {generatedCompatibilityKey} from '../src/generated.ts';
for(const mode of ['main','inset','none'])for(const planar of [false,true])test(`new ${mode} request ignores saved reshape flags, planar=${planar}`,()=>{
 const p=starterProject('boxes');p.product={name:'source.png',data:'fixture',sha256:'a'.repeat(64),width:600,height:400};p.productName='G형 박스';p.productProfile={...p.productProfile,specType:'rectangular',material:'열린 골판지 박스'};p.dimensions={...p.dimensions,width:'300',depth:'200',height:'250',visible:true};p.dimensionAnnotation={method:'ai',mode,snapshot:''};p.generation={...p.generation,dimensionBased:true,dimensionBasis:'outer-body',dimensionVariant:'old',...(planar?{planarSourceHash:p.product.sha256}:{})};
 const oldKey=generatedCompatibilityKey(p),source=structuredClone(p),r=buildNewGenerationRequest(p);
 assert.equal(r.dimensionPlan,undefined);assert.equal(r.proportionControl,undefined);assert.equal(r.source.sha256,p.product.sha256);assert.equal(r.dimensionDisplay?.layout,mode==='none'?undefined:mode);assert.equal(r.output.showDimensionLines,mode!=='none');assert.deepEqual(r.specifications.map(s=>s.value),['300','200','250']);assert.deepEqual(p,source);assert.equal(generatedCompatibilityKey(p),oldKey);assert.equal(prepareCampaign(p).generation.dimensionBased,undefined);assert.equal(withoutDimensionReshape(p).generation.planarSourceHash,undefined);
});
test('ordinary requests are unchanged and historical dimension request remains reconstructible for recovery',()=>{
 const p=starterProject('boxes');p.product={name:'source.png',data:'fixture',sha256:'a'.repeat(64),width:600,height:400};p.productName='박스';p.productProfile={...p.productProfile,specType:'rectangular',material:'종이'};p.dimensions={...p.dimensions,width:'300',depth:'200',height:'250'};
 assert.equal(withoutDimensionReshape(p),p);assert.deepEqual(buildNewGenerationRequest(p),buildGenerationRequest(p));p.generation.dimensionBased=true;assert.ok(buildGenerationRequest(p).dimensionPlan);assert.equal(buildNewGenerationRequest(p).dimensionPlan,undefined);
});
for(const mode of ['original','text-example'])test(`new photo generation normalizes historical ${mode} without editing it`,()=>{
 const p=starterProject('other');p.productName='상품';p.productProfile.material='재질';p.product={name:'source.png',data:'fixture',sha256:'a'.repeat(64),width:600,height:400};p.generation={mode:mode==='original'?'original':'creative',brief:'기존 광고 방향',...(mode==='text-example'?{inputMode:'text-example',photoMode:'original'}:{})};
 const before=structuredClone(p),r=buildNewGenerationRequest(p);assert.equal(r.mode,'creative');assert.equal(r.inputMode,undefined);assert.equal(r.source.sha256,p.product.sha256);assert.equal(r.preserveProduct,false);assert.equal(r.brief,'기존 광고 방향');assert.deepEqual(p,before);
 p.product=null;assert.throws(()=>buildNewGenerationRequest(p),/사진/);p.productProfile.category='education';assert.throws(()=>buildNewGenerationRequest(p),/사진/);
});
