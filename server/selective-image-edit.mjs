import sharp from 'sharp';
import {hashBytes,parseSourceAsset,validateImage,ProviderFailure} from './openai-image-adapter.mjs';
const MAX_MASK=4_000_000-1,MAX_PIXELS=8294400;
export async function prepareSelectiveEdit(original,mask){
 const source=await parseSourceAsset({...original,data:original?.dataUrl});
 if(!source||source.width*source.height>MAX_PIXELS)throw Error('INVALID_EDIT_SOURCE');
 const selected=await parseSourceAsset(mask);
 if(!selected||selected.mime!=='image/png'||selected.bytes.length>MAX_MASK||selected.width!==source.width||selected.height!==source.height)throw Error('INVALID_EDIT_MASK');
 const rgba=await sharp(selected.bytes).ensureAlpha().raw().toBuffer();let count=0;
 for(let i=3;i<rgba.length;i+=4){if(rgba[i]!==0&&rgba[i]!==255)throw Error('INVALID_EDIT_MASK');if(rgba[i]===0)count++;}
 if(!count)throw Error('EMPTY_EDIT_MASK');
 const bytes=await sharp(source.bytes).ensureAlpha().png().toBuffer();
 const meta=await validateImage(bytes,'image/png',{maximumPixels:MAX_PIXELS});
 return {source:{...meta,bytes},mask:selected,selectedPixels:count};
}
export async function compositeSelectiveEdit(original,mask,generated){
 // Never resize or recolor the original. Copy complete RGBA tuples only where alpha=0.
 const meta=await validateImage(generated.bytes,'image/png',{maximumPixels:MAX_PIXELS,maximumBytes:16000000});
 if(meta.width!==original.width||meta.height!==original.height)throw new ProviderFailure('PROVIDER_INVALID_IMAGE');
 const [a,b,m]=await Promise.all([original.bytes,generated.bytes,mask.bytes].map(bytes=>sharp(bytes).ensureAlpha().raw().toBuffer()));
 for(let i=0;i<a.length;i+=4)if(m[i+3]===0)b.copy(a,i,i,i+4);
 const bytes=await sharp(a,{raw:{width:original.width,height:original.height,channels:4}}).png().toBuffer();
 // Keep the existing client/source parser contract; never resize to hide overflow.
 try{await validateImage(bytes,'image/png',{maximumPixels:MAX_PIXELS});}catch{throw new ProviderFailure('PROVIDER_INVALID_IMAGE');}
 return {...generated,bytes,mime:'image/png',width:original.width,height:original.height,sha256:hashBytes(bytes),role:'creative',composition:'complete-ad'};
}
// Model and reservation approval remain a server-side release gate. No automatic model fallback.
export const SELECTIVE_EDIT_MODELS=new Set(['gpt-image-2.6-sunburst','gpt-image-2.5-sunburst','gpt-image-2.5-sunburst-2026-09-08']);
export function validateSelectiveEditContract({model,source,mask}){
 if(!SELECTIVE_EDIT_MODELS.has(model))throw new ProviderFailure('UNSUPPORTED_EDIT_MODEL',{uncertain:false});
 if(!['1024x1024','1536x1024','1024x1536'].includes(`${source?.width}x${source?.height}`))throw new ProviderFailure('UNSUPPORTED_EDIT_SIZE',{uncertain:false});
 if(source?.mime!=='image/png'||mask?.mime!=='image/png'||mask.width!==source.width||mask.height!==source.height||mask.bytes.length>=4_000_000)throw new ProviderFailure('INVALID_EDIT_MASK',{uncertain:false});
}
export function selectiveEditForm({model,source,mask,prompt}){
 validateSelectiveEditContract({model,source,mask});
 const body=new FormData();body.set('model',model);body.set('n','1');body.set('quality','high');body.set('size',`${source.width}x${source.height}`);body.set('output_format','png');body.set('prompt',prompt);
 body.set('image',new Blob([source.bytes],{type:'image/png'}),'original.png');body.set('mask',new Blob([mask.bytes],{type:'image/png'}),'mask.png');return body;
}

export function selectiveCanvasPlan(width,height){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0)throw new ProviderFailure('UNSUPPORTED_EDIT_SIZE',{uncertain:false});
 const canvas=[[1024,1024],[1024,1536],[1536,1024]].find(([w,h])=>width<=w&&height<=h);
 if(!canvas)throw new ProviderFailure('UNSUPPORTED_EDIT_SIZE',{uncertain:false});
 return {width,height,canvasWidth:canvas[0],canvasHeight:canvas[1],left:Math.floor((canvas[0]-width)/2),top:Math.floor((canvas[1]-height)/2)};
}
export function validateSelectiveOriginal({model,source,mask}){
 if(!SELECTIVE_EDIT_MODELS.has(model))throw new ProviderFailure('UNSUPPORTED_EDIT_MODEL',{uncertain:false});
 const plan=selectiveCanvasPlan(source?.width,source?.height);
 if(source?.mime!=='image/png'||mask?.mime!=='image/png'||mask.width!==source.width||mask.height!==source.height||mask.bytes.length>=4_000_000)throw new ProviderFailure('INVALID_EDIT_MASK',{uncertain:false});
 return plan;
}
export async function prepareSelectiveProviderInput({model,source,mask}){
 const plan=validateSelectiveOriginal({model,source,mask}),{width,height,canvasWidth,canvasHeight,left,top}=plan;
 const padded=[];
 for(const input of [source,mask]){
  const {data,info}=await sharp(input.bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==width||info.height!==height||info.channels!==4)throw new ProviderFailure('INVALID_EDIT_MASK',{uncertain:false});
  // Opaque white padding is protected in the mask. Copy raw tuples, never alpha-composite or resize.
  const out=Buffer.alloc(canvasWidth*canvasHeight*4,255);
  for(let y=0;y<height;y++)data.copy(out,((y+top)*canvasWidth+left)*4,y*width*4,(y+1)*width*4);
  const bytes=await sharp(out,{raw:{width:canvasWidth,height:canvasHeight,channels:4}}).png().toBuffer();
  const meta=await validateImage(bytes,'image/png');padded.push({...meta,bytes});
 }
 const provider={source:padded[0],mask:padded[1],plan};validateSelectiveEditContract({...provider,model});return provider;
}
export async function cropSelectiveProviderResult(bytes,plan){
 const meta=await validateImage(bytes,'image/png',{maximumBytes:16000000,maximumPixels:1536*1024});
 if(meta.width!==plan.canvasWidth||meta.height!==plan.canvasHeight)throw new ProviderFailure('PROVIDER_INVALID_IMAGE');
 const raw=await sharp(bytes).ensureAlpha().raw().toBuffer(),cropped=Buffer.alloc(plan.width*plan.height*4);
 for(let y=0;y<plan.height;y++){const offset=((y+plan.top)*plan.canvasWidth+plan.left)*4;raw.copy(cropped,y*plan.width*4,offset,offset+plan.width*4);}
 const output=await sharp(cropped,{raw:{width:plan.width,height:plan.height,channels:4}}).png().toBuffer();
 return {...await validateImage(output,'image/png'),bytes:output};
}
