import {boxGeometry,parseBoxSize} from './box-geometry.ts';
import type {BoxPoint} from './box-geometry.ts';
import type {Project} from './model.ts';
import {isServiceCategory} from './product.ts';

// Seven visible corners. Index 0 (hidden rear/bottom) is never synthesized.
export const boxCornerIds=[4,5,7,6,2,3,1] as const;
export type BoxCorner=typeof boxCornerIds[number];
export type BoxCorners=Record<BoxCorner,BoxPoint>;
export const boxFaces=[{name:'top',corners:[4,5,7,6],sign:1},{name:'front',corners:[2,3,7,6],sign:-1},{name:'side',corners:[1,3,7,5],sign:1}] as const;
export type BoxProjection={version:1;enabled:boolean;corners:BoxCorners;markedCorners:BoxCorner[];confirmedSourceHash:string|null};
export function defaultBoxProjection():BoxProjection{
 const model=boxGeometry({width:340,depth:250,height:210});
 return {version:1,enabled:false,corners:Object.fromEntries(boxCornerIds.map(id=>[id,{x:model.vertices[id].x/720,y:model.vertices[id].y/540}])) as BoxCorners,markedCorners:[],confirmedSourceHash:null};
}
export function parseBoxProjection(value:unknown):BoxProjection|undefined{
 if(value===undefined)return undefined;
 const r=value as BoxProjection;
 if(!r||r.version!==1||typeof r.enabled!=='boolean'||!r.corners||!(r.confirmedSourceHash===null||typeof r.confirmedSourceHash==='string'&&/^[a-f0-9]{64}$/.test(r.confirmedSourceHash)))throw Error('박스 면 지정 정보를 확인해주세요.');
 const corners={} as BoxCorners;
 for(const id of boxCornerIds){const p=r.corners[id];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw Error('박스 모서리 좌표가 올바르지 않습니다.');corners[id]={x:p.x,y:p.y};}
 if(!Array.isArray(r.markedCorners)||r.markedCorners.length>7||r.markedCorners.some(id=>!boxCornerIds.includes(id))||new Set(r.markedCorners).size!==r.markedCorners.length)throw Error('박스 모서리 확인 정보를 확인해주세요.');
 return {version:1,enabled:r.enabled,corners,markedCorners:[...r.markedCorners],confirmedSourceHash:r.confirmedSourceHash};
}
const cross=(a:BoxPoint,b:BoxPoint,c:BoxPoint)=>(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
export function validBoxCorners(corners:BoxCorners,width:number,height:number):boolean{
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<4||height<4)return false;
 for(const id of boxCornerIds){const p=corners?.[id];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)return false;}
 const facesValid=boxFaces.every(face=>{
  const q=face.corners.map(id=>({x:corners[id].x*(width-1),y:corners[id].y*(height-1)}));
  // Convex faces with their expected winding prevent flipped, crossed and overlapping panels.
  if(q.some((p,i)=>cross(p,q[(i+1)%4],q[(i+2)%4])*face.sign<1))return false;
  if(q.some((p,i)=>Math.hypot(p.x-q[(i+1)%4].x,p.y-q[(i+1)%4].y)<4))return false;
  const area=Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
  return area>=64;
 });
 const outline=[4,5,1,3,2,6].map(id=>({x:corners[id as BoxCorner].x*width,y:corners[id as BoxCorner].y*height}));
 return facesValid&&outline.every((p,i)=>cross(p,outline[(i+1)%6],outline[(i+2)%6])>1);
}
export function boxProjectionActive(p:Project):boolean{
 return p.boxProjection?.enabled===true&&p.productProfile.specType==='rectangular'&&p.generation.mode==='original'&&!isServiceCategory(p.productProfile.category);
}
export function boxProjectionProblem(p:Project):'photo'|'corners'|'confirmation'|'dimensions'|null{
 if(!boxProjectionActive(p))return null;
 if(!p.product)return 'photo';
 if(!validBoxCorners(p.boxProjection!.corners,p.product.width,p.product.height))return 'corners';
 if(p.boxProjection!.markedCorners.length!==7||p.boxProjection!.confirmedSourceHash!==p.product.sha256)return 'confirmation';
 try{parseBoxSize(p.dimensions);}catch{return 'dimensions';}
 return null;
}
export const boxProjectionReady=(p:Project)=>boxProjectionActive(p)&&boxProjectionProblem(p)===null;
export function boxProjectionError(p:Project):string|null{
 const problem=boxProjectionProblem(p);
 return problem?({photo:'규격 박스에 사용할 원본 사진을 추가해주세요.',corners:'박스의 세 면이 겹치거나 뒤집히지 않도록 모서리를 다시 맞춰주세요.',confirmation:'규격 박스를 내보내기 전에 현재 사진의 모서리 일곱 곳을 확인해주세요.',dimensions:'규격 표시를 숨겨도 박스 형상에 사용할 세 치수는 모두 유효해야 합니다.'})[problem]:null;
}

