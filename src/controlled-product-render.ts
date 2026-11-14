import {cylinderGeometry} from './cylinder-geometry';
import type {Project} from './model';
import {loadImage,footerVisible} from './model';
import {dimensionControlErrors,semanticMeasurements} from './dimension-control';
import {dimensionLabel} from './dimension-units';
import {getImageFormat} from './formats';
import {openBoxGeometry,projectOpenBox} from './open-box-geometry';
import {fitAdText} from './ad-type';
type Rect={x:number;y:number;w:number;h:number};
type Edge={axis:string;value:number;start:{x:number;y:number};end:{x:number;y:number}};
const sans='"Noto Sans KR Variable", sans-serif',serif='"Noto Serif KR Variable", serif';
let colorCache:{hash:string;color:number[]}|undefined;
async function referenceColor(p:Project){
 if(colorCache?.hash===p.product!.sha256)return colorCache.color;
 const image=await loadImage(p.product!.data),c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0,64,64);const pixels=ctx.getImageData(0,0,64,64).data,bins=new Map<string,{n:number;rgb:number[]}>();
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<200)continue;const rgb=Array.from(pixels.slice(i,i+3));if(Math.max(...rgb)-Math.min(...rgb)<12&&(rgb[0]>235||rgb[0]<22))continue;const key=rgb.map(v=>Math.floor(v/32)).join(',');const b=bins.get(key)??{n:0,rgb:[0,0,0]};b.n++;rgb.forEach((v,j)=>b.rgb[j]+=v);bins.set(key,b);}
 const bin=[...bins.values()].sort((a,b)=>b.n-a.n)[0],color=bin?bin.rgb.map(v=>Math.round(v/bin.n)):[224,220,210];colorCache={hash:p.product!.sha256,color};return color;
}
const shade=(rgb:number[],amount:number)=>`rgb(${rgb.map(v=>Math.round(Math.max(0,Math.min(255,v*amount)))).join(',')})`;
function arrows(ctx:CanvasRenderingContext2D,edges:Edge[],p:Project,r:Rect){
 const fontSize=Math.max(13,Math.min(r.w,r.h)*.042),ko=p.locale==='ko';
 for(const edge of edges){const shift=edge.axis==='height'?{x:Math.min(r.w*.085,65),y:0}:{x:0,y:edge.axis==='depth'?r.h*.1:r.h*.065};const a={x:edge.start.x+shift.x,y:edge.start.y+shift.y},b={x:edge.end.x+shift.x,y:edge.end.y+shift.y};ctx.strokeStyle='#7b3c1d';ctx.fillStyle='#7b3c1d';ctx.lineWidth=Math.max(1.5,fontSize*.085);ctx.beginPath();ctx.moveTo(edge.start.x,edge.start.y);ctx.lineTo(a.x,a.y);ctx.moveTo(edge.end.x,edge.end.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();const angle=Math.atan2(b.y-a.y,b.x-a.x);for(const[pt,t]of[[a,angle+Math.PI],[b,angle]]as const){const n=fontSize*.36;ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(pt.x-n*Math.cos(t-.45),pt.y-n*Math.sin(t-.45));ctx.lineTo(pt.x-n*Math.cos(t+.45),pt.y-n*Math.sin(t+.45));ctx.closePath();ctx.fill();}
 const name=({width:ko?'가로':'Width',depth:ko?'깊이':'Depth',height:ko?'높이':'Height',diameter:ko?'지름':'Diameter'}as Record<string,string>)[edge.axis];const value=edge.axis==='diameter'?p.dimensions.width:p.dimensions[edge.axis as 'width'|'depth'|'height'];const text=`${name} ${dimensionLabel(value,p.dimensions.displayUnit)}`;ctx.font=`500 ${fontSize}px ${sans}`;const tw=ctx.measureText(text).width,x=(a.x+b.x)/2,y=(a.y+b.y)/2;ctx.fillStyle='#fffaf1';ctx.fillRect(x-tw/2-7,y-fontSize*.8,tw+14,fontSize*1.6);ctx.fillStyle='#683419';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);
 }
}
function product(ctx:CanvasRenderingContext2D,p:Project,r:Rect,color:number[],annotate:boolean){
 ctx.save();ctx.translate(r.x,r.y);ctx.shadowColor='#35220f25';ctx.shadowBlur=r.w*.045;ctx.fillStyle='#77604718';ctx.beginPath();ctx.ellipse(r.w*.5,r.h*.78,r.w*.27,r.h*.045,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
 let edges:Edge[]=[];
 if(p.dimensionControl!.shape==='open-carton'){
 const model=openBoxGeometry({width:Number(p.dimensions.width),depth:Number(p.dimensions.depth),height:Number(p.dimensions.height)}),view=projectOpenBox(model,{width:r.w,height:r.h,padding:Math.min(r.w,r.h)*.16});
 for(const face of view.faces){ctx.save();ctx.beginPath();face.points.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));ctx.closePath();const factor=face.surface==='interior'?.65:face.id==='right'?.77:face.surface==='flap'?1.08:.98;const g=ctx.createLinearGradient(0,0,r.w,r.h);g.addColorStop(0,shade(color,factor*1.12));g.addColorStop(1,shade(color,factor*.9));ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=shade(color,factor*.73);ctx.lineWidth=Math.max(1,r.w*.0017);ctx.stroke();ctx.clip();ctx.fillStyle='#ffffff0d';for(let i=0;i<180;i++){const x=((i*137)%997)/997*r.w,y=((i*251)%991)/991*r.h;ctx.fillRect(x,y,r.w*.025,1);}ctx.restore();}edges=view.axes;
 }else{
 const model=cylinderGeometry(Number(p.dimensions.width),Number(p.dimensions.height),{width:r.w,height:r.h}),{width:w,ry,cx,top,bottom}=model;
 const g=ctx.createLinearGradient(cx-w/2,0,cx+w/2,0);g.addColorStop(0,shade(color,.64));g.addColorStop(.25,shade(color,1.16));g.addColorStop(.6,shade(color,1));g.addColorStop(1,shade(color,.66));ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(cx-w/2,top);ctx.lineTo(cx-w/2,bottom);ctx.ellipse(cx,bottom,w/2,ry,0,Math.PI,0,true);ctx.lineTo(cx+w/2,top);ctx.ellipse(cx,top,w/2,ry,0,0,Math.PI,true);ctx.fill();ctx.fillStyle=shade(color,1.2);ctx.beginPath();ctx.ellipse(cx,top,w/2,ry,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=shade(color,.85);ctx.lineWidth=1.5;ctx.stroke();edges=model.axes;
 }
 if(annotate)arrows(ctx,edges,p,r);ctx.restore();return edges;
}
export async function renderControlledProduct(canvas:HTMLCanvasElement,p:Project):Promise<string[]>{
 const errors=dimensionControlErrors(p);if(errors.length)return errors;
 const {width:w,height:h}=getImageFormat(p.format);canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d')!,copy=p.copy[p.locale],ko=p.locale==='ko';
 const glyphs=Object.values(copy).join('')+'가로깊이높이지름입력규격으로구성한제품본체0123456789mm';await Promise.all([document.fonts.load(`500 32px ${sans}`,glyphs),document.fonts.load(`500 48px ${serif}`,glyphs)]);await document.fonts.ready;const color=await referenceColor(p),wide=w>h;
 const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#faf8f2');bg.addColorStop(1,'#e8dfd0');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 const text=(value:string,x:number,y:number,max:number,size:number,lines:number,family=sans)=>{if(!value)return;const fitted=fitAdText(value,max,size,size*.68,lines,(s,n)=>{ctx.font=`500 ${n}px ${family}`;return ctx.measureText(s).width;});if(fitted.overflow)errors.push(ko?'문구가 길어 영역을 넘습니다. 줄여주세요.':'Copy exceeds the layout. Shorten it.');ctx.font=`500 ${fitted.size}px ${family}`;ctx.fillStyle='#30251b';ctx.textAlign='left';ctx.textBaseline='top';fitted.lines.forEach((line,i)=>ctx.fillText(line,x,y+i*fitted.size*1.35));};
 const titleW=w*(wide?.38:.84),unit=Math.min(w,h);text(copy.title,w*.08,h*.09,titleW,unit*.061,3,serif);text(copy.description,w*.08,h*(wide?.43:.235),titleW,unit*.024,3);
 const area:Rect=wide?{x:w*.43,y:h*.08,w:w*.54,h:h*.74}:{x:w*.04,y:h*.34,w:w*.92,h:h*.44};
 product(ctx,p,area,color,p.dimensionControl!.annotation==='direct');
 if(p.dimensionControl!.annotation==='inset'){const r={x:w*.58,y:h*.69,w:w*.36,h:h*.2};ctx.fillStyle='#fffaf0e8';ctx.fillRect(r.x,r.y,r.w,r.h);product(ctx,p,r,color,true);}
 const measures=semanticMeasurements(p).map(m=>dimensionLabel(m.valueMm,p.dimensions.displayUnit)).join(' × ');if(p.dimensionControl!.annotation!=='none')text(measures,w*.08,h*.84,w*.84,unit*.029,1);text(ko?'기하 검증용 · 광고 완성본 아님':'GEOMETRY PROOF · NOT A FINISHED AD',w*.08,h*.89,w*.84,unit*.017,1);
 const footer=['company','contact','email','website'].filter(k=>footerVisible(p,k as any)).map(k=>copy[k as keyof typeof copy]).filter(Boolean).join(' · ');text(footer,w*.08,h*.945,w*.84,unit*.017,1);
 return errors;
}
