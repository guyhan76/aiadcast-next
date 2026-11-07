import {test} from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {prepareSelectiveProviderInput,restoreSelectiveProviderResult} from '../server/selective-image-edit.mjs';
import {OpenAIImageAdapter,hashBytes} from '../server/openai-image-adapter.mjs';
import {prepareUserProvidedSource} from '../experiments/selective-quality-once/user-provided-source.mjs';
const model='gpt-image-2.6-sunburst';
async function png(raw,w,h){const bytes=await sharp(raw,{raw:{width:w,height:h,channels:4}}).png().toBuffer();return {bytes,width:w,height:h,mime:'image/png',sha256:hashBytes(bytes)};}
async function fixture(w=1080,h=1920,points=[[1050,1800]]){const a=Buffer.alloc(w*h*4);for(let i=0;i<a.length;i++)a[i]=(i*13)%256;a[0]=91;a[1]=82;a[2]=73;a[3]=0;a[a.length-1]=0;const m=Buffer.alloc(a.length,255);for(const [x,y] of points)m[(y*w+x)*4+3]=0;return {source:await png(a,w,h),mask:await png(m,w,h),raw:a,mraw:m};}
for(const [w,h,points] of [[1080,1920,[[0,0]]],[1080,1920,[[1079,0]]],[1080,1920,[[0,1919]]],[1080,1920,[[1079,1919]]],[1080,1920,[[650,900],[1050,1800]]],[700,1920,[[0,1800],[699,1919]]],[1920,700,[[1800,0],[1919,699]]]])test(`ROI ${w}x${h} ${JSON.stringify(points)} keeps all unselected RGBA including hidden RGB`,async()=>{
 const f=await fixture(w,h,points),hash=f.source.sha256,p=await prepareSelectiveProviderInput({model,...f});assert.ok(p.roi);assert.ok(Object.isFrozen(p.roi));
 const gen=await png(Buffer.alloc(p.plan.canvasWidth*p.plan.canvasHeight*4,71),p.plan.canvasWidth,p.plan.canvasHeight);
 const result=await restoreSelectiveProviderResult(gen.bytes,p,f.source,f.mask),actual=await sharp(result.bytes).ensureAlpha().raw().toBuffer(),expected=Buffer.from(f.raw);
 for(const [x,y] of points)expected.fill(71,(y*w+x)*4,(y*w+x)*4+4);
 assert.deepEqual(actual,expected);assert.equal(result.width,w);assert.equal(result.height,h);assert.equal(hashBytes(f.source.bytes),hash);
 const pm=await sharp(p.mask.bytes).raw().toBuffer();for(let y=0;y<p.plan.canvasHeight;y++)for(let x=0;x<p.plan.canvasWidth;x++)if(x<p.plan.left||y<p.plan.top||x>=p.plan.left+p.plan.width||y>=p.plan.top+p.plan.height)assert.equal(pm[(y*p.plan.canvasWidth+x)*4+3],255);
});
test('all selections must fit one canvas; empty, fractional alpha, hash/dimension mismatch fail closed',async()=>{
 const f=await fixture(1080,1920,[[0,0],[1079,1919]]);await assert.rejects(prepareSelectiveProviderInput({model,...f}),/UNSUPPORTED_EDIT_SIZE/);
 const g=await fixture();for(const mask of [await png(Buffer.alloc(g.mraw.length,255),1080,1920),await png(Buffer.alloc(g.mraw.length,7),1080,1920),{...g.mask,sha256:'0'.repeat(64)},{...g.mask,width:1079}])await assert.rejects(prepareSelectiveProviderInput({model,source:g.source,mask}));
 await assert.rejects(prepareSelectiveProviderInput({model,source:{...g.source,width:Number.MAX_SAFE_INTEGER},mask:g.mask}),/UNSUPPORTED_EDIT_SIZE/);
});
test('tampered ROI/plan/hash, different image or mask, wrong output size reject',async()=>{
 const f=await fixture(),p=await prepareSelectiveProviderInput({model,...f}),out=await png(Buffer.alloc(1024*1024*4,77),1024,1024);
 for(const roi of [{...p.roi,x:-1},{...p.roi,x:0.5},{...p.roi,width:Infinity},{...p.roi,y:999999}])await assert.rejects(restoreSelectiveProviderResult(out.bytes,{...p,roi},f.source,f.mask));
 await assert.rejects(restoreSelectiveProviderResult(out.bytes,{...p,plan:{...p.plan,left:99}},f.source,f.mask));
 const other=await fixture(1080,1920,[[0,0]]);await assert.rejects(restoreSelectiveProviderResult(out.bytes,p,f.source,other.mask));
 const source=await png(Buffer.alloc(f.raw.length,122),1080,1920);await assert.rejects(restoreSelectiveProviderResult(out.bytes,p,source,f.mask));
 const wrong=await png(Buffer.alloc(64*64*4),64,64);await assert.rejects(restoreSelectiveProviderResult(wrong.bytes,p,f.source,f.mask),/PROVIDER_INVALID_IMAGE/);
});
test('adapter single mocked POST, prepared binding mismatch zero POST; uncertain never retries',async()=>{
 const f=await fixture(),p=await prepareSelectiveProviderInput({model,...f});let calls=0;
 const adapter=new OpenAIImageAdapter({apiKey:'mock',fetchImpl:async(url,{body})=>{calls++;assert.equal(body.get('n'),'1');throw Error('mock timeout');}});adapter.selectiveEditReady=true;
 await assert.rejects(adapter.editRegion({...f,prompt:'move shoe',providerInput:{...p,bindingHash:'bad'}}));assert.equal(calls,0);
 await assert.rejects(adapter.editRegion({...f,prompt:'move shoe',providerInput:p}),/PROVIDER_UNCERTAIN/);assert.equal(calls,1);
});
test('user export provenance is distinct and cannot authorize dispatch or forge server lineage',async()=>{
 const f=await fixture(),approval={kind:'user-provided-export',ownerId:'owner',authorizedForLocalPreparation:true,libraryFileId:'libfile_'+'a'.repeat(32),fileId:'file_'+'b'.repeat(32),sha256:f.source.sha256,bytes:f.source.bytes.length,width:1080,height:1920,serverArtifactRelation:'unverified'};
 const r=await prepareUserProvidedSource({bytes:f.source.bytes,mask:f.mask,approval,ownerId:'owner',model});assert.equal(r.dispatchAuthorized,false);assert.equal(r.provenance.kind,'user-provided-export');assert.equal('synthetic' in r.provenance,false);assert.equal('jobId' in r.provenance,false);
 for(const change of [{ownerId:'other'},{serverArtifactRelation:'verified'},{sha256:'0'.repeat(64)},{authorizedForLocalPreparation:false}])await assert.rejects(prepareUserProvidedSource({bytes:f.source.bytes,mask:f.mask,approval:{...approval,...change},ownerId:'owner',model}));
});

