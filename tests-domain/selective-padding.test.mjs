import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareSelectiveProviderInput,cropSelectiveProviderResult,compositeSelectiveEdit,selectiveCanvasPlan} from '../server/selective-image-edit.mjs';
import {OpenAIImageAdapter,hashBytes} from '../server/openai-image-adapter.mjs';
const model='gpt-image-2.6-sunburst';
async function png(raw,width,height){const bytes=await sharp(raw,{raw:{width,height,channels:4}}).png().toBuffer();return {bytes,width,height,mime:'image/png',sha256:hashBytes(bytes)};}
for(const [w,h,cw,ch,left,top] of [[1024,1024,1024,1024,0,0],[1024,1536,1024,1536,0,0],[1536,1024,1536,1024,0,0],[1024,1280,1024,1536,0,128],[864,1536,1024,1536,80,0],[960,1280,1024,1536,32,128],[1536,864,1536,1024,0,80],[7,9,1024,1024,508,507]])test(`lossless pad/crop ${w}x${h}: corners, alpha and original coordinates`,async()=>{
 const raw=Buffer.alloc(w*h*4);for(let i=0;i<raw.length;i++)raw[i]=(i*37)%256;raw[7]=0;raw[11]=255;
 const mr=Buffer.alloc(w*h*4,255),corners=[0,w-1,(h-1)*w,w*h-1];for(const p of corners)mr[p*4+3]=0;
 const source=await png(raw,w,h),mask=await png(mr,w,h),originalHash=hashBytes(source.bytes);
 const p=await prepareSelectiveProviderInput({model,source,mask});assert.deepEqual(p.plan,{width:w,height:h,canvasWidth:cw,canvasHeight:ch,left,top});
 const pr=await sharp(p.source.bytes).raw().toBuffer(),pm=await sharp(p.mask.bytes).raw().toBuffer();
 for(let y=0;y<ch;y++){if(y>=top&&y<top+h){assert.deepEqual(pr.subarray((y*cw+left)*4,(y*cw+left+w)*4),raw.subarray((y-top)*w*4,(y-top+1)*w*4));}for(let x=0;x<cw;x++){const inside=x>=left&&x<left+w&&y>=top&&y<top+h;assert.equal(pm[(y*cw+x)*4+3],inside?mr[((y-top)*w+x-left)*4+3]:255);}}
 const generatedRaw=Buffer.alloc(cw*ch*4);for(let i=0;i<generatedRaw.length;i++)generatedRaw[i]=(i*13+71)%256;
 const generated=await png(generatedRaw,cw,ch),cropped=await cropSelectiveProviderResult(generated.bytes,p.plan);assert.equal(cropped.width,w);assert.equal(cropped.height,h);
 const cr=await sharp(cropped.bytes).raw().toBuffer();for(let y=0;y<h;y++)assert.deepEqual(cr.subarray(y*w*4,(y+1)*w*4),generatedRaw.subarray(((y+top)*cw+left)*4,((y+top)*cw+left+w)*4));
 const final=await compositeSelectiveEdit(source,mask,cropped),fr=await sharp(final.bytes).raw().toBuffer(),expected=Buffer.from(raw);for(const pt of corners)cr.copy(expected,pt*4,pt*4,pt*4+4);assert.deepEqual(fr,expected);assert.equal(final.width,w);assert.equal(final.height,h);assert.equal(hashBytes(source.bytes),originalHash);
 const wrong=await png(Buffer.alloc(8*8*4,255),8,8);await assert.rejects(cropSelectiveProviderResult(wrong.bytes,p.plan),/PROVIDER_INVALID_IMAGE/);
});
test('oversized originals never resize or invoke transport',async()=>{for(const dims of [[1537,1],[1,1537],[1025,1025],[1600,1600]])assert.throws(()=>selectiveCanvasPlan(...dims),/UNSUPPORTED_EDIT_SIZE/);let calls=0;const adapter=new OpenAIImageAdapter({apiKey:'mock-only',fetchImpl:()=>calls++});adapter.selectiveEditReady=true;await assert.rejects(adapter.editRegion({source:{width:1600,height:1600},mask:{}}),/UNSUPPORTED_EDIT_SIZE/);assert.equal(calls,0);});
test('actual edit adapter pads multipart and returns original size using mocked fetch',async()=>{
 const w=864,h=1536,source=await png(Buffer.alloc(w*h*4,124),w,h),mask=await png(Buffer.alloc(w*h*4,0),w,h);let calls=0;
 const adapter=new OpenAIImageAdapter({apiKey:'mock-only',fetchImpl:async(url,{body})=>{calls++;assert.equal(body.get('size'),'1024x1536');const mb=Buffer.from(await body.get('mask').arrayBuffer()),mr=await sharp(mb).raw().toBuffer();assert.equal(mr[3],255);assert.equal(mr[80*4+3],0);const out=await png(Buffer.alloc(1024*1536*4,210),1024,1536);return new Response(JSON.stringify({data:[{b64_json:out.bytes.toString('base64')}]}));}});adapter.selectiveEditReady=true;
 const result=await adapter.editRegion({source,mask,prompt:'mock',attemptId:'mock'});assert.equal(calls,1);assert.equal(result.width,w);assert.equal(result.height,h);assert.deepEqual(await sharp(result.bytes).raw().toBuffer(),Buffer.alloc(w*h*4,210));assert.equal(result.cost,null);
});
