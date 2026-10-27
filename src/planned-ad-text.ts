import {isImageFormat,getImageFormat} from './formats.ts';
import {exactAdText,type ExactAdText} from './exact-ad-text.ts';
export type TextRegion={x:number;y:number;width:number;height:number};
export type PlannedAdText=Omit<ExactAdText,'version'>&{version:2;plan:{version:1;format:string;id:'upper-wide'|'upper-left'|'upper-right';region:TextRegion;background:[number,number,number];ink:string;padding:number;minFont:number;maxFont:number}};
// Pre-generation contract, never a guessed empty area in a completed photograph.
// Deliberately conservative: variable placement, but only a flat reserved area is accepted.
export function plannedAdText(input:Parameters<typeof exactAdText>[0],format:string):PlannedAdText{
 if(!isImageFormat(format))throw Error('INVALID_EXACT_TEXT');
 const {version:_,...text}=exactAdText(input),length=[text.company,text.product,...text.offers].join('').length;
 if(!text.product&&!text.company&&!text.offers.length)throw Error('INVALID_EXACT_TEXT');
 const seed=[text.company,text.product,...text.offers].join('|');let hash=0;for(const ch of seed)hash=(Math.imul(hash,31)+ch.codePointAt(0)!)>>>0;
 const dimensions=getImageFormat(format),wide=dimensions.height>dimensions.width||length>90,id=wide?'upper-wide':hash%2?'upper-left':'upper-right';
 const region=wide?{x:.06,y:.05,width:.88,height:length>130?.30:.24}:{x:id==='upper-left'?.05:.51,y:.06,width:.44,height:.36};
 const dark=hash%3===0;
 return {...text,version:2,plan:{version:1,format,id,region,background:dark?[20,24,30]:[248,245,239],ink:dark?'#ffffff':'#15191f',padding:.022,minFont:.032,maxFont:.052}};
}
export function plannedRegionPixels(plan:PlannedAdText['plan'],frame:{x:number;y:number;w:number;h:number}){
 const r=plan.region;return {x:Math.floor(frame.x+r.x*frame.w),y:Math.floor(frame.y+r.y*frame.h),width:Math.ceil(r.width*frame.w),height:Math.ceil(r.height*frame.h)};
}
// Check every pixel, including the safety margin. No OCR, subject recognition or
// claim of semantic correctness. Any texture/edge/lettering fails closed.
export function reservedPixelsConform(pixels:Uint8ClampedArray,background:readonly number[]){
 if(!pixels.length||pixels.length%4)return false;
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]!==255)return false;for(let c=0;c<3;c++)if(Math.abs(pixels[i+c]-background[c])>6)return false;}
 return true;
}
