export type PhotoView='unconfirmed'|'front'|'side'|'top'|'perspective';
export type PixelImage={width:number;height:number;data:ArrayLike<number>};
export type Silhouette={state:'detected'|'insufficient';reason:string;bounds:{x:number;y:number;width:number;height:number}|null;ratio:number|null;method:'alpha'|'uniform-edge-background';coverage:number;stability:number|null};
const empty=(reason:string,method:Silhouette['method']='uniform-edge-background'):Silhouette=>({state:'insufficient',reason,bounds:null,ratio:null,method,coverage:0,stability:null});
// Conservative segmentation, not 3D reconstruction or camera calibration. Process <= 512px inputs.
export function detectSilhouette(image:PixelImage):Silhouette{
 const {width:w,height:h,data:d}=image;if(!Number.isInteger(w)||!Number.isInteger(h)||w<32||h<32||w*h>262144||d.length!==w*h*4)return empty('invalid-image');
 const border:number[]=[];for(let x=0;x<w;x++){border.push(x,(h-1)*w+x);}for(let y=1;y<h-1;y++){border.push(y*w,y*w+w-1);}
 const alpha=border.filter(i=>d[i*4+3]<20).length/border.length>.80;const method=alpha?'alpha':'uniform-edge-background';
 const color=[0,1,2].map(channel=>border.reduce((sum,i)=>sum+d[i*4+channel],0)/border.length);
 if(!alpha&&border.filter(i=>Math.hypot(...color.map((c,k)=>d[i*4+k]-c))>22||d[i*4+3]<245).length/border.length>.05)return empty('complex-background',method);
 function segment(threshold:number){
  const n=w*h,bg=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
  const isBg=(i:number)=>alpha?d[i*4+3]<threshold:Math.hypot(...color.map((c,k)=>d[i*4+k]-c))<=threshold;
  const add=(i:number)=>{if(!bg[i]&&isBg(i)){bg[i]=1;queue[tail++]=i;}};border.forEach(add);
  while(head<tail){const i=queue[head++],x=i%w;if(x>0)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<n-w)add(i+w);}
  const visited=new Uint8Array(n),parts:{area:number;left:number;right:number;top:number;bottom:number}[]=[];
  for(let start=0;start<n;start++){if(bg[start]||visited[start])continue;head=0;tail=0;queue[tail++]=start;visited[start]=1;let left=w,right=0,top=h,bottom=0;
   while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);for(const next of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(next>=0&&!bg[next]&&!visited[next]){visited[next]=1;queue[tail++]=next;}}
   parts.push({area:tail,left,right,top,bottom});
  }
  parts.sort((a,b)=>b.area-a.area);return parts;
 }
 const parts=segment(alpha?40:38),main=parts[0];if(!main||main.area<200||main.area/(w*h)<.015)return empty('no-clear-object',method);
 const coverage=main.area/(w*h),bounds={x:main.left,y:main.top,width:main.right-main.left+1,height:main.bottom-main.top+1};
 if(main.left<2||main.top<2||main.right>w-3||main.bottom>h-3)return {...empty('object-cropped',method),coverage,bounds};
 if(parts.slice(1).some(p=>p.area>main.area*.08))return {...empty('multiple-objects',method),coverage,bounds};
 const alternative=segment(alpha?180:60)[0];if(!alternative)return empty('unstable-outline',method);
 const stability=Math.max(Math.abs(alternative.left-main.left)/bounds.width,Math.abs(alternative.right-main.right)/bounds.width,Math.abs(alternative.top-main.top)/bounds.height,Math.abs(alternative.bottom-main.bottom)/bounds.height);
 if(stability>.08)return {...empty('unstable-outline',method),bounds,coverage,stability};
 return {state:'detected',reason:'outline-detected',bounds,ratio:bounds.width/bounds.height,method,coverage,stability};
}
export function assessView(silhouette:Silhouette,view:PhotoView,dimensions:{width:number;depth:number;height:number},confirmed:boolean,tolerance=.10){
 const pairs={front:['width','height'],side:['depth','height'],top:['width','depth']} as const;
 const axes=view in pairs?pairs[view as keyof typeof pairs]:null;const expected=axes?dimensions[axes[0]]/dimensions[axes[1]]:null;
 if(!axes||!confirmed)return {state:'unverified',reason:view==='perspective'?'perspective':'view-unconfirmed',axes,expected,observed:silhouette.ratio,error:null};
 if(axes.some(axis=>!Number.isFinite(dimensions[axis])||dimensions[axis]<=0||dimensions[axis]>100000))return {state:'unverified',reason:'invalid-dimensions',axes,expected:null,observed:silhouette.ratio,error:null};
 if(silhouette.state!=='detected'||!silhouette.ratio)return {state:'unverified',reason:silhouette.reason,axes,expected,observed:null,error:null};
 const error=Math.abs(silhouette.ratio-expected!)/expected!;return {state:error>tolerance+1e-12?'mismatch':'consistent-in-view',reason:'image-outline-ratio',axes,expected,observed:silhouette.ratio,error};
}
export function summarizeViews(rows:ReturnType<typeof assessView>[],spec:'none'|'rectangular'|'flat'|'cylindrical'){
 const required=spec==='rectangular'?['width:height','depth:height','width:depth']:spec==='flat'?['width:depth']:spec==='cylindrical'?['width:height']:[];
 const checked=rows.filter(r=>r.state==='consistent-in-view').map(r=>r.axes!.join(':'));
 return {status:rows.some(r=>r.state==='mismatch')?'mismatch':required.length&&required.every(pair=>checked.includes(pair))?'consistent-in-views':checked.length?'partially-checked':'unverified',checkedPairs:[...new Set(checked)],missingPairs:required.filter(pair=>!checked.includes(pair)),geometryVerified:false,identityVerified:false,automaticallyDetected:true,tolerance:.10};
}
