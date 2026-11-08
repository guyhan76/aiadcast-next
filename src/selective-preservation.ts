export type SelectivePreservation={
 version:1;sourceHash:string;maskHash:string;resultHash:string;width:number;height:number;
 selectedPixels:number;changedSelectedPixels:number;changedOutsidePixels:0;
 bounds:{x:number;y:number;width:number;height:number};semanticQuality:'not-assessed';
};
type Binding={sourceHash:string;maskHash:string;resultHash:string;width:number;height:number};
// A file-integrity report is never an anatomy, product-identity or copy approval.
export function verifiedPreservation(value:unknown,expected:Binding):SelectivePreservation|null{
 if(!value||typeof value!=='object')return null;
 const r=value as SelectivePreservation,b=r.bounds,total=r.width*r.height;
 if(r.version!==1||r.semanticQuality!=='not-assessed'||r.changedOutsidePixels!==0||!b)return null;
 for(const key of ['sourceHash','maskHash','resultHash'] as const)if(!/^[a-f0-9]{64}$/.test(r[key])||r[key]!==expected[key])return null;
 if(![r.width,r.height,r.selectedPixels,r.changedSelectedPixels,b.x,b.y,b.width,b.height].every(Number.isSafeInteger)||r.width!==expected.width||r.height!==expected.height||r.width<1||r.height<1||total>8294400)return null;
 if(r.selectedPixels<1||r.selectedPixels>total||r.changedSelectedPixels<0||r.changedSelectedPixels>r.selectedPixels||b.x<0||b.y<0||b.width<1||b.height<1||b.x+b.width>r.width||b.y+b.height>r.height||r.selectedPixels>b.width*b.height)return null;
 if(r.sourceHash===r.resultHash&&r.changedSelectedPixels!==0)return null;
 return {...r,bounds:{...b}};
}

export function comparisonViewport(width:number,height:number,bounds?:SelectivePreservation['bounds']){
 if(!bounds)return {x:0,y:0,width,height};
 const padding=Math.max(16,Math.ceil(Math.max(bounds.width,bounds.height)*.15));
 const x=Math.max(0,bounds.x-padding),y=Math.max(0,bounds.y-padding);
 return {x,y,width:Math.min(width,bounds.x+bounds.width+padding)-x,height:Math.min(height,bounds.y+bounds.height+padding)-y};
}
