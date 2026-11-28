import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/model.ts';
import {withCategory} from '../src/product.ts';
import {withCreative} from '../src/creative.ts';
import {buildGenerationRequest} from '../src/generation.ts';
import {normalizeGenerationRequest} from '../server/generation-service.mjs';
import {promptFor,OpenAIImageAdapter} from '../server/openai-image-adapter.mjs';
for(const copyMode of ['manual','ai'])test(`English overrides Korean source advertising text without converting facts (${copyMode})`,async()=>{
 const p=withCreative(withCategory(newProject(),'boxes'),{copyMode});p.generation.mode='creative';p.locale='en';p.productName='BOX-100';p.product={name:'source.png',data:'data:image/png;base64,fixture',width:300,height:200,sha256:'a'.repeat(64)};p.copy.en={...p.copy.en,title:'더욱 튼튼하게',description:'19,800원 / 배송비 3,000원'};p.productProfile.material=p.copy.en.description;p.dimensions={...p.dimensions,width:'300',depth:'200',height:'100',visible:true,displayUnit:'mm'};
 const r=normalizeGenerationRequest(buildGenerationRequest(p)),prompt=promptFor(r);assert.equal(r.output.locale,'en');assert.equal(r.copy.description,p.copy.en.description);assert.match(prompt,/AD LANGUAGE — ENGLISH/);assert.match(prompt,/headline\/title, description.*shipping\/delivery labels, dimension axis labels/);assert.match(prompt,/takes precedence over verbatim-copy/);assert.match(prompt,/never USD; do not perform currency conversion/);assert.match(prompt,/Translate shipping terms only if supplied/);assert.match(prompt,/actual printing physically on the photographed product/);assert.match(prompt,/Width/);assert.match(prompt,/19,800/);assert.match(prompt,/3,000/);assert.doesNotMatch(prompt,/Typeset the supplied title and description verbatim/);
 let sent;const adapter=new OpenAIImageAdapter({apiKey:'mock-not-a-real-key',fetchImpl:async(_url,options)=>{sent=options.body.get('prompt');return {ok:false,status:400,body:{cancel:async()=>{}}};}});await assert.rejects(()=>adapter.generate({request:r,source:{bytes:Buffer.from('mock'),mime:'image/png'},attemptId:'mock-english'}));assert.equal(sent,prompt);
 p.locale='ko';const ko=promptFor(normalizeGenerationRequest(buildGenerationRequest(p)));assert.doesNotMatch(ko,/AD LANGUAGE — ENGLISH/);if(copyMode==='manual')assert.match(ko,/Typeset the supplied title and description verbatim/);
});
