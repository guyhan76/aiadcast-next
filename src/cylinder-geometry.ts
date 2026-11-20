export function cylinderGeometry(diameter:number,height:number,viewport={width:800,height:800}){
 if(![diameter,height].every(v=>Number.isFinite(v)&&v>0&&v<=100000)||![viewport.width,viewport.height].every(v=>Number.isFinite(v)&&v>0))throw Error('INVALID_CYLINDER');
 const scale=Math.min(viewport.width*.59/diameter,viewport.height*.68/(height+diameter*.34)),width=diameter*scale,bodyHeight=height*scale,ry=width*.17,cx=viewport.width*.47,top=(viewport.height-bodyHeight)/2,bottom=top+bodyHeight;
 return {diameter,height,scale,width,bodyHeight,ry,cx,top,bottom,axes:[{axis:'diameter',value:diameter,start:{x:cx-width/2,y:bottom+ry},end:{x:cx+width/2,y:bottom+ry}},{axis:'height',value:height,start:{x:cx+width/2,y:bottom},end:{x:cx+width/2,y:top}}],includesCap:false as const,includesShoulder:false as const};
}
