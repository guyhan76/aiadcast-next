import type {LoadedVideoScene} from './video-compose';
import {getVideoFormat,type VideoRatio} from './video-formats';
import type {PhotoFrameLayout} from './video-prompt';

export type OpeningStill={data:string;index:number;active:boolean;referenceOnly?:boolean};

export function prepareOpeningStill(scenes:LoadedVideoScene[],ratio:VideoRatio,layout?:PhotoFrameLayout,photoFitsOpening=true):OpeningStill|undefined {
  if(!scenes.length)return;
  const index=layout&&Number.isInteger(layout.source)&&scenes[layout.source-1]?layout.source-1:0;
  const visual=scenes[index].visual;
  const sw=visual instanceof HTMLVideoElement?visual.videoWidth:visual.naturalWidth;
  const sh=visual instanceof HTMLVideoElement?visual.videoHeight:visual.naturalHeight;
  if(!sw||!sh)return;
  const format=getVideoFormat(ratio);
  const canvas=document.createElement('canvas');
  const scale=1024/Math.max(format.width,format.height);
  const w=canvas.width=Math.round(format.width*scale),h=canvas.height=Math.round(format.height*scale);
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const boxes=(photoFitsOpening?layout?.regions??[]:[]).map(region=>{
    if(!Array.isArray(region)||region.length<2||region.some(p=>!p||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1000)))return;
    const points=region.map(p=>({x:p.x*sw/1000,y:p.y*sh/1000}));
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
    if(width<2||height<2)return;
    return {x,y,width,height,points};
  });
  const crop=layout?.mode==='crop'?boxes[0]:undefined;
  ctx.fillStyle='#eeeae5';
  ctx.fillRect(0,0,w,h);
  if(layout?.mode==='layers'&&boxes.length>=2&&boxes.every(b=>b&&b.points.length>=4)){
    ctx.fillStyle='#282321';
    ctx.fillRect(0,0,w,h);
    const row=h/boxes.length;
    boxes.forEach((box,i)=>{
      if(!box)return;
      const zoom=Math.min(w*.82/box.width,row*.88/box.height);
      ctx.save();
      ctx.translate((w-box.width*zoom)/2,(i+.5)*row-box.height*zoom/2);
      ctx.scale(zoom,zoom);
      ctx.translate(-box.x,-box.y);
      ctx.beginPath();
      box.points.forEach((p,j)=>j===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
      ctx.closePath();ctx.clip();ctx.drawImage(visual,0,0);ctx.restore();
    });
  }else{
    const box=crop??{x:0,y:0,width:sw,height:sh};
    const zoom=crop?Math.max(w/box.width,h/box.height):Math.min(w/sw,h/sh);
    const dw=box.width*zoom,dh=box.height*zoom;
    ctx.drawImage(visual,box.x,box.y,box.width,box.height,(w-dw)/2,(h-dh)/2,dw,dh);
  }
  return {data:canvas.toDataURL('image/jpeg',.88),index,active:photoFitsOpening,referenceOnly:!photoFitsOpening};
}
