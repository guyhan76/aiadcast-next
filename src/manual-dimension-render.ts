import type {Project} from './model.ts';
import {manualIncomplete,manualPlan} from './manual-dimensions.ts';
import {loadImage} from './model.ts';
export async function paintManualDimensions(canvas:HTMLCanvasElement,p:Project){
 const error=manualIncomplete(p);if(error)throw Error(error);
 const m=p.dimensionAnnotation?.manual;if(!m)return;
 const plan=manualPlan(p,m),ctx=canvas.getContext('2d');if(!ctx)throw Error('CANVAS_UNAVAILABLE');
 ctx.save();ctx.translate(plan.frame.x,plan.frame.y);
 if(plan.inset&&plan.crop){const image=await loadImage(p.generated!.asset.data),[x,y,w,h]=plan.crop,[ix,iy,iw,ih]=plan.inset;ctx.drawImage(image,x*image.naturalWidth,y*image.naturalHeight,w*image.naturalWidth,h*image.naturalHeight,ix,iy,iw,ih);}
 ctx.strokeStyle='#d14900';ctx.fillStyle='#d14900';
 for(const edge of plan.planned){ctx.lineWidth=Math.max(1,plan.width/700);ctx.beginPath();ctx.moveTo(...edge.start);ctx.lineTo(...edge.a);ctx.moveTo(...edge.end);ctx.lineTo(...edge.b);ctx.stroke();ctx.lineWidth=Math.max(2,plan.width/450);ctx.beginPath();ctx.moveTo(...edge.a);ctx.lineTo(...edge.b);ctx.stroke();const angle=Math.atan2(edge.b[1]-edge.a[1],edge.b[0]-edge.a[0]),arrow=plan.fontSize*.45;for(const [pt,theta] of [[edge.a,angle+Math.PI],[edge.b,angle]] as const){ctx.beginPath();ctx.moveTo(...pt);ctx.lineTo(pt[0]-arrow*Math.cos(theta-.4),pt[1]-arrow*Math.sin(theta-.4));ctx.lineTo(pt[0]-arrow*Math.cos(theta+.4),pt[1]-arrow*Math.sin(theta+.4));ctx.closePath();ctx.fill();}const [x,y,w,h]=edge.label;ctx.fillStyle='#fff';ctx.fillRect(x,y,w,h);ctx.fillStyle='#a33700';ctx.font=`500 ${plan.fontSize}px "Noto Sans KR Variable", sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(edge.text,x+w/2,y+h/2);ctx.fillStyle='#d14900';}
 ctx.restore();
}
