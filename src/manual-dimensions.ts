import type {Project} from './model.ts';
import {dimensionAxes} from './product.ts';
import {dimensionLabel,dimensionUnit,validMillimeters} from './dimension-units.ts';
import {completeAdPlacement} from './complete-ad.ts';
export type ManualAxis='width'|'depth'|'height';
export type ManualPoint=[number,number];
export type ManualBox=[number,number,number,number];
export type ManualDimensionPlacement={version:1;snapshot:string;axes:Partial<Record<ManualAxis,{start?:ManualPoint;end?:ManualPoint;offset:number}>>;crop?:ManualBox;inset?:ManualBox;clearBase:boolean;confirmed:boolean};
export type ManualEdge={axis:ManualAxis;start:ManualPoint;end:ManualPoint;a:ManualPoint;b:ManualPoint;label:ManualBox;text:string};
export const manualRequested=(p:Project)=>p.dimensionAnnotation?.method==='manual'&&p.dimensionAnnotation.mode!=='none';
export function manualSnapshot(p:Project){return JSON.stringify({version:1,source:p.generated?.asset.sha256,composition:p.generated?.compositionKey,values:dimensionAxes(p.productProfile).map(axis=>[axis,p.dimensions[axis]]),specType:p.productProfile.specType,unit:dimensionUnit(p.dimensions.displayUnit),basis:p.generation.dimensionBasis??'outer-body',format:p.format,layout:p.dimensionAnnotation?.mode});}
const axes:ManualAxis[]=['width','depth','height'];
const point=(v:unknown):v is ManualPoint=>Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1);
const box=(v:unknown):v is ManualBox=>Array.isArray(v)&&v.length===4&&v.every(n=>typeof n==='number'&&Number.isFinite(n))&&v[0]>=0&&v[1]>=0&&v[2]>.02&&v[3]>.02&&v[0]+v[2]<=1&&v[1]+v[3]<=1;
export function parseManualPlacement(raw:unknown):ManualDimensionPlacement|undefined{
 if(raw===undefined)return;
 const r=raw as ManualDimensionPlacement;
 if(!r||r.version!==1||typeof r.snapshot!=='string'||r.snapshot.length>16000||!r.axes||typeof r.axes!=='object'||Array.isArray(r.axes)||Object.keys(r.axes).some(a=>!axes.includes(a as ManualAxis))||typeof r.clearBase!=='boolean'||typeof r.confirmed!=='boolean')throw Error('INVALID_MANUAL_DIMENSIONS');
 const copied:ManualDimensionPlacement['axes']={};
 for(const axis of axes){const a=r.axes[axis];if(!a)continue;if(typeof a.offset!=='number'||!Number.isFinite(a.offset)||Math.abs(a.offset)>.25||a.start!==undefined&&!point(a.start)||a.end!==undefined&&!point(a.end))throw Error('INVALID_MANUAL_DIMENSIONS');copied[axis]={offset:a.offset,...(a.start?{start:[...a.start] as ManualPoint}:{}),...(a.end?{end:[...a.end] as ManualPoint}:{})};}
 if(r.crop!==undefined&&!box(r.crop)||r.inset!==undefined&&!box(r.inset))throw Error('INVALID_MANUAL_DIMENSIONS');
 return {version:1,snapshot:r.snapshot,axes:copied,clearBase:r.clearBase,confirmed:r.confirmed,...(r.crop?{crop:[...r.crop] as ManualBox}:{}),...(r.inset?{inset:[...r.inset] as ManualBox}:{})};
}
export function freshManualPlacement(p:Project):ManualDimensionPlacement{return {version:1,snapshot:manualSnapshot(p),axes:{},clearBase:false,confirmed:false};}
const near=(a:ManualPoint,b:ManualPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1])<.5;
const cross=(a:ManualPoint,b:ManualPoint,c:ManualPoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function intersects(a:ManualPoint,b:ManualPoint,c:ManualPoint,d:ManualPoint){const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);if([ab1,ab2,cd1,cd2].every(v=>Math.abs(v)<1e-7)){const i=Math.abs(b[0]-a[0])>Math.abs(b[1]-a[1])?0:1;return Math.min(Math.max(a[i],b[i]),Math.max(c[i],d[i]))-Math.max(Math.min(a[i],b[i]),Math.min(c[i],d[i]))>.5;}if([a,b].some(p=>[c,d].some(q=>near(p,q))))return false;return ab1*ab2<0&&cd1*cd2<0;}
const overlaps=(a:ManualBox,b:ManualBox)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
function segmentBox(a:ManualPoint,b:ManualPoint,r:ManualBox){const [x,y,w,h]=r,inside=(p:ManualPoint)=>p[0]>x&&p[0]<x+w&&p[1]>y&&p[1]<y+h;const corners:ManualPoint[]=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];return inside(a)||inside(b)||corners.some((c,i)=>intersects(a,b,c,corners[(i+1)%4]));}
export function manualPlan(p:Project,placement:ManualDimensionPlacement){
 const m=parseManualPlacement(placement)!;
 if(!manualRequested(p)||!p.generated||p.generated.composition!=='complete-ad'||p.generated.dimensionDisplay||m.snapshot!==manualSnapshot(p))throw Error('MANUAL_SOURCE_CHANGED');
 let clean=false;try{clean=JSON.parse(p.generated.compositionKey??'{}').manualDimensionBase===true;}catch{/* No legacy base conversion. */}
 if(!clean)throw Error('MANUAL_CLEAN_BASE_REQUIRED');
 const frame=completeAdPlacement(p),w=frame.w,h=frame.h,min=Math.min(w,h),fontSize=Math.max(14,min*.024);
 let map=(q:ManualPoint):ManualPoint=>[q[0]*w,q[1]*h];let inset:ManualBox|undefined;
 if(p.dimensionAnnotation?.mode==='inset'){
  if(!m.crop||!m.inset)throw Error('MANUAL_CROP_REQUIRED');
  const [cx,cy,cw,ch]=m.crop,[ix,iy,iw,ih]=m.inset,scale=Math.min(iw*w/(cw*w),ih*h/(ch*h));
  inset=[ix*w+(iw*w-cw*w*scale)/2,iy*h+(ih*h-ch*h*scale)/2,cw*w*scale,ch*h*scale];
  const rect=inset;map=q=>{if(q[0]<cx||q[0]>cx+cw||q[1]<cy||q[1]>cy+ch)throw Error('MANUAL_POINT_OUTSIDE_CROP');return [rect[0]+(q[0]-cx)*w*scale,rect[1]+(q[1]-cy)*h*scale];};
 }
 const required=dimensionAxes(p.productProfile);if(!required.length)throw Error('MANUAL_DIMENSIONS_REQUIRED');
 const planned:ManualEdge[]=[];
 for(const axis of required){const entry=m.axes[axis];if(!entry?.start||!entry.end)throw Error('MANUAL_ENDPOINTS_REQUIRED');if(!validMillimeters(p.dimensions[axis]))throw Error('MANUAL_DIMENSIONS_REQUIRED');
  const start=map(entry.start),end=map(entry.end),dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);if(length<min*.025)throw Error('MANUAL_SEGMENT_TOO_SHORT');
  const n:ManualPoint=[-dy/length,dx/length],offset=entry.offset*min,a:ManualPoint=[start[0]+n[0]*offset,start[1]+n[1]*offset],b:ManualPoint=[end[0]+n[0]*offset,end[1]+n[1]*offset];
  const text=dimensionLabel(p.dimensions[axis],dimensionUnit(p.dimensions.displayUnit)),tw=text.length*fontSize*.7+fontSize*.8,th=fontSize*1.55,side=entry.offset<0?-1:1;
  const clearance=Math.abs(n[0])*tw/2+Math.abs(n[1])*th/2+fontSize*.3;
  const center:ManualPoint=[(a[0]+b[0])/2+n[0]*side*clearance,(a[1]+b[1])/2+n[1]*side*clearance],label:ManualBox=[center[0]-tw/2,center[1]-th/2,tw,th];
  if([start,end,a,b].some(q=>q[0]<4||q[0]>w-4||q[1]<4||q[1]>h-4)||label[0]<2||label[1]<2||label[0]+label[2]>w-2||label[1]+label[3]>h-2)throw Error('MANUAL_OUT_OF_BOUNDS');
  const edge={axis,start,end,a,b,label,text};
  for(const previous of planned){const segments=(e:ManualEdge):[ManualPoint,ManualPoint][]=>[[e.a,e.b],[e.start,e.a],[e.end,e.b]];if(overlaps(label,previous.label)||segments(edge).some(([s,e])=>segmentBox(s,e,previous.label))||segments(previous).some(([s,e])=>segmentBox(s,e,label))||segments(edge).some(([s,e])=>segments(previous).some(([u,v])=>intersects(s,e,u,v))))throw Error('MANUAL_LABEL_COLLISION');}
  planned.push(edge);
 }
 return {planned,fontSize,width:w,height:h,frame,...(inset?{inset,crop:m.crop!}:{})};
}
export function manualIncomplete(p:Project):string|null{
 if(!manualRequested(p))return null;
 const ko=p.locale==='ko';
 try{const m=p.dimensionAnnotation?.manual;if(!m||!m.confirmed||!m.clearBase)throw Error('MANUAL_CONFIRMATION_REQUIRED');manualPlan(p,m);return null;}catch{return ko?'치수선 위치를 지정하고 확인해주세요. 원본 광고는 보존됩니다.':'Set and confirm dimension endpoints. The original ad is preserved.';}
}
