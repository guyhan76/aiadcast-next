import {validMillimeters} from './dimension-units.ts';
// Numerical cuboid reference only; this does not reconstruct or verify a photo.
export type BoxSize = {width:number;depth:number;height:number};
export type BoxPoint = {x:number;y:number};
export type BoxAxis = keyof BoxSize;
export function parseBoxSize(values:Record<BoxAxis,string>):BoxSize {
 const result={} as BoxSize;
 for(const axis of ['width','depth','height'] as const){
  const value=values[axis];
  if(typeof value!=='string'||!validMillimeters(value))throw Error('INVALID_BOX_SIZE');
  result[axis]=Number(value);
 }
 return result;
}
export function boxGeometry(size:BoxSize,viewport={width:720,height:540,padding:90}){
 if(!['width','depth','height'].every(key=>Object.hasOwn(size,key)))throw Error('INVALID_BOX_SIZE');
 for(const value of Object.values(size))if(!Number.isFinite(value)||value<=0||value>100000)throw Error('INVALID_BOX_SIZE');
 const {width,height,padding}=viewport;
 if(![width,height,padding].every(Number.isFinite)||padding<0||width<=2*padding||height<=2*padding)throw Error('INVALID_VIEWPORT');
 // Index bits: 1 = width end, 2 = depth end, 4 = height end.
 const world=Array.from({length:8},(_,i)=>[i&1?size.width:0,i&2?size.depth:0,i&4?size.height:0] as [number,number,number]);
 const projected=world.map(([w,d,h])=>({x:Math.sqrt(3)/2*(w-d),y:(w+d)/2-h}));
 const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x));
 const minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
 // One scale for every axis: independent fitting would falsify the ratios.
 const scale=Math.min((width-2*padding)/(maxX-minX),(height-2*padding)/(maxY-minY));
 const offset={x:(width-(maxX-minX)*scale)/2-minX*scale,y:(height-(maxY-minY)*scale)/2-minY*scale};
 const vertices=projected.map((p,i)=>({x:p.x*scale+offset.x,y:p.y*scale+offset.y,mm:world[i]}));
 const edges:Record<BoxAxis,[number,number]>={width:[2,3],depth:[1,3],height:[1,5]};
 const dimensions=(['width','depth','height'] as const).map(axis=>{
  const [start,end]=edges[axis];return {axis,value:size[axis],unit:'mm' as const,start:vertices[start],end:vertices[end]};
 });
 return {vertices,faces:[{name:'top',corners:[4,5,7,6]},{name:'front',corners:[2,3,7,6]},{name:'side',corners:[1,3,7,5]}],dimensions,scale,viewport,normalizedRatios:{width:1,depth:size.depth/size.width,height:size.height/size.width},photoGeometryVerified:false as const};
}
