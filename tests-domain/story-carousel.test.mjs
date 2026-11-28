import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assistCopy,normalizeAssistantRequest} from '../server/text-assistant.mjs';
import {validCarouselBatch,planAdBatch,finishedAdSkillBrief} from '../server/automatic-image-skills.mjs';
const plan={continuity:'Two friends, one white plate, warm window light.',cards:[
  {scene:'Two hands reach for the last slice.',caption:'The last slice?'},
  {scene:'One friend lifts the slice; the central plate is empty.',caption:'All yours.'},
  {scene:'Close up of basil and cheese on the slice in her hand.',caption:'Basil in every bite.'},
  {scene:'The other friend turns to the server; the plate stays empty.',caption:'Order another pizza.'}]};
const request={output:{format:'4:5'},subjectType:'service',copy:{title:'Original',description:'Original'},creativeDirection:{copyMode:'ai',direction:{id:'brand'}}};
test('each feed card receives the approved caption, the same reference context and its ordered scene',()=>{
  const slots=planAdBatch(request,4,plan);
  for(const [i,slot] of slots.entries()){
    assert.equal(slot.batchDirection.position,i+1);
    assert.equal(slot.copy.title,plan.cards[i].caption);
    assert.equal(slot.copy.description,'');
    assert.equal(slot.creativeDirection.copyMode,'manual');
    assert.equal(slot.creativeDirection.ctaPolicy,i===3?'customer-requested':'omit');
    assert.ok(finishedAdSkillBrief(slot).includes(plan.continuity));
    assert.ok(slot.batchDirection.direction.includes(JSON.stringify(plan.cards[i].scene)));
  }
  assert.equal(request.copy.title,'Original');
  assert.ok(validCarouselBatch(plan,request,4));
  assert.ok(!validCarouselBatch(plan,request,2));
  assert.ok(!validCarouselBatch(plan,{output:{format:'9:16'}},4));
  assert.ok(!validCarouselBatch({...plan,cards:Array(4).fill(plan.cards[0])},request,4));
  assert.ok(validCarouselBatch(undefined,request,2));
});
test('photo and brief reach planner, malformed plans cannot be submitted',async()=>{
  const raw={kind:'carousel-plan',requestId:'story-12345678',targetLocale:'en',brief:'One more pizza.',photo:'data:image/jpeg;base64,/9j/AAAA'};
  assert.deepEqual(normalizeAssistantRequest(normalizeAssistantRequest(raw)),raw);
  assert.throws(()=>normalizeAssistantRequest({...raw,photo:'https://example.com'}));
  const mock=proposal=>async(_url,init)=>{
    const payload=JSON.parse(init.body);
    assert.equal(payload.response_format.json_schema.name,'story_carousel');
    assert.equal(payload.messages[1].content[1].image_url.url,raw.photo);
    return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(proposal)}}],usage:{prompt_tokens:80,completion_tokens:40}});
  };
  const run=proposal=>assistCopy({request:raw,apiKey:'test',fetchImpl:mock(proposal)});
  assert.deepEqual((await run(plan)).plan,plan);
  await assert.rejects(run({...plan,cards:plan.cards.slice(1)}));
});
