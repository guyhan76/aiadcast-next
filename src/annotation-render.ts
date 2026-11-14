import type {AnnotationProposal,AnnotationAxis} from './dimension-annotation';
import type {Project} from './model';
import {annotationPlan,annotationSnapshot} from './dimension-annotation';
import {loadImage} from './model';
import {completeAdPlacement,hasCompleteAd} from './complete-ad';
export async function paintAnnotation(canvas:HTMLCanvasElement,p:Project){
 const a=p.dimensionAnnotation;
 if(!a||a.mode==='none'||!a.proposal)return;
 if(!hasCompleteAd(p)||a.snapshot!==annotationSnapshot(p))throw Error('규격 표시의 원본 또는 치수가 바뀌었습니다. 자동 배치를 다시 요청하거나 표시 없음을 선택해주세요.');
 const frame=completeAdPlacement(p);await paintLocatedAnnotation(canvas,p.generated!.asset.data,a.proposal,p.dimensions,a.mode,frame);
}
export async function paintLocatedAnnotation(canvas:HTMLCanvasElement,source:string,proposal:AnnotationProposal,dimensions:Record<AnnotationAxis,string>,mode:'main'|'inset',frame={x:0,y:0,w:canvas.width,h:canvas.height}){
 const plan=annotationPlan(proposal,dimensions,mode,frame.w,frame.h),ctx=canvas.getContext('2d')!,image=await loadImage(source);
 ctx.save();ctx.translate(frame.x,frame.y);
 if(plan.inset){const [x,y,w,h]=plan.product,[ix,iy,iw,ih]=plan.inset;ctx.drawImage(image,x*image.naturalWidth,y*image.naturalHeight,w*image.naturalWidth,h*image.naturalHeight,ix*frame.w,iy*frame.h,iw*frame.w,ih*frame.h);}
 for(const edge of plan.planned){
  const a={x:edge.a[0]*frame.w,y:edge.a[1]*frame.h},b={x:edge.b[0]*frame.w,y:edge.b[1]*frame.h};
  ctx.strokeStyle='#d14900';ctx.fillStyle='#d14900';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  const angle=Math.atan2(b.y-a.y,b.x-a.x);
  for(const [pt,theta] of [[a,angle+Math.PI],[b,angle]] as const){ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(pt.x-11*Math.cos(theta-.4),pt.y-11*Math.sin(theta-.4));ctx.lineTo(pt.x-11*Math.cos(theta+.4),pt.y-11*Math.sin(theta+.4));ctx.closePath();ctx.fill();}
  const [x,y,w,h]=edge.label;ctx.fillStyle='#fff';ctx.fillRect(x*frame.w,y*frame.h,w*frame.w,h*frame.h);ctx.strokeRect(x*frame.w,y*frame.h,w*frame.w,h*frame.h);ctx.fillStyle='#a33700';ctx.font=`500 ${plan.fontSize}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(edge.text,(x+w/2)*frame.w,(y+h/2)*frame.h);
 }
 ctx.restore();
}
