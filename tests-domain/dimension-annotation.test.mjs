import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {newProject} from '../src/model.ts';
import {parseAnnotation,annotationSnapshot,annotationPlan,annotationIncomplete} from '../src/dimension-annotation.ts';
import {dimensionAnalysisService} from '../server/vision-evaluation/service.mjs';
import {sourceHash} from '../server/vision-evaluation/analysis.mjs';
const proposal=()=>({located:true,product:[.1,.2,.4,.35],axes:{width:[[.12,.5],[.36,.5]],depth:[[.36,.5],[.48,.4]],height:[[.48,.4],[.48,.22]]},protectedText:[[.1,.04,.8,.08],[.1,.82,.8,.08]],existingAnnotations:[],inset:[.65,.35,.3,.4]});
test('annotation imports are backward compatible and retain modes and adjusted points',()=>{
 assert.equal(parseAnnotation(undefined),undefined);
 const input={mode:'inset',snapshot:'saved-snapshot',proposal:proposal(),adjusted:true};
 const parsed=parseAnnotation(JSON.parse(JSON.stringify(input)));assert.deepEqual(parsed,input);
 parsed.proposal.axes.width[0][0]=.2;assert.equal(input.proposal.axes.width[0][0],.12);
 for(const bad of [{...input,mode:'auto-charge'},{...input,proposal:{...proposal(),axes:{width:[[0,0],[0,0]]}}},{...input,proposal:{...proposal(),protectedText:[[0,0,2,2]]}},{...input,snapshot:'x'.repeat(501)}])assert.throws(()=>parseAnnotation(bad));
});
test('changing source, dimensions or dimension basis invalidates saved positions but format does not',()=>{
 const p=newProject();p.generated={asset:{sha256:'original'}};const key=annotationSnapshot(p);
 assert.notEqual(annotationSnapshot({...p,dimensions:{...p.dimensions,width:'301'}}),key);
 assert.notEqual(annotationSnapshot({...p,generated:{asset:{sha256:'other'}}}),key);
 assert.notEqual(annotationSnapshot({...p,generation:{...p.generation,dimensionBasis:'inner-body'}}),key);
 assert.equal(annotationSnapshot({...p,format:'1:1'}),key);
});
test('client and server share exact-label placement and cannot cover protected prices',()=>{
 const dimensions={width:'300.125',depth:'200',height:'100'};
 assert.equal(annotationPlan(proposal(),dimensions,'main',800,1000).planned[0].text,'300.125 mm');
 assert.throws(()=>annotationPlan({...proposal(),protectedText:[[0,0,1,1]]},dimensions,'main',800,1000));
 assert.throws(()=>annotationPlan({...proposal(),inset:[.1,.2,.3,.3]},dimensions,'inset',800,1000));
});
test('production analysis defaults closed even with an existing server key; it never initializes budget or calls provider',async()=>{
 let called=0;const service=dimensionAnalysisService({apiKey:'existing-mock-key',ledgerFactory:()=>{called++;},analyze:()=>{called++;}});
 assert.equal(service.capability({role:'admin'}).available,false);
 await assert.rejects(service.analyze({}, {role:'admin'}),e=>e.code==='DIMENSION_ANALYSIS_DISABLED');
 await assert.rejects(service.analyze({}, {role:'member'}),e=>e.code==='EVALUATION_ADMIN_ONLY');
 assert.equal(called,0);
});
test('server approval rejects new ads and forged admin fields before paid analysis; existing key stays inside server adapter',async()=>{
 const bytes=await sharp({create:{width:8,height:8,channels:3,background:'white'}}).png().toBuffer();
 const source={data:`data:image/png;base64,${bytes.toString('base64')}`,sha256:sourceHash(bytes),width:8,height:8};
 let calls=0,opened=0;let cached=null;const ledger={async request(){return cached;},async finish(actor,id,result){cached={hash:source.sha256,result_json:JSON.stringify(result)};},close(){}};
 const service=dimensionAnalysisService({evaluationEnabled:true,apiKey:'existing-mock-key',references:[{name:'22932.jpg',bytes:bytes.length}],approvedHashes:{'22932.jpg':source.sha256},ledgerFactory:()=>{opened++;return ledger;},analyze:async options=>{calls++;assert.equal(options.apiKey,'existing-mock-key');assert.equal(typeof options.ledger.reserve,'function');return {proposal:proposal()};}});
 const requestId='reference_request_0001',admin={id:'admin-test',role:'admin'};
 await assert.rejects(service.analyze({requestId,source,role:'admin'}, {role:'member'}),e=>e.code==='EVALUATION_ADMIN_ONLY');
 await assert.rejects(service.analyze({requestId,source:{...source,sha256:'a'.repeat(64)}},admin),e=>e.code==='INVALID_SOURCE');
 const other=await sharp({create:{width:8,height:8,channels:3,background:'black'}}).png().toBuffer();
 await assert.rejects(service.analyze({requestId,source:{...source,data:`data:image/png;base64,${other.toString('base64')}`,sha256:sourceHash(other)}},admin),e=>e.code==='IMAGE_OUTSIDE_ANALYSIS_APPROVAL');
 assert.equal(opened,0);assert.equal(calls,0);
 const result=await service.analyze({requestId,source},admin);assert.equal(calls,1);assert.equal(result.verified,false);assert.equal(result.sourceHash,source.sha256);assert.equal(JSON.stringify(result).includes('existing-mock-key'),false);
 assert.deepEqual(await service.analyze({requestId,source},admin),result);assert.equal(calls,1);await service.close();
});

