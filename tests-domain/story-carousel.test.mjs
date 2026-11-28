import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generationMatchKey} from '../src/generation-match.ts';
import {withCarouselCopy,carouselPlanningPayload} from '../server/story-carousel.mjs';
import {carouselCounts,isCarouselCount,validStoryPlan} from '../src/story-carousel.ts';
import {promptFor} from '../server/openai-image-adapter.mjs';
import {assistCopy,normalizeAssistantRequest} from '../server/text-assistant.mjs';
import {validCarouselBatch,planAdBatch,finishedAdSkillBrief} from '../server/automatic-image-skills.mjs';
const plan={continuity:'Two friends, one white plate, warm window light.',cards:[
  {scene:'Two hands reach for the last slice.',caption:'The last slice?'},
  {scene:'One friend lifts the slice; the central plate is empty.',caption:'All yours.'},
  {scene:'Close up of basil and cheese on the slice in her hand.',caption:'Basil in every bite.'},
  {scene:'The other friend turns to the server; the plate stays empty.',caption:'Order another pizza.'}]};
const request={mode:'creative',productProfile:{category:'services'},output:{format:'4:5',locale:'en',compositionKey:'approved'},subjectType:'service',copy:{title:'Original',description:'Original'},creativeDirection:{visual:{id:'auto'},copyMode:'ai',direction:{id:'brand'}}};
test('each feed card receives the approved caption, the same reference context and its ordered scene',()=>{
  const slots=planAdBatch(request,4,plan);
  for(const [i,slot] of slots.entries()){
    assert.equal(slot.batchDirection.position,i+1);
    assert.equal(generationMatchKey(slot),generationMatchKey(request));
    const rendered=withCarouselCopy(slot);
    assert.equal(rendered.copy.title,plan.cards[i].caption);
    assert.equal(rendered.copy.description,'');
    assert.equal(rendered.creativeDirection.copyMode,'manual');
    assert.equal(rendered.creativeDirection.ctaPolicy,i===3?'customer-requested':'omit');
    const prompt=promptFor(slot);
    assert.ok(prompt.includes(JSON.stringify(plan.cards[i].caption)));
    assert.ok(!prompt.includes(JSON.stringify(plan.cards[(i+1)%4].caption)));
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

const sizedPlan=count=>({...plan,cards:Array.from({length:count},(_,i)=>({scene:`Distinct approved moment ${i+1}.`,caption:`Approved headline ${i+1}.`}))});

test('all supported feed lengths preserve their exact order, approved copy and reference assets',()=>{
  const source={sha256:'a'.repeat(64),purpose:'subject'},references=[{sha256:'b'.repeat(64),purpose:'style'}];
  for(const count of carouselCounts){
    const approved=sizedPlan(count),input={...request,source,references};
    assert.equal(isCarouselCount(count),true);
    assert.equal(validStoryPlan(approved),true);
    assert.equal(validStoryPlan(approved,count),true);
    assert.equal(validStoryPlan(approved,count===4?6:4),false);
    assert.equal(validCarouselBatch(approved,input,count),true);
    assert.equal(validCarouselBatch(approved,input,count===4?6:4),false);
    const slots=planAdBatch(input,count,approved);
    assert.equal(slots.length,count);
    assert.deepEqual(slots.map(slot=>slot.batchDirection.position),Array.from({length:count},(_,i)=>i+1));
    for(const [i,slot] of slots.entries()){
      assert.deepEqual(slot.source,source);
      assert.deepEqual(slot.references,references);
      assert.equal(slot.output.format,'4:5');
      assert.equal(slot.batchDirection.count,count);
      assert.equal(slot.batchDirection.caption,approved.cards[i].caption);
      assert.equal(withCarouselCopy(slot).copy.title,approved.cards[i].caption);
      assert.equal(withCarouselCopy(slot).creativeDirection.ctaPolicy,i===count-1?'customer-requested':'omit');
      assert.equal(generationMatchKey(slot),generationMatchKey(input));
      assert.ok(slot.batchDirection.direction.includes(JSON.stringify(approved.cards[i].scene)));
    }
  }
});

test('unsupported counts and malformed or repeated scenes are rejected without changing standard batches',()=>{
  const raw={kind:'carousel-plan',requestId:'feed-invalid-count',targetLocale:'ko',brief:'실제 상품 사진으로 소개해주세요.'};
  for(const count of [0,1,3,5,7,9,11,-2,2.5,'4',null,NaN,Infinity,[],{}]){
    assert.equal(isCarouselCount(count),false);
    assert.throws(()=>normalizeAssistantRequest({...raw,count}),/INVALID_ASSISTANT_REQUEST/);
  }
  assert.equal(validStoryPlan(sizedPlan(3)),false);
  assert.equal(validStoryPlan(sizedPlan(4),1),false);
  assert.equal(validStoryPlan({...sizedPlan(6),extra:'unexpected'}),false);
  const repeated=sizedPlan(8);repeated.cards[7].scene=' '+repeated.cards[0].scene+' ';
  assert.equal(validStoryPlan(repeated),false);
  const empty=sizedPlan(10);empty.cards[5].caption=' ';
  assert.equal(validStoryPlan(empty),false);
  assert.equal(validCarouselBatch(sizedPlan(2),{output:{format:'1:1'}},2),false);
  assert.equal(validCarouselBatch(undefined,{output:{format:'1:1'}},1),true);
});

test('a legacy four-card request keeps its idempotency fingerprint and remains valid after repeated normalization',async()=>{
  const raw={kind:'carousel-plan',requestId:'legacy-four-cards',targetLocale:'en',brief:'One more pizza.'};
  const normalized=normalizeAssistantRequest(raw);
  assert.equal(JSON.stringify(normalized),JSON.stringify(raw));
  assert.deepEqual(normalizeAssistantRequest(normalized),normalized);
  const payload=carouselPlanningPayload(normalized);
  assert.equal(payload.response_format.json_schema.schema.properties.cards.minItems,4);
  assert.equal(payload.response_format.json_schema.schema.properties.cards.maxItems,4);
  const result=await assistCopy({request:raw,apiKey:'test',fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(plan)}}],usage:{prompt_tokens:80,completion_tokens:40}})});
  assert.deepEqual(result.plan,plan);
});

