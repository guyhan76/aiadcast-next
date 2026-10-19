import type {GeneratedAsset} from './generated.ts';
import {parseProfile,dimensionAxes,isServiceCategory} from './product.ts';
import {validMillimeters} from './dimension-units.ts';
import {parseDimensionPlan} from './dimension-generation.ts';
export type GuidePrimitive={kind:'polygon';points:number[][];fill:string}|{kind:'line';points:number[][];color:string}|{kind:'ellipse';x:number;y:number;rx:number;ry:number;fill:string}|{kind:'text';x:number;y:number;text:string;size:number;color:string};
export type DimensionGuide={width:960;height:1040;shape:string;basis:string;values:string[];primitives:GuidePrimitive[]};
export function dimensionGuide(result:Pick<GeneratedAsset,'specificationKey'|'dimensionPlan'>|undefined,language:'ko'|'en'='ko'):{guide?:DimensionGuide;reason?:string}{
 const t=(ko:string,en:string)=>language==='ko'?ko:en;
 if(!result)return {reason:t('생성 당시 저장된 규격이 없습니다.','No generation-time dimensions are saved.')};
 try{
  const saved=JSON.parse(result.specificationKey),profile=parseProfile(saved.productProfile),specs=saved.specifications;
  const axes=dimensionAxes(profile),plan=parseDimensionPlan(result.dimensionPlan);
  if(!axes.length||isServiceCategory(profile.category))return {reason:t('규격 없는 결과에는 안내 도식을 만들지 않습니다.','No diagram is available for results without dimensions.')};
  if(['fashion','bags','shoes','jewelry','accessories','shoppingbags','pouches'].includes(profile.category)||plan?.basis==='garment-flat')return {reason:t('의류·가방 등 비정형 상품의 규격 도식은 지원하지 않습니다.','Diagrams for apparel, bags and irregular products are not supported.')};
  if(!Array.isArray(specs)||specs.length!==axes.length||specs.some((s,i)=>s?.axis!==axes[i]||s.unit!=='mm'||typeof s.value!=='string'||!validMillimeters(s.value)))throw Error('INVALID');
  if(plan&&(plan.specType!==profile.specType||plan.sourceHash!==saved.sourceHash||plan.measurements.length!==specs.length||plan.measurements.some((m,i)=>m.value!==specs[i].value||m.axis!==(profile.specType==='cylindrical'&&specs[i].axis==='width'?'diameter':specs[i].axis))))throw Error('INVALID');
  if(profile.specType==='frontal')return {reason:t('가로·높이만으로 곡면이나 깊이를 재구성하지 않습니다. 원본과 측정 부위를 비교해주세요.','Width and height cannot reconstruct curvature or depth. Compare the source and measurement landmarks.')};
  const basis=plan?.basis??'unspecified';
  const values=specs.map(s=>s.value) as string[],nums=values.map(Number),[a,b,c]=nums;
  const primitives:GuidePrimitive[]=[];
  const line=(points:number[][],color='#303030')=>primitives.push({kind:'line',points,color});
  const poly=(points:number[][],fill:string)=>primitives.push({kind:'polygon',points,fill});
  const text=(x:number,y:number,value:string,size=40,color='#202020')=>primitives.push({kind:'text',x,y,text:value,size,color});
  const arrow=(p:number[],q:number[],color:string)=>{line([p,q],color);const dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,head=Math.min(12,length/3);for(const [point,sign] of [[p,1],[q,-1]] as [number[],number][]){line([[point[0]+sign*ux*head-uy*6,point[1]+sign*uy*head+ux*6],point,[point[0]+sign*ux*head+uy*6,point[1]+sign*uy*head-ux*6]],color);}};
  const colors=['#b74312','#135e9b','#197044'];let scale:number;
  if(profile.specType==='rectangular'){
   scale=Math.min(480/(a+.6*b),300/(c+.4*b));const w=a*scale,d=b*scale,h=c*scale,dx=.6*d,dy=-.4*d,x=(960-w-dx)/2,y=600;
   if(Math.min(w,h,Math.hypot(dx,dy))<12)throw Error('EXTREME');
   const A=[x,y],B=[x+w,y],C=[x+w,y-h],D=[x,y-h],E=[x+dx,y-h+dy],F=[x+w+dx,y-h+dy],G=[x+w+dx,y+dy];
   poly([A,B,C,D],'#f3f3f3');poly([D,C,F,E],'#e8eef2');poly([B,G,F,C],'#d5e0e7');
   line([A,[x,y+48]]);line([B,[x+w,y+48]]);arrow([x,y+40],[x+w,y+40],colors[0]);text(x+w/2-14,y+83,'W',32,colors[0]);
   line([B,[x+w+36,y+24]]);line([G,[G[0]+36,G[1]+24]]);arrow([x+w+30,y+20],[G[0]+30,G[1]+20],colors[1]);text(G[0]+48,G[1]+45,'D',32,colors[1]);
   line([A,[x-46,y]]);line([D,[x-46,y-h]]);arrow([x-38,y],[x-38,y-h],colors[2]);text(x-90,y-h/2+12,'H',32,colors[2]);
  }else if(profile.specType==='flat'){
   scale=Math.min(480/a,300/b);const w=a*scale,h=b*scale,x=(960-w)/2,y=600;if(Math.min(w,h)<16)throw Error('EXTREME');
   poly([[x,y],[x+w,y],[x+w,y-h],[x,y-h]],'#e8eef2');line([[x,y],[x,y+48]]);line([[x+w,y],[x+w,y+48]]);arrow([x,y+40],[x+w,y+40],colors[0]);text(x+w/2-14,y+83,'W',32,colors[0]);line([[x,y],[x-46,y]]);line([[x,y-h],[x-46,y-h]]);arrow([x-38,y],[x-38,y-h],colors[1]);text(x-90,y-h/2+12,'L',32,colors[1]);
  }else if(profile.specType==='cylindrical'){
   scale=Math.min(480/a,300/(b+.28*a));const w=a*scale,h=b*scale,x=480,y=600,rx=w/2,ry=w*.14;if(Math.min(w,h)<16)throw Error('EXTREME');
   primitives.push({kind:'ellipse',x,y,rx,ry,fill:'#d5e0e7'});poly([[x-rx,y],[x+rx,y],[x+rx,y-h],[x-rx,y-h]],'#e8eef2');primitives.push({kind:'ellipse',x,y:y-h,rx,ry,fill:'#f3f3f3'});
   line([[x-rx,y],[x-rx,y+ry+48]]);line([[x+rx,y],[x+rx,y+ry+48]]);arrow([x-rx,y+ry+40],[x+rx,y+ry+40],colors[0]);text(x-14,y+ry+83,'Ø',32,colors[0]);line([[x+rx,y],[x+rx+46,y]]);line([[x+rx,y-h],[x+rx+46,y-h]]);arrow([x+rx+38,y],[x+rx+38,y-h],colors[1]);text(x+rx+55,y-h/2+12,'H',32,colors[1]);
  }else throw Error('INVALID');
  text(48,68,t('규격 안내 · 입력 기준 도식','Dimensions · input-based schematic'),38);
  const basisLabels:Record<string,string>={'outer-body':t('본체 외부 치수','Exterior body dimensions'),'inner-body':t('본체 내부 치수','Interior body dimensions'),body:t('본체 치수 · 내부/외부 미지정','Body dimensions · interior/exterior unspecified'),unspecified:t('치수 기준 미지정 · 내부/외부 확인 필요','Basis unspecified · confirm interior/exterior')};
  text(48,128,basisLabels[basis],28);text(48,174,t('열린 날개·손잡이 제외 · 벽 두께는 추정하지 않음','Excludes open flaps/handles · no inferred wall thickness'),25);
  const labels=profile.specType==='rectangular'?[t('W · 가로','W · Width'),t('D · 깊이','D · Depth'),t('H · 높이','H · Height')]:profile.specType==='flat'?[t('W · 가로','W · Width'),t('L · 세로','L · Length')]:[t('Ø · 지름','Ø · Diameter'),t('H · 높이','H · Height')];
  values.forEach((v,i)=>text(48,782+i*58,`${labels[i]}  ${v} mm`,40,colors[i]));
  text(48,964,t('생성 사진의 실측 결과가 아닙니다.','Not a measurement of the generated photo.'),27);text(48,1008,t('제조 도면·CAD·공차 보증이 아닙니다.','Not a manufacturing/CAD/tolerance guarantee.'),27);
  return {guide:{width:960,height:1040,shape:profile.specType,basis,values:[...values],primitives}};
 }catch(error){return {reason:error instanceof Error&&error.message==='EXTREME'?t('치수 비율이 너무 커서 읽을 수 있는 비례 도식을 만들 수 없습니다. 치수를 확인해주세요.','The dimension ratio is too extreme for a readable proportional diagram. Check the measurements.'):t('저장된 치수가 없거나 올바르지 않아 도식을 만들 수 없습니다.','The saved dimensions are missing or invalid; no diagram can be made.')};}
}