test('precomputed input invokes no asynchronous preparation between final dispatch gate and fetch',async()=>{
 const f=await fixture(),p=await prepareSelectiveProviderInput({model,...f});let calls=0;
 const adapter=new OpenAIImageAdapter({apiKey:'mock',fetchImpl:()=>{calls++;throw Error('mock');}});adapter.selectiveEditReady=true;
 adapter.prepareSelectiveInput=async()=>{throw Error('MUST_NOT_PREPARE_AFTER_GATE');};
 const pending=adapter.editRegion({...f,providerInput:p,prompt:'mock'});assert.equal(calls,1);
 await assert.rejects(pending,/PROVIDER_UNCERTAIN/);
 await assert.rejects(adapter.editRegion({...f,providerInput:{...p},prompt:'mock'}),/INVALID_EDIT_SOURCE/);assert.equal(calls,1);
});
test('prepared metadata is immutable; buffer mutation during transport cannot change captured contract',async()=>{
 const f=await fixture(),p=await prepareSelectiveProviderInput({model,...f});assert.throws(()=>{p.source.width=1536;},TypeError);assert.throws(()=>{p.mask.mime='image/jpeg';},TypeError);
 let calls=0;const out=await png(Buffer.alloc(1024*1024*4,99),1024,1024);
 const adapter=new OpenAIImageAdapter({apiKey:'mock',fetchImpl:async()=>{calls++;p.source.bytes.fill(0);p.mask.bytes.fill(0);return new Response(JSON.stringify({data:[{b64_json:out.bytes.toString('base64')}]}));}});adapter.selectiveEditReady=true;
 const result=await adapter.editRegion({...f,providerInput:p,prompt:'mock'});assert.equal(calls,1);assert.equal(result.width,1080);assert.equal(result.height,1920);assert.equal(result.cost,null);
 await assert.rejects(adapter.editRegion({...f,providerInput:p,prompt:'mock'}),/INVALID_EDIT_SOURCE/);assert.equal(calls,1);
});
test('post-dispatch invalid output remains uncertain and cannot classify as free failure',async()=>{
 const f=await fixture(),p=await prepareSelectiveProviderInput({model,...f}),wrong=await png(Buffer.alloc(64*64*4,255),64,64);let calls=0;
 const adapter=new OpenAIImageAdapter({apiKey:'mock',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({data:[{b64_json:wrong.bytes.toString('base64')}]}));}});adapter.selectiveEditReady=true;
 await assert.rejects(adapter.editRegion({...f,providerInput:p,prompt:'mock'}),e=>e.code==='PROVIDER_INVALID_IMAGE'&&e.uncertain===true);assert.equal(calls,1);
});

