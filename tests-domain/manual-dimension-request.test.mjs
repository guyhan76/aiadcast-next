import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {generationInputs} from '../src/generation-input.ts';
import {GenerationService,normalizeGenerationRequest} from '../server/generation-service.mjs';
import {promptFor} from '../server/openai-image-adapter.mjs';
const bytes=await sharp({create:{width:864,height:1536,channels:3,background:'white'}}).png().toBuffer();
function project(locale='ko',mode='main') {const p=starterProject('other');return prepareCampaign({...p,locale,productName:'Laptop',product:{name:'p.png',data:'data:image/png;base64,'+bytes.toString('base64'),width:864,height:1536,sha256:createHash('sha256').update(bytes).digest('hex')},productProfile:{...p.productProfile,specType:'rectangular',material:'actual facts'},dimensions:{...p.dimensions,width:'364',depth:'266',height:'30.23',displayUnit:'mm',visible:true,lines:false},dimensionAnnotation:{method:'manual',mode,snapshot:''}});}
for(const locale of ['ko','en'])for(const layout of ['main','inset'])test(`manual ${layout} clean base ${locale} keeps numbers separate and no analysis`,()=>{
 const p=project(locale,layout),r=normalizeGenerationRequest(buildGenerationRequest(p));
 assert.equal(r.output.manualDimensionBase,true);assert.equal(r.dimensionDisplay,undefined);assert.equal(r.output.showDimensions,false);assert.equal(r.output.showDimensionLines,false);
 assert.deepEqual(r.specifications.map(s=>s.value),['364','266','30.23']);assert.equal(JSON.parse(r.output.compositionKey).manualDimensionBase,true);
 assert.match(promptFor(r),/MANUAL DIMENSION BASE/);assert.match(promptFor(r),/NO dimension numbers/);assert.doesNotMatch(promptFor(r),/AI DIMENSION DISPLAY:/);
});
test('manual payload rejects conflicting render intent before reservation or provider',async t=>{
 let calls=0;const s=new GenerationService({enabled:true,providerConfigured:true,budgetMicros:1000000,adapter:{generate:async()=>{calls++;throw Error('unexpected');}}});t.after(()=>s.close());
 const p=project(),r=buildGenerationRequest(p),before=s.wallet();
 for(const patch of [{showDimensions:true},{manualDimensionBase:false},{compositionKey:'{}'}])await assert.rejects(s.create({projectId:p.id,requestId:randomUUID(),request:{...r,output:{...r.output,...patch}},...generationInputs(p)}),/INVALID_MANUAL_DIMENSIONS/);
 assert.equal(calls,0);assert.deepEqual(s.wallet(),before);
});
test('existing no-dimensions path retains old request shape',()=>{const p=project();p.dimensionAnnotation.mode='none';p.dimensions.visible=false;const r=normalizeGenerationRequest(buildGenerationRequest(p));assert.equal('manualDimensionBase' in r.output,false);assert.equal(r.output.showDimensions,false);});

test('recovery snapshot agrees across normalization and changes with creative input',async()=>{
 const {generationMatchKey}=await import('../src/generation-match.ts');
 for(const locale of ['ko','en'])for(const layout of ['main','inset']){const p=project(locale,layout),r=buildGenerationRequest(p),n=normalizeGenerationRequest(r);assert.equal(generationMatchKey(r),generationMatchKey(n));const changed=structuredClone(r);changed.brief+=' Different scene';assert.notEqual(generationMatchKey(changed),generationMatchKey(n));assert.equal(generationMatchKey({...r,clientPrice:0}),generationMatchKey(r));}
});
