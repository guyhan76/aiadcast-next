import {validMillimeters} from './dimension-units.ts';
export type GeometryShape='auto'|'cuboid'|'straight-cylinder'|'plane';
type Spec={axis:string;value:string;unit:string};
type Input={category:string;specType:string;shape?:GeometryShape;basis?:string;specifications:Spec[]};
export type GeometryContract={version:1;category:string;specType:string;priority:'dimensions-first';shape:Exclude<GeometryShape,'auto'>|'unresolved';basis:string;measurements:Spec[];referenceUse:'appearance-only';coverage:'body-only'|'plane-only'|'insufficient-shape';missing:string[];outputGeometryVerified:false};
const flexible=new Set(['fashion','bags','shoes','jewelry','accessories','shoppingbags','pouches']);
export function dimensionGeometry(input:Input):GeometryContract{
 const {category,specType}=input,shape=input.shape??'auto',basis=input.basis??'outer-body';
 if(!['auto','cuboid','straight-cylinder','plane'].includes(shape)||!['outer-body','inner-body','body','garment-flat'].includes(basis))throw Error('INVALID_GEOMETRY');
 const axes=specType==='rectangular'?['width','depth','height']:specType==='cylindrical'?['diameter','height']:specType==='flat'?['width','depth']:[];
 if(!axes.length||input.specifications.length!==axes.length||input.specifications.some((s,i)=>s.axis!==axes[i]||s.unit!=='mm'||!validMillimeters(s.value)))throw Error('INVALID_GEOMETRY');
 let selected:GeometryContract['shape']=shape==='auto'?(category==='boxes'&&specType==='rectangular'?'cuboid':['labels','plasticfilm'].includes(category)&&specType==='flat'?'plane':'unresolved'):shape;
 const missing:string[]=[];
 if(flexible.has(category)||basis==='garment-flat'){selected='unresolved';missing.push('silhouette-and-landmark-measurements');}
 else if(basis!=='outer-body'){selected='unresolved';missing.push('external-measurements-or-wall-thickness');}
 else if(selected==='cuboid'&&specType!=='rectangular'||selected==='straight-cylinder'&&specType!=='cylindrical'||selected==='plane'&&specType!=='flat')throw Error('GEOMETRY_SPEC_MISMATCH');
 if(selected==='unresolved'&&!missing.length)missing.push(specType==='cylindrical'?'body-profile-neck-shoulder-cap':'shape-profile-and-measurement-landmarks');
 return {version:1,category,specType,priority:'dimensions-first',shape:selected,basis,measurements:input.specifications.map(s=>({...s})),referenceUse:'appearance-only',coverage:selected==='unresolved'?'insufficient-shape':selected==='plane'?'plane-only':'body-only',missing,outputGeometryVerified:false};
}
export type Point3=[number,number,number];
// This mesh is authoritative only for the declared mathematical body, not a reconstructed product.
export function geometryMesh(contract:GeometryContract){
 const n=(axis:string)=>Number(contract.measurements.find(s=>s.axis===axis)!.value);let vertices:Point3[]=[],faces:number[][]=[];
 if(contract.shape==='unresolved')return null;
 if(contract.shape==='cuboid'){const w=n('width'),d=n('depth'),h=n('height');vertices=Array.from({length:8},(_,i)=>[i&1?w:0,i&2?d:0,i&4?h:0]);faces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];}
 if(contract.shape==='plane'){const w=n('width'),h=n('depth');vertices=[[0,0,0],[w,0,0],[w,0,h],[0,0,h]];faces=[[0,1,2,3]];}
 if(contract.shape==='straight-cylinder'){const r=n('diameter')/2,h=n('height'),count=32;vertices=Array.from({length:count*2},(_,i)=>[r+r*Math.cos(i%count/count*Math.PI*2),r+r*Math.sin(i%count/count*Math.PI*2),i<count?0:h]);faces=[Array.from({length:count},(_,i)=>count+i),...Array.from({length:count},(_,i)=>[i,(i+1)%count,(i+1)%count+count,i+count])];}
 return {vertices,faces};
}
export function geometryProjection(contract:GeometryContract){
 const mesh=geometryMesh(contract);if(!mesh)return null;
 const span=[0,1,2].map(a=>Math.max(...mesh.vertices.map(p=>p[a]))-Math.min(...mesh.vertices.map(p=>p[a]))),center=span.map(v=>v/2),distance=Math.max(...span)*4;
 const yaw=35*Math.PI/180,pitch=24*Math.PI/180;
 const camera=mesh.vertices.map(p=>{const[x,y,z]=p.map((v,i)=>v-center[i]);const horizontal=x*Math.cos(yaw)-y*Math.sin(yaw),depth=x*Math.sin(yaw)+y*Math.cos(yaw);return{x:horizontal,y:depth*Math.sin(pitch)-z*Math.cos(pitch),depth:depth*Math.cos(pitch)+z*Math.sin(pitch)};});
 const projected=camera.map(p=>({x:p.x/(distance-p.depth),y:p.y/(distance-p.depth)}));
 const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x)),minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
 const scale=640/Math.max(maxX-minX,maxY-minY),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 return {...mesh,span,points:projected.map(p=>({x:400+(p.x-cx)*scale,y:400+(p.y-cy)*scale})),faces:[...mesh.faces].sort((a,b)=>a.reduce((n,i)=>n+camera[i].depth,0)/a.length-b.reduce((n,i)=>n+camera[i].depth,0)/b.length),camera:{projection:'perspective' as const,yaw:35,pitch:24,distance,uniformScale:scale}};
}
// Intentionally no numbers/arrows: annotation is independent of construction.
export function geometryGuideSvg(contract:GeometryContract){
 const mesh=geometryProjection(contract);if(!mesh)return null;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="white"/>${mesh.faces.map((f,i)=>`<polygon points="${f.map(n=>`${mesh.points[n].x.toFixed(4)},${mesh.points[n].y.toFixed(4)}`).join(' ')}" fill="${['#c8c8c8','#e4e4e4','#a8a8a8'][i%3]}" stroke="#444" stroke-width="2"/>`).join('')}</svg>`;
}

export function projectGeometry(p:import('./model.ts').Project):GeometryContract|null{
 if(p.generation.geometryVersion!==1||p.generation.mode!=='creative'||p.productProfile.specType==='none'||!p.product||p.generation.inputMode==='text-example'||p.generation.planarSourceHash||p.dimensionControl)return null;
 const axes=p.productProfile.specType==='cylindrical'?['width','height'] as const:p.productProfile.specType==='flat'?['width','depth'] as const:['width','depth','height'] as const;
 return dimensionGeometry({category:p.productProfile.category,specType:p.productProfile.specType,shape:p.generation.geometryShape,basis:p.generation.dimensionBasis,specifications:axes.map(axis=>({axis:axis==='width'&&p.productProfile.specType==='cylindrical'?'diameter':axis,value:p.dimensions[axis],unit:'mm'}))});
}
export function projectGeometryKey(p:import('./model.ts').Project){try{return projectGeometry(p);}catch{return {invalid:true,category:p.productProfile.category,shape:p.generation.geometryShape,basis:p.generation.dimensionBasis,dimensions:[p.dimensions.width,p.dimensions.depth,p.dimensions.height]};}}

export function parseGeometryContract(value:unknown):GeometryContract|undefined{
 if(value===undefined)return;const r=value as GeometryContract;
 if(!r||r.version!==1||!Array.isArray(r.measurements))throw Error('INVALID_GEOMETRY');
 const rebuilt=dimensionGeometry({category:r.category,specType:r.specType,shape:r.shape==='unresolved'?'auto':r.shape,basis:r.basis,specifications:r.measurements});
 if(Object.entries(rebuilt).some(([key,v])=>JSON.stringify(r[key as keyof GeometryContract])!==JSON.stringify(v)))throw Error('INVALID_GEOMETRY');return rebuilt;
}