test('planner schema, pacing and response validation use the requested count for every supported length',async t=>{
  for(const count of carouselCounts)await t.test(`${count} cards`,async()=>{
    const raw={kind:'carousel-plan',requestId:`feed-count-${count}`,targetLocale:'ko',count,brief:'실제 라떼 사진의 컵·로고를 유지. 사람·구매 유도 문구 없이 소개.',photo:'data:image/jpeg;base64,/9j/AAAA'};
    const normalized=normalizeAssistantRequest(raw);
    assert.equal(normalized.count,count);
    assert.deepEqual(normalizeAssistantRequest(normalized),normalized);
    const approved=sizedPlan(count);
    const mock=proposal=>async(_url,init)=>{
      const payload=JSON.parse(init.body),cardsSchema=payload.response_format.json_schema.schema.properties.cards;
      assert.equal(cardsSchema.minItems,count);
      assert.equal(cardsSchema.maxItems,count);
      assert.equal(payload.response_format.json_schema.strict,true);
      assert.ok(payload.max_completion_tokens>=1800&&payload.max_completion_tokens<=4200);
      if(count>4)assert.ok(payload.max_completion_tokens>1800);
      assert.match(payload.messages[0].content,new RegExp(`exactly ${count} consecutive 4:5`));
      assert.match(payload.messages[0].content,/Honor every customer restriction on people, copy and CTA/);
      assert.match(payload.messages[0].content,/Never invent prices/);
      const context=JSON.parse(payload.messages[1].content[0].text);
      assert.deepEqual(context,{language:'ko',count,brief:raw.brief});
      assert.equal(payload.messages[1].content[1].image_url.url,raw.photo);
      return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(proposal)}}],usage:{prompt_tokens:80,completion_tokens:40}});
    };
    const run=proposal=>assistCopy({request:raw,apiKey:'test',fetchImpl:mock(proposal)});
    assert.deepEqual((await run(approved)).plan,approved);
    await assert.rejects(run(sizedPlan(count===4?6:4)),error=>error.code==='PROVIDER_INVALID_RESPONSE');
  });
});
