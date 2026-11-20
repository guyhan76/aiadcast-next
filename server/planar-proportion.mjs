import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {planarOutline,planarRatio} from '../src/planar-proportion.ts';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inspect(bytes){
 const original=await sharp(bytes).metadata();
 const {data,info}=await sharp(bytes).resize({width:512,height:512,fit:'inside',withoutEnlargement:true,kernel:'nearest'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const outline=planarOutline({data,width:info.width,height:info.height});
 if(!outline.bounds)return {outline,original};
 const b=outline.bounds,left=Math.round(b.x*original.width/info.width),top=Math.round(b.y*original.height/info.height),width=Math.round(b.width*original.width/info.width),height=Math.round(b.height*original.height/info.height);
 return {outline,original,crop:{left,top,width:Math.min(width,original.width-left),height:Math.min(height,original.height-top)}};
}
export function requestPlanarRatio(request){const values=Object.fromEntries(request.specifications.map(s=>[s.axis,Number(s.value)]));return planarRatio(values.width,values.depth);}
export async function preparePlanarSource(bytes,ratio){
 const result=await inspect(bytes);if(!result.crop)throw Error('PLANAR_SOURCE_UNCONFIRMED');
 const width=Math.round(768*Math.min(1,ratio)),height=Math.round(width/ratio);
 const product=await sharp(bytes).extract(result.crop).resize(width,height,{fit:'fill'}).png().toBuffer();
 return sharp({create:{width:1024,height:1024,channels:4,background:'#ffffff'}}).composite([{input:product,left:Math.floor((1024-width)/2),top:Math.floor((1024-height)/2)}]).png().toBuffer();
}
export async function controlPlanarResult(bytes,ratio){
 const result=await inspect(bytes),originalHash=hash(bytes);
 const report={version:1,scope:'declared-front-flat-rectangle',state:'unverified',reason:result.outline.reason,expectedRatio:ratio,observedRatio:result.crop?result.crop.width/result.crop.height:null,outputRatio:null,originalHash,geometryVerified:false,identityVerified:false};
 if(!result.crop)return {bytes,report};
 const observed=report.observedRatio,error=Math.abs(observed/ratio-1);
 // Large deviations may be a different object or pose: do not force a match.
 if(error>.25)return {bytes,report:{...report,reason:'large-ratio-mismatch'}};
 const width=Math.round(1024*Math.min(1,ratio)),height=Math.round(width/ratio);
 const corrected=await sharp(bytes).extract(result.crop).resize(width,height,{fit:'fill'}).png().toBuffer();
 const actual=await sharp(corrected).metadata();
 return {bytes:corrected,report:{...report,state:error>.01?'adjusted':'within-tolerance',reason:'isolated-plane-only',outputRatio:actual.width/actual.height}};
}
