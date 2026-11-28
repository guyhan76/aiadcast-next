import {detectSilhouette,type PixelImage} from './automatic-proportion.ts';
export type PlanarReport={version:1;scope:'declared-front-flat-rectangle';variantLabel?:string;state:'adjusted'|'within-tolerance'|'unverified';reason:string;expectedRatio:number;observedRatio:number|null;outputRatio:number|null;originalHash:string;geometryVerified:false;identityVerified:false};
// Eligibility is deliberately narrower than generic foreground segmentation.
// A rectangular outline is a 2D observation, never evidence of a 3D camera pose.
export function planarOutline(image:PixelImage){
 const found=detectSilhouette(image);if(found.state!=='detected'||!found.bounds)return {bounds:null,ratio:null,reason:found.reason};
 const b=found.bounds,{width:w,height:h,data}=image;
 const corners=[0,w-1,(h-1)*w,h*w-1],bg=[0,1,2].map(c=>corners.reduce((n,i)=>n+data[i*4+c],0)/4);
 const foreground=(x:number,y:number)=>{const i=(y*w+x)*4;return found.method==='alpha'?data[i+3]>245:data[i+3]>245&&Math.hypot(...bg.map((v,c)=>data[i+c]-v))>60;};
 // Solid, axis-aligned perimeter; sloped sides, cut-outs, edge occlusion and
 // ambiguous/low-contrast edges are not repaired by guessing missing pixels.
 let valid=0,total=0;
 for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++)if(x-b.x<2||y-b.y<2||b.x+b.width-x<=2||b.y+b.height-y<=2){total++;if(foreground(x,y))valid++;}
 let outside=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((x<b.x-1||x>b.x+b.width||y<b.y-1||y>b.y+b.height)&&foreground(x,y))outside++;
 if(outside>8)return {bounds:null,ratio:null,reason:'extra-content-outside-plane'};
 if(valid/total<.995)return {bounds:null,ratio:null,reason:'non-rectangular-or-occluded-outline'};
 return {bounds:b,ratio:b.width/b.height,reason:'planar-outline-detected'};
}
export function planarRatio(width:number,depth:number){
 const ratio=width/depth;
 if(![width,depth].every(v=>Number.isFinite(v)&&v>0&&v<=100000)||ratio<.25||ratio>4)throw Error('PLANAR_DIMENSIONS_UNSUPPORTED');
 return ratio;
}
export function parsePlanarReport(value:unknown):PlanarReport|undefined{
 if(value===undefined)return undefined;const r=value as PlanarReport;
 if(r?.variantLabel!==undefined&&(typeof r.variantLabel!=='string'||r.variantLabel.length>80))throw Error('INVALID_PLANAR_REPORT');
 if(!r||r.version!==1||r.scope!=='declared-front-flat-rectangle'||!['adjusted','within-tolerance','unverified'].includes(r.state)||r.geometryVerified!==false||r.identityVerified!==false||typeof r.reason!=='string'||r.reason.length>100||!(/^[a-f0-9]{64}$/).test(r.originalHash)||!Number.isFinite(r.expectedRatio)||r.expectedRatio<.25||r.expectedRatio>4||[r.observedRatio,r.outputRatio].some(n=>n!==null&&(!Number.isFinite(n)||n<=0||n>100)))throw Error('INVALID_PLANAR_REPORT');
 if(r.state==='unverified'?(r.outputRatio!==null):r.observedRatio===null||r.outputRatio===null||Math.abs(r.outputRatio/r.expectedRatio-1)>.01)throw Error('INVALID_PLANAR_REPORT');
 return {...r};
}