// Projective map between two quadrilaterals. Works in image pixels, independent of React/Canvas.
export function homography(from:readonly BoxPoint[],to:readonly BoxPoint[]):number[]{
 if(from.length!==4||to.length!==4||[...from,...to].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('INVALID_QUAD');
 const rows:number[][]=[];
 from.forEach(({x,y},i)=>{const u=to[i].x,v=to[i].y;rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});
 for(let col=0;col<8;col++){
  let pivot=col;for(let r=col+1;r<8;r++)if(Math.abs(rows[r][col])>Math.abs(rows[pivot][col]))pivot=r;
  if(Math.abs(rows[pivot][col])<1e-10)throw Error('DEGENERATE_QUAD');
  [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
  const factor=rows[col][col];for(let k=col;k<=8;k++)rows[col][k]/=factor;
  for(let r=0;r<8;r++)if(r!==col){const f=rows[r][col];for(let k=col;k<=8;k++)rows[r][k]-=f*rows[col][k];}
 }
 return rows.map(r=>r[8]);
}
export function mapPoint(h:readonly number[],p:BoxPoint):BoxPoint{
 const d=h[6]*p.x+h[7]*p.y+1;
 if(!Number.isFinite(d)||Math.abs(d)<1e-10)throw Error('INVALID_PROJECTION');
 return {x:(h[0]*p.x+h[1]*p.y+h[2])/d,y:(h[3]*p.x+h[4]*p.y+h[5])/d};
}
const inside=(p:BoxPoint,q:readonly BoxPoint[])=>{const c=q.map((a,i)=>cross(a,q[(i+1)%4],p));return c.every(v=>v>=-1e-6)||c.every(v=>v<=1e-6);};
export function projectBoxPixels(source:{data:Uint8ClampedArray;width:number;height:number},corners:BoxCorners,model:ReturnType<typeof boxGeometry>):Uint8ClampedArray{
 const {width,height}=model.viewport;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width*height>4_000_000||!validBoxCorners(corners,source.width,source.height)||source.data.length!==source.width*source.height*4)throw Error('INVALID_RASTER');
 const output=new Uint8ClampedArray(width*height*4);
 const outline=[4,5,1,3,2,6].map(id=>({x:corners[id as BoxCorner].x*source.width-.5,y:corners[id as BoxCorner].y*source.height-.5}));
 const clipEdges=outline.map((a,i)=>{const b=outline[(i+1)%outline.length],length=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;return {nx,ny,offset:nx*a.x+ny*a.y};});
 const safeSample=(x:number,y:number)=>clipEdges.every(e=>e.nx*x+e.ny*y-e.offset>=.75);
 for(const face of boxFaces){
  const target=face.corners.map(id=>model.vertices[id]);
  // Normalized UI positions describe image edges; raster samples are pixel centres.
  const input=face.corners.map(id=>({x:corners[id].x*source.width-.5,y:corners[id].y*source.height-.5}));
  const h=homography(target,input);
  const minX=Math.max(0,Math.floor(Math.min(...target.map(p=>p.x)))),maxX=Math.min(width-1,Math.ceil(Math.max(...target.map(p=>p.x))));
  const minY=Math.max(0,Math.floor(Math.min(...target.map(p=>p.y)))),maxY=Math.min(height-1,Math.ceil(Math.max(...target.map(p=>p.y))));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const center={x:x+.5,y:y+.5};if(!inside(center,target))continue;
   const p=mapPoint(h,center),sx=Math.max(0,Math.min(source.width-1,p.x)),sy=Math.max(0,Math.min(source.height-1,p.y));
   const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(source.width-1,x0+1),y1=Math.min(source.height-1,y0+1),dx=sx-x0,dy=sy-y0;
   const samples=[[x0,y0,(1-dx)*(1-dy)],[x1,y0,dx*(1-dy)],[x0,y1,(1-dx)*dy],[x1,y1,dx*dy]];
   let alpha=0,coverage=0;const rgb=[0,0,0];
   for(const [px,py,w] of samples){if(!safeSample(px,py))continue;coverage+=w;const i=(py*source.width+px)*4,a=source.data[i+3]/255;alpha+=w*a;for(let c=0;c<3;c++)rgb[c]+=source.data[i+c]*w*a;}
   const index=(y*width+x)*4;for(let c=0;c<3;c++)output[index+c]=alpha?rgb[c]/alpha:0;output[index+3]=coverage?alpha/coverage*255:0;
  }
 }
 return output;
}
