import {manualIncomplete,parseManualPlacement,type ManualDimensionPlacement} from './manual-dimensions.ts';
import {aiDimensionRequested,projectAiDimensionKey} from './ai-dimension-display.ts';
import type {Project} from './model';
export type AnnotationPoint=[number,number];
export type AnnotationBox=[number,number,number,number];
export type AnnotationAxis='width'|'depth'|'height';
export type AnnotationProposal={located:boolean;product:AnnotationBox;axes:Record<AnnotationAxis,[AnnotationPoint,AnnotationPoint]>;protectedText:AnnotationBox[];existingAnnotations:AnnotationBox[];inset:AnnotationBox};
export type DimensionAnnotation={mode:'none'|'main'|'inset';method?:'ai'|'verified'|'manual';manual?:ManualDimensionPlacement;snapshot:string;proposal?:AnnotationProposal;adjusted?:boolean;analysisAttempted?:boolean};
export function annotationIncomplete(p:Project):string|null{
 const a=p.dimensionAnnotation;if(!a||a.mode==='none')return null;
 if(a.method==='manual')return manualIncomplete(p);
 if(aiDimensionRequested(p))return p.generated?.composition==='complete-ad'&&p.generated.dimensionDisplay?.layout===a.mode&&p.generated.dimensionDisplay.inputKey===projectAiDimensionKey(p)?null:'현재 입력과 일치하는 AI 규격 표시 결과가 아직 없습니다. 입력을 보존했습니다.';
 if(!p.generated||a.snapshot!==annotationSnapshot(p)||!a.proposal)return p.locale==='ko'?'규격 사진·치수선 배치가 미완료입니다. 자동 배치를 완료한 뒤 저장해주세요. 원본 광고는 별도로 보존됩니다.':'Photo dimension placement is incomplete. Complete automatic placement before exporting. The original ad is preserved separately.';
 return null;
}
export const annotationAxes:AnnotationAxis[]=['width','depth','height'];
export const annotationSnapshot=(p:Project)=>JSON.stringify({source:p.generated?.asset.sha256,dimensions:annotationAxes.map(a=>p.dimensions[a]),basis:p.generation.dimensionBasis??'outer-body'});
export function parseAnnotation(raw:unknown):DimensionAnnotation|undefined{
 if(raw===undefined)return;
 const r=raw as DimensionAnnotation;
 if(!r||!['none','main','inset'].includes(r.mode)||typeof r.snapshot!=='string'||r.snapshot.length>500||r.adjusted!==undefined&&typeof r.adjusted!=='boolean')throw Error('규격 표시 정보를 확인해주세요.');
 if(r.method!==undefined&&!['ai','verified','manual'].includes(r.method)||r.method==='ai'&&(r.proposal||r.analysisAttempted))throw Error('INVALID_AI_DIMENSION_DISPLAY');
 if(r.analysisAttempted!==undefined&&typeof r.analysisAttempted!=='boolean')throw Error('INVALID_ANALYSIS_ATTEMPT');
 if(r.method==='manual'&&(r.proposal||r.analysisAttempted)||r.method!=='manual'&&r.manual)throw Error('INVALID_MANUAL_DIMENSIONS');
 const manual=r.manual?parseManualPlacement(r.manual):undefined;
 if(r.proposal)validateAnnotationProposal(r.proposal);
 return {mode:r.mode,snapshot:r.snapshot,...(manual?{manual}:{}),...(r.method?{method:r.method}:{}),...(r.proposal?{proposal:structuredClone(r.proposal)}:{}),...(r.adjusted?{adjusted:true}:{}),...(r.analysisAttempted?{analysisAttempted:true}:{})};
}
const point=(p:unknown):p is AnnotationPoint=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1);
const box=(b:unknown):b is AnnotationBox=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]>0&&b[3]>0&&b[0]+b[2]<=1&&b[1]+b[3]<=1;
const overlap=(a:AnnotationBox,b:AnnotationBox)=>a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];
export function validateAnnotationProposal(p:AnnotationProposal){
 if(!p||p.located!==true||!box(p.product))throw Error('PRODUCT_NOT_LOCATED');
 if(!Array.isArray(p.protectedText)||p.protectedText.length>30||!p.protectedText.every(box))throw Error('INVALID_TEXT_REGIONS');
 if(!Array.isArray(p.existingAnnotations)||p.existingAnnotations.length>20||!p.existingAnnotations.every(box))throw Error('INVALID_EXISTING_ANNOTATIONS');
 if(!Array.isArray(p.inset)||p.inset.length!==4||!p.inset.every(Number.isFinite))throw Error('INVALID_INSET');
 for(const axis of annotationAxes){const e=p.axes?.[axis];if(!Array.isArray(e)||e.length!==2||!e.every(point)||e.some(pt=>pt[0]<p.product[0]-.025||pt[1]<p.product[1]-.025||pt[0]>p.product[0]+p.product[2]+.025||pt[1]>p.product[1]+p.product[3]+.025)||Math.hypot(e[0][0]-e[1][0],e[0][1]-e[1][1])<.02)throw Error('INVALID_AXIS');}
 return p;
}
export function annotationPlan(p:AnnotationProposal,dimensions:Record<AnnotationAxis,string>,mode:'main'|'inset',width:number,height:number){
 validateAnnotationProposal(p);
 if(!['main','inset'].includes(mode))throw Error('INVALID_MODE');
 if(!annotationAxes.every(a=>typeof dimensions?.[a]==='string'&&/^\d+(?:\.\d{1,8})?$/.test(dimensions[a])&&Number(dimensions[a])>0&&Number(dimensions[a])<=100000&&dimensions[a].length<=20))throw Error('INVALID_SAVED_DIMENSIONS');
 const obstacles=[...p.protectedText];let transform=(pt:AnnotationPoint)=>pt,inset:AnnotationBox|null=null;
 if(mode==='inset'){
  if(!box(p.inset)||p.inset[2]<.15||p.inset[3]<.15||[...obstacles,p.product].some(b=>overlap(p.inset,b)))throw Error('NO_SAFE_INSET_SPACE');
  const scale=Math.min(p.inset[2]/p.product[2],p.inset[3]/p.product[3]),w=p.product[2]*scale,h=p.product[3]*scale;
  const rect:AnnotationBox=[p.inset[0]+(p.inset[2]-w)/2,p.inset[1]+(p.inset[3]-h)/2,w,h];inset=rect;
  transform=pt=>[rect[0]+(pt[0]-p.product[0])*scale,rect[1]+(pt[1]-p.product[1])*scale];obstacles.push(p.product,...p.existingAnnotations);
 }
 const fontSize=Math.max(14,Math.round(Math.min(width,height)*.023));
 const planned:{axis:AnnotationAxis;a:AnnotationPoint;b:AnnotationPoint;label:AnnotationBox;text:string}[]=[];
 for(const axis of annotationAxes){
  const [a,b]=p.axes[axis].map(transform),line:AnnotationBox=[Math.min(a[0],b[0])-.004,Math.min(a[1],b[1])-.004,Math.abs(a[0]-b[0])+.008,Math.abs(a[1]-b[1])+.008];
  if(!box(line)||obstacles.some(r=>overlap(line,r)))throw Error('AXIS_COVERS_COPY');
  const text=`${dimensions[axis]} mm`,tw=(text.length*fontSize*.7+16)/width,th=fontSize*1.6/height,middle=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const candidates=[[0,-th],[0,th],[-tw/2-.02,0],[tw/2+.02,0]].map(([x,y]):AnnotationBox=>[middle[0]+x-tw/2,middle[1]+y-th/2,tw,th]);
  const label=candidates.find(r=>box(r)&&![...obstacles,...planned.map(e=>e.label)].some(b=>overlap(r,b)));
  if(!label)throw Error('NO_SAFE_LABEL_SPACE');planned.push({axis,a,b,label,text});
 }
 return {planned,fontSize,inset,product:p.product,verified:false,containsExistingAnnotations:p.existingAnnotations.length>0};
}
