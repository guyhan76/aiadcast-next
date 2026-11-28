import {parseBoxSize,type BoxSize} from './box-geometry.ts';
export type Point3=[number,number,number];
export type OpenBoxFace={id:string;points:Point3[];surface:'interior'|'exterior'|'flap'};
// Deterministic body model, not a reconstruction of a reference photograph.
// Flap length/angle are explicit illustrative construction parameters, never inferred measurements.
export function openBoxGeometry(size:BoxSize,options={flapAngleDegrees:35,flapFraction:.45}){
 parseBoxSize({width:String(size.width),depth:String(size.depth),height:String(size.height)});
 if(!Number.isFinite(options.flapAngleDegrees)||options.flapAngleDegrees<0||options.flapAngleDegrees>85||!Number.isFinite(options.flapFraction)||options.flapFraction<=0||options.flapFraction>.5)throw Error('INVALID_FLAPS');
 const {width:w,depth:d,height:h}=size,vertices:Point3[]=Array.from({length:8},(_,i)=>[i&1?w:0,i&2?d:0,i&4?h:0]);
 const face=(id:string,ids:number[],surface:OpenBoxFace['surface']):OpenBoxFace=>({id,points:ids.map(i=>vertices[i]),surface});
 const faces:OpenBoxFace[]=[face('bottom',[0,1,3,2],'interior'),face('back',[0,1,5,4],'interior'),face('left',[0,2,6,4],'interior'),face('front',[2,3,7,6],'exterior'),face('right',[1,3,7,5],'exterior')];
 const angle=options.flapAngleDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dw=d*options.flapFraction,ww=w*options.flapFraction;
 faces.push({id:'back-flap',surface:'flap',points:[vertices[4],vertices[5],[w,-dw*c,h+dw*s],[0,-dw*c,h+dw*s]]},{id:'front-flap',surface:'flap',points:[vertices[6],vertices[7],[w,d+dw*c,h+dw*s],[0,d+dw*c,h+dw*s]]},{id:'left-flap',surface:'flap',points:[vertices[4],vertices[6],[-ww*c,d,h+ww*s],[-ww*c,0,h+ww*s]]},{id:'right-flap',surface:'flap',points:[vertices[5],vertices[7],[w+ww*c,d,h+ww*s],[w+ww*c,0,h+ww*s]]});
 const axes=([{axis:'width',indices:[2,3]},{axis:'depth',indices:[1,3]},{axis:'height',indices:[1,5]}] as const).map(a=>({axis:a.axis,start:vertices[a.indices[0]],end:vertices[a.indices[1]],value:size[a.axis],unit:'mm' as const}));
 return {body:{...size},vertices,faces,axes,flaps:{...options,measured:false as const},referenceGeometryVerified:false as const};
}
export function projectOpenBox(model:ReturnType<typeof openBoxGeometry>,viewport={width:900,height:760,padding:100}){
 const {width,height,padding}=viewport;if(![width,height,padding].every(Number.isFinite)||padding<0||width<=padding*2||height<=padding*2)throw Error('INVALID_VIEWPORT');
 const project=([x,y,z]:Point3)=>({x:Math.sqrt(3)/2*(x-y),y:(x+y)/2-z});
 const all=model.faces.flatMap(f=>f.points).map(project),minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x)),minY=Math.min(...all.map(p=>p.y)),maxY=Math.max(...all.map(p=>p.y));
 const scale=Math.min((width-2*padding)/(maxX-minX),(height-2*padding)/(maxY-minY));
 const offset={x:(width-(maxX-minX)*scale)/2-minX*scale,y:(height-(maxY-minY)*scale)/2-minY*scale};
 const point=(p:Point3)=>{const q=project(p);return{x:q.x*scale+offset.x,y:q.y*scale+offset.y};};
 const depth=(f:OpenBoxFace)=>f.points.reduce((n,p)=>n+p[0]+p[1]+p[2],0)/f.points.length;
 return {scale,viewport,faces:[...model.faces].sort((a,b)=>depth(a)-depth(b)).map(f=>({...f,points:f.points.map(point)})),axes:model.axes.map(a=>({...a,start:point(a.start),end:point(a.end)})),body:model.body};
}
