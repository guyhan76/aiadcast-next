import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject,exportErrors,importProject} from '../src/model.ts';
import {generatedCompatibilityKey,hasUsableCreative,visualAsset,parseGenerated} from '../src/generated.ts';
import {withCategory} from '../src/product.ts';
import {geometry} from '../src/layout.ts';
const original={name:'original.png',data:'data:image/png;base64,original',sha256:'a'.repeat(64),width:400,height:600};
const creative={name:'generated.png',data:'data:image/png;base64,generated',sha256:'b'.repeat(64),width:900,height:300};
function fixture(service=false){
 let p=newProject();if(service)p=withCategory(p,'education');else p.product=structuredClone(original);
 p.generation.mode='creative';
 p.generated={jobId:'job_123',mode:'creative',sourceHash:p.product?.sha256??null,asset:structuredClone(creative),role:'creative',model:'gpt-image-2.5-sunburst',createdAt:'2026-10-10T01:00:00.000Z',specificationKey:generatedCompatibilityKey(p)};
 return p;
}
test('accepted creative is separate from source and selected for export and geometry',()=>{
 const p=fixture();assert.equal(hasUsableCreative(p),true);assert.equal(visualAsset(p),p.generated.asset);
 assert.equal(p.product.sha256,original.sha256);assert.deepEqual(exportErrors(p),[]);
 const g=geometry(p);assert.ok(Math.abs(g.photo.w/g.photo.h-3)<1e-10);
 assert.equal(g.textOnly,false);
});
test('saved creative survives text, ratio, source placement, label visibility and brief edits',()=>{
 const p=fixture(),key=generatedCompatibilityKey(p);
 p.copy.ko.title='New offer';p.locale='en';p.productName='New display name';p.format='1:1';p.scale=.6;
 p.dimensions.visible=false;p.dimensions.lines=true;p.dimensions.anchors.width[0].x=.2;p.generation.brief='The next idea to try';
 assert.equal(generatedCompatibilityKey(p),key);assert.equal(hasUsableCreative(p),true);assert.deepEqual(exportErrors(p),[]);
});
test('source, mode, product profile or specification changes cannot silently reuse a stale creative',()=>{
 const changes=[p=>p.product.sha256='c'.repeat(64),p=>p.product=null,p=>p.generation.mode='original',p=>p.productProfile.material='New material',p=>p.productProfile.category='fashion',p=>p.productProfile.specType='flat',p=>p.dimensions.width='301'];
 for(const change of changes){const p=fixture();change(p);assert.equal(hasUsableCreative(p),false);assert.equal(visualAsset(p),p.product);if(p.generation.mode==='creative')assert.ok(exportErrors(p).some(e=>e.includes('생성하고 결과를 승인')));}
 const p=fixture();p.generated.sourceHash='c'.repeat(64);assert.equal(hasUsableCreative(p),false);
});
test('service creative becomes visual without inventing an original or requiring dimensions',()=>{
 const p=fixture(true);assert.equal(p.product,null);assert.equal(p.generated.sourceHash,null);
 assert.deepEqual(exportErrors(p),[]);assert.equal(geometry(p).textOnly,false);assert.equal(visualAsset(p),p.generated.asset);
 p.dimensions.width='unused-value';assert.equal(hasUsableCreative(p),true);
 delete p.generated;assert.equal(geometry(p).textOnly,true);assert.ok(exportErrors(p).some(e=>e.includes('AI 연결 후')));
});
test('background results cannot become a replacement product and remain mode constrained',()=>{
 const p=fixture();p.generation.mode='original';p.generated.mode='original';p.generated.role='background';p.generated.specificationKey=generatedCompatibilityKey(p);
 assert.equal(hasUsableCreative(p),false);assert.equal(visualAsset(p),p.product);assert.deepEqual(exportErrors(p),[]);
 p.generation.mode='creative';assert.equal(hasUsableCreative(p),false);
});
test('metadata parsing calls the image validator and keeps its recomputed hash and dimensions',async()=>{
 const p=fixture();let seen;
 const parsed=await parseGenerated({...p.generated,asset:{...creative,sha256:'forged',width:1,height:1}},async raw=>{seen=raw;return {...creative,sha256:'d'.repeat(64)};});
 assert.equal(seen.sha256,'forged');assert.equal(parsed.asset.sha256,'d'.repeat(64));assert.equal(parsed.asset.width,900);
 assert.equal(parsed.specificationKey,p.generated.specificationKey);
 assert.equal(await parseGenerated(undefined,async()=>{throw Error('must not decode');}),undefined);
 await assert.rejects(()=>parseGenerated(p.generated,async()=>null),/누락/);
});
test('malformed metadata is rejected before any image decoder runs',async()=>{
 const r=fixture().generated;
 const invalid=[null,[],{}, {...r,jobId:'bad\nvalue'}, {...r,jobId:'a'.repeat(129)}, {...r,sourceHash:'not-a-hash'}, {...r,mode:'other'}, {...r,role:'background'}, {...r,model:'x<script>'}, {...r,createdAt:'not-a-date'}, {...r,specificationKey:'not-json'}, {...r,specificationKey:'{}'}, {...r,specificationKey:JSON.stringify({...JSON.parse(r.specificationKey),sourceHash:null})}, {...r,specificationKey:JSON.stringify({...JSON.parse(r.specificationKey),productProfile:null})}, {...r,specificationKey:JSON.stringify({...JSON.parse(r.specificationKey),specifications:[{axis:'width',value:'0',unit:'mm'}]})}];
 for(const raw of invalid)await assert.rejects(()=>parseGenerated(raw,async()=>{assert.fail('decoder must not run');}));
});
test('old project imports remain compatible and reject generated metadata with no image',async()=>{
 const p=withCategory(newProject(),'education');assert.equal((await importProject(p)).generated,undefined);
 p.generation.mode='creative';p.generated=fixture(true).generated;p.generated.asset=null;
 await assert.rejects(()=>importProject(p),/누락/);
});
