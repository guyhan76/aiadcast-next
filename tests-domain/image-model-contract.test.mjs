import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {OpenAIImageAdapter,IMAGE_MODEL,IMAGE_REVISION,GENERATION_SIZES,hashBytes} from '../server/openai-image-adapter.mjs';

// No real provider calls: exercise the actual adapter with an injected transport.
for (const endpoint of ['generations','edits']) {
 for (const [format,size] of Object.entries(GENERATION_SIZES)) {
  test(`2.6 Sunburst ${endpoint} retains ${format} PNG request/response contract`,async()=>{
   const [width,height]=size.split('x').map(Number);
   const bytes=await sharp({create:{width,height,channels:3,background:'#123456'}}).png().toBuffer();
   const source={bytes:Buffer.from('reference fixture bytes'),mime:'image/png'};
   const usage={input_tokens:30,input_tokens_details:{text_tokens:10,image_tokens:20},output_tokens:100};
   let calls=0;
   const adapter=new OpenAIImageAdapter({apiKey:'fixture-only',fetchImpl:async(url,options)=>{
    calls++;
    assert.equal(url,`https://api.openai.com/v1/images/${endpoint}`);
    assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    assert.equal(options.headers['X-Client-Request-Id'],'attempt-fixture');
    const form=endpoint==='edits';
    const body=form?Object.fromEntries(options.body):JSON.parse(options.body);
    assert.equal(body.model,'gpt-image-2.6-sunburst');
    assert.equal(body.quality,'high');assert.equal(String(body.n),'1');
    assert.equal(body.output_format,'png');assert.equal(body.size,size);
    assert.ok(body.prompt.length>0);
    if(form)assert.deepEqual(Buffer.from(await body.image.arrayBuffer()),source.bytes);
    return Response.json({data:[{b64_json:bytes.toString('base64')}],usage},{headers:{'x-request-id':'req_fixture'}});
   }});
   const result=await adapter.generate({request:{mode:endpoint==='edits'?'creative':'original',productProfile:{category:'other'},output:{format}},source:endpoint==='edits'?source:null,attemptId:'attempt-fixture'});
   assert.equal(calls,1);assert.equal(IMAGE_MODEL,'gpt-image-2.6-sunburst');
   assert.ok(IMAGE_REVISION.startsWith(IMAGE_MODEL+'/'));
   assert.equal(result.model,IMAGE_MODEL);assert.equal(result.revision,IMAGE_REVISION);
   assert.equal(result.width,width);assert.equal(result.height,height);
   assert.equal(result.sha256,hashBytes(bytes));assert.deepEqual(result.bytes,bytes);
   assert.deepEqual(result.usage,usage);assert.equal(result.cost.microUsd,3210);
   assert.equal(result.providerRequestId,'req_fixture');
  });
 }
}