test('unresolved and stale annotation intent cannot be exported as complete; attempt state survives import',()=>{
 const p=newProject();p.dimensionAnnotation={mode:'inset',snapshot:annotationSnapshot(p),analysisAttempted:true};
 assert.match(annotationIncomplete(p),/미완료/);assert.equal(parseAnnotation(p.dimensionAnnotation).analysisAttempted,true);
 p.generated={asset:{sha256:'source'}};p.dimensionAnnotation.snapshot=annotationSnapshot(p);p.dimensionAnnotation.proposal=proposal();assert.equal(annotationIncomplete(p),null);
 p.dimensions.width='450';assert.match(annotationIncomplete(p),/미완료/);p.dimensionAnnotation.mode='none';assert.equal(annotationIncomplete(p),null);
 assert.throws(()=>parseAnnotation({...p.dimensionAnnotation,analysisAttempted:'false'}));
});

test('single box production service is exact-byte-bound, admin-only and never enables general analysis',async()=>{
 const {singleBoxService}=await import('../server/vision-evaluation/single-box-service.mjs');
 const {BOX_REFERENCE}=await import('../server/vision-evaluation/single-box-approval.mjs');let calls=0,writes=0;
 const bytes=await sharp({create:{width:1080,height:1920,channels:3,background:'white'}}).png().toBuffer();const source={data:'data:image/png;base64,'+bytes.toString('base64'),sha256:sourceHash(bytes),width:1080,height:1920};
 const s=singleBoxService({apiKey:'local-mock',ledgerFactory:()=>{writes++;},statusReader:async()=>({remainingCalls:1,unresolvedCalls:0,allowanceUsedMicros:0}),analyze:()=>{calls++;}}),admin={id:'admin',role:'admin'};
 const status=await s.status(admin);assert.equal(status.limitCalls,1);assert.equal(status.limitMicros,30000);assert.equal(status.references[0].sha256,BOX_REFERENCE.sha256);assert.equal(status.references[0].bytes,BOX_REFERENCE.bytes);assert.equal(status.references.length,1);assert.equal(s.capability(admin).available,false);
 await assert.rejects(s.analyze({requestId:'single_box_request_01',source},admin),e=>e.code==='IMAGE_OUTSIDE_ANALYSIS_APPROVAL');
 await assert.rejects(s.analyze({requestId:'single_box_request_01',source:{...source,sha256:BOX_REFERENCE.sha256}},admin),e=>e.code==='INVALID_SOURCE');
 await assert.rejects(s.analyze({requestId:'single_box_request_01',source},{role:'member'}),e=>e.code==='EVALUATION_ADMIN_ONLY');assert.equal(calls,0);assert.equal(writes,0);
});

test('single box payload stays under the approved hold, pins standard pricing and excludes flaps and numeric tables',async()=>{
 const {prepareAnalysis}=await import('../server/vision-evaluation/analysis.mjs');const {SINGLE_BOX_INSTRUCTION}=await import('../server/vision-evaluation/single-box-service.mjs');
 const bytes=await sharp({create:{width:1080,height:1920,channels:3,background:'white'}}).png().toBuffer();const p=await prepareAnalysis(bytes,SINGLE_BOX_INSTRUCTION);
 assert.ok(p.costBoundMicros<=30000);assert.equal(p.payload.service_tier,'default');assert.equal(p.payload.n,1);assert.equal(p.payload.max_completion_tokens,1500);assert.equal(p.payload.store,false);assert.match(p.payload.messages[0].content,/excluding open flaps/);assert.match(p.payload.messages[0].content,/numeric specification TABLE/);
});
