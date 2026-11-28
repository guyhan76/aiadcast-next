import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript-compiler';
import {newProject,importProject} from '../src/model.ts';
import {starterProject,prepareCampaign} from '../src/consumer-campaign.ts';
import {batchPrice} from '../src/batch-price.ts';
import {carouselCounts} from '../src/story-carousel.ts';

// Run the real submission function with in-memory transport and persistence.
// No request may reach storage or the server before plan/quote validation.
let source=await readFile(new URL('../src/submit-ad-batch.ts',import.meta.url),'utf8');
for(const name of ['generation','generation-input','generation-match','ai-dimension-display','story-carousel']){
  source=source.replace(`from './${name}'`,`from ${JSON.stringify(new URL(`../src/${name}.ts`,import.meta.url).href)}`);
}
source=source
  .replace("import {preflightProportions} from './proportion-browser';","const preflightProportions=async()=>null;")
  .replace("import {apiRequest} from './generation-client';","const apiRequest=async(path,body)=>{globalThis.carouselSubmission.requests.push({path,body});return {id:body.batch.id};};")
  .replace("import {storageNamespace} from './beta-session';","const storageNamespace=()=>globalThis.carouselSubmission.owner;")
  .replace("import {saveProject} from './storage';","const saveProject=async(project,owner)=>{globalThis.carouselSubmission.saved.push({project,owner});};");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {submitAdBatch}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const plan=count=>({continuity:'Same cafe, white cup, soft morning light.',cards:Array.from({length:count},(_,i)=>({scene:`Moment ${i+1}: the same white cup in the cafe.`,caption:`Coffee moment ${i+1}`}))});
const price=count=>batchPrice({available:0,credits:{available:100}},count);
function project(count){
  const p=starterProject('services');
  return prepareCampaign({...p,productName:'Morning coffee',productProfile:{...p.productProfile,material:'Introduce the coffee.'},storyCarousel:true,storyPlan:plan(count),format:'4:5',requestedImageCount:count});
}
beforeEach(()=>{globalThis.carouselSubmission={owner:'owner-a',saved:[],requests:[]};});

test('the approved six-card plan, quote, order and format reach one batch request',async()=>{
  const p=project(6),quote=price(6),result=await submitAdBatch(p,quote,'owner-a');
  const {requests,saved}=globalThis.carouselSubmission;
  assert.equal(requests.length,1);assert.equal(saved.length,1);
  assert.equal(requests[0].path,'/api/generations');
  assert.equal(requests[0].body.batch.count,6);
  assert.equal(requests[0].body.batch.quote.creditsUsed,30);
  assert.equal(requests[0].body.request.output.format,'4:5');
  assert.deepEqual(requests[0].body.batch.storyPlan,p.storyPlan);
  assert.equal(saved[0].project.id,result.id);
  assert.equal(saved[0].owner,'owner-a');
});

test('stale plans, mismatched quotes and non-feed formats create neither drafts nor requests',async()=>{
  const p=project(6);
  for(const [draft,quote] of [
    [p,price(4)],
    [{...p,storyPlan:plan(4)},price(6)],
    [{...p,storyPlan:undefined},price(6)],
    [{...p,format:'9:16'},price(6)],
    [{...p,requestedImageCount:1},price(6)],
    [p,{...price(6),count:3}]
  ])await assert.rejects(submitAdBatch(draft,quote,'owner-a'),/INVALID_STORY_PLAN/);
  assert.deepEqual(globalThis.carouselSubmission.saved,[]);
  assert.deepEqual(globalThis.carouselSubmission.requests,[]);
});

test('a changed account cannot save or submit another owner’s approved plan',async()=>{
  await assert.rejects(submitAdBatch(project(4),price(4),'another-owner'),/SESSION_CHANGED/);
  assert.deepEqual(globalThis.carouselSubmission.saved,[]);
  assert.deepEqual(globalThis.carouselSubmission.requests,[]);
});

test('new batch sizes and individually saved cards retain their storyboard when imported',async()=>{
  for(const count of carouselCounts){
    const p={...newProject(),storyCarousel:true,storyPlan:plan(count),format:'4:5',requestedImageCount:count};
    assert.deepEqual((await importProject(p)).storyPlan,p.storyPlan);
    // BatchResults deliberately saves each selected output as one editable ad.
    const single={...p,requestedImageCount:1,adBatch:undefined};
    const restored=await importProject(single);
    assert.equal(restored.requestedImageCount,1);
    assert.deepEqual(restored.storyPlan,p.storyPlan);
  }
});
