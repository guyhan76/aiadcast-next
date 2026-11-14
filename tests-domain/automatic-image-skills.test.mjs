import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {imageRecipes, imageSkills} from '../src/image-skills.ts';
import {newProject} from '../src/model.ts';
import {withCategory} from '../src/product.ts';
import {withCreative} from '../src/creative.ts';
import {buildNewGenerationRequest} from '../src/generation.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {finishedAdSkillBrief} from '../server/automatic-image-skills.mjs';
import {OpenAIImageAdapter, promptFor, hashBytes} from '../server/openai-image-adapter.mjs';

const auto = 'AUTOMATIC IMAGE ART DIRECTION';
function project(category, name, description, note = '') {
  const p = withCreative(withCategory(newProject(), category), {copyMode: 'manual', note});
  p.generation.mode = 'creative'; p.format = '1:1'; p.productName = name;
  p.productProfile.material = description;
  p.copy.ko.title = name; p.copy.ko.description = description;
  return p;
}

test('all 180 unique directions reach the automatic catalog without a command; legacy duplicates keep their constraints', () => {
  const ids = imageRecipes.map(recipe => recipe.id);
  assert.equal(imageSkills.length, 175); assert.equal(new Set(ids).size, 180);
  const catalog = finishedAdSkillBrief({subjectType: 'service'}).split('Catalog:\n')[1];
  const entries = catalog.trim().split('\n').flatMap(line => line.split(': ')[1].split(', ').map(entry => entry.split(' (')[0]));
  assert.deepEqual(entries.sort(), [...ids].sort());
  assert.match(imageRecipes.find(recipe => recipe.id === 'product-explosion').instruction, /VERIFIED components/);
});

test('title, description and extra instructions affect directions without user commands; exclusions and legacy paths are respected', () => {
  const request = normalizeGenerationRequest(buildNewGenerationRequest(project('education', '수강생 모집', '단계별 설명', '창가 빛')));
  const prompt = promptFor(request);
  assert.match(prompt, /\[natural-window-light\]/); assert.match(prompt, /\[event-poster\]/);
  request.copy.title = '새 학기'; request.productName = '새 학기';
  request.creativeDirection.additionalInstructions = '자연광 말고 흰 배경으로';
  const hints = finishedAdSkillBrief(request).split('Catalog:')[0];
  assert.doesNotMatch(hints, /\[natural-window-light\]/);
  assert.match(hints, /\[minimal-white\]/); assert.match(hints, /\[infographic\]/);
  assert.doesNotMatch(finishedAdSkillBrief({subjectType:'physical-product',productProfile:{category:'boxes'},creativeDirection:{additionalInstructions:'without /packaging'}}), /\[packaging\]/);
  request.creativeDirection.additionalInstructions = '/watercolor';
  assert.match(promptFor(request), /\[watercolor\]/); assert.ok(!promptFor(request).includes(auto));
  delete request.output.compositionKey; assert.ok(!promptFor(request).includes(auto));
  assert.equal(finishedAdSkillBrief({inputMode:'text-example'}), '');
});

test('image transport carries customer fields, original photo bytes and automatic directions once; services also work with text only', async () => {
  const pixels = await sharp({create:{width:1024,height:1024,channels:3,background:'#eee'}}).png().toBuffer();
  const asset = {name:'shoe.png',data:'data:image/png;base64,'+pixels.toString('base64'),width:1024,height:1024,sha256:hashBytes(pixels)};
  const shoe = project('shoes', '화이트 스니커즈', '검은 스우시는 외측에만 표시', '사람 없이 신발만 흰 배경');
  assert.throws(() => buildNewGenerationRequest(shoe), /사진/);
  shoe.product = asset;
  const service = project('education', '온라인 한국어 수업', '초급 회화 과정');
  const requests = [shoe, service].map(p => normalizeGenerationRequest(buildNewGenerationRequest(p)));
  const seen = [];
  const adapter = new OpenAIImageAdapter({apiKey:'fixture',fetchImpl:async (url, options) => {
    const body = options.body;
    if (body instanceof FormData) {
      assert.deepEqual(Buffer.from(await body.get('image').arrayBuffer()), pixels);
      seen.push({url,prompt:body.get('prompt'),n:Number(body.get('n'))});
    } else seen.push({url,...JSON.parse(body)});
    return Response.json({data:[{b64_json:pixels.toString('base64')}],usage:{input_tokens:10,input_tokens_details:{text_tokens:10,image_tokens:0},output_tokens:10}});
  }});
  for (const request of requests) await adapter.generate({request,source:request.source ? {mime:'image/png',bytes:pixels} : null,attemptId:'test'});
  assert.equal(seen.length,2);
  assert.match(seen[0].url,/\/images\/edits$/); assert.match(seen[1].url,/\/images\/generations$/);
  assert.match(seen[0].prompt,/\[studio-product\]/); assert.match(seen[0].prompt,/\[minimal-white\]/);
  assert.match(seen[0].prompt,/검은 스우시는 외측에만 표시/);
  assert.match(seen[1].prompt,/\[minimal-poster\]/);
  for (const call of seen) { assert.ok(call.prompt.includes(auto)); assert.equal(call.n,1); }
  requests[1].source={purpose:'style'}; assert.match(finishedAdSkillBrief(requests[1]), /\[minimal-poster\]/);
  requests[1].source={purpose:'subject'}; assert.match(finishedAdSkillBrief(requests[1]), /\[editorial-spread\]/);
});
