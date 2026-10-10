import {boxGeometry,parseBoxSize} from './box-geometry';
import {boxProjectionReady,projectBoxPixels} from './box-projection';
import type {Project} from './model';

let sourceCache:{hash:string;pixels:ImageData}|null=null;
let outputCache:{key:string;canvas:HTMLCanvasElement;model:ReturnType<typeof boxGeometry>}|null=null;
export function boxTexture(photo:HTMLImageElement,p:Project,width:number,height:number){
 if(!boxProjectionReady(p)||!p.product)throw Error('BOX_PROJECTION_NOT_READY');
 const w=Math.max(4,Math.round(width)),h=Math.max(4,Math.round(height));
 const key=JSON.stringify([p.product.sha256,p.boxProjection!.corners,p.dimensions.width,p.dimensions.depth,p.dimensions.height,w,h]);
 if(outputCache?.key===key)return outputCache;
 if(sourceCache?.hash!==p.product.sha256){
  // Keep original bytes in the project; only the sampling buffer is bounded for mobile memory.
  const scale=Math.min(1,2048/Math.max(photo.naturalWidth,photo.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(4,Math.round(photo.naturalWidth*scale));canvas.height=Math.max(4,Math.round(photo.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(photo,0,0,canvas.width,canvas.height);
  sourceCache={hash:p.product.sha256,pixels:ctx.getImageData(0,0,canvas.width,canvas.height)};
 }
 const model=boxGeometry(parseBoxSize(p.dimensions),{width:w,height:h,padding:Math.min(w,h)/6});
 const pixels=projectBoxPixels(sourceCache.pixels,p.boxProjection!.corners,model);
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels),w,h),0,0);
 outputCache={key,canvas,model};return outputCache;
}