test('precomputed source or mask hash/mime metadata mismatch rejects before POST',async()=>{
 const f=await fixture(),p=await prepareSelectiveProviderInput({model,...f});let calls=0;const adapter=new OpenAIImageAdapter({apiKey:'mock',fetchImpl:()=>{calls++;throw Error('must not call');}});adapter.selectiveEditReady=true;
 for(const key of ['source','mask'])for(const change of [{sha256:'0'.repeat(64)},{mime:'image/jpeg'}])await assert.rejects(adapter.editRegion({...f,[key]:{...f[key],...change},providerInput:p,prompt:'mock'}),/INVALID_EDIT_SOURCE/);
 assert.equal(calls,0);
});
test('disjoint upper trouser and rear-leg regions share one portrait ROI while text holes and front product stay exact',async()=>{
 // Synthetic coordinates only: NOT a mask or registration for the user's shoe PNG.
 const w=1080,h=1920,raw=Buffer.alloc(w*h*4);for(let i=0;i<raw.length;i++)raw[i]=(i*19)%256;raw[3]=0;
 const mr=Buffer.alloc(raw.length,255);
 const inRect=(x,y,r)=>x>=r[0]&&y>=r[1]&&x<r[2]&&y<r[3];
 const rear=[100,400,350,1450],upper=[900,0,1000,250],text=[100,600,300,700],front=[500,1250,1070,1750];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((inRect(x,y,rear)||inRect(x,y,upper))&&!inRect(x,y,text)&&!inRect(x,y,front))mr[(y*w+x)*4+3]=0;
 const source=await png(raw,w,h),mask=await png(mr,w,h),p=await prepareSelectiveProviderInput({model,source,mask});
 assert.equal(p.plan.canvasWidth,1024);assert.equal(p.plan.canvasHeight,1536);assert.equal(p.roi.y,0);
 const generated=await png(Buffer.alloc(1024*1536*4,77),1024,1536),result=await restoreSelectiveProviderResult(generated.bytes,p,source,mask),actual=await sharp(result.bytes).ensureAlpha().raw().toBuffer();
 let changed=0;for(let i=0;i<raw.length;i+=4){if(mr[i+3]===0){assert.deepEqual(actual.subarray(i,i+4),Buffer.from([77,77,77,77]));changed++;}else assert.deepEqual(actual.subarray(i,i+4),raw.subarray(i,i+4));}
 assert.equal(changed,267500);assert.equal(result.width,1080);assert.equal(result.height,1920);assert.equal(hashBytes(source.bytes),source.sha256);
});
