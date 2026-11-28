import type {MaterialManifest} from './material-ad-render';

export type MaterialInput={shape:'open-carton'|'cylinder';widthMm:number;depthMm:number;heightMm:number};
export type MaterialResult={id:string;input:MaterialInput;manifest:MaterialManifest;image:Blob};

// This local-only prototype keeps one completed render, independently of server memory.
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open('aiadcast-local-material-results',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('results');
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
export async function readMaterialResult(id:string){const db=await database();try{return await new Promise<MaterialResult|undefined>((resolve,reject)=>{
 const request=db.transaction('results').objectStore('results').get('latest');
 request.onsuccess=()=>resolve(request.result?.id===id?request.result:undefined);request.onerror=()=>reject(request.error);
});}finally{db.close();}}
export async function saveMaterialResult(result:MaterialResult){const db=await database();try{await new Promise<void>((resolve,reject)=>{
 const tx=db.transaction('results','readwrite');tx.objectStore('results').put(result,'latest');
 tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
});}finally{db.close();}}
export async function verifyMaterialResult(result:MaterialResult){
 const {input,manifest:m,image}=result;
 const same=(a:number|undefined,b:number)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<1e-6;
 if(!m||!input||!(image instanceof Blob)||image.size>20*1024*1024||m.shape!==input.shape||
  !['open-carton','cylinder'].includes(m.shape)||m.materialRecoveredFromPhoto!==false||m.printRecovered!==false||
  ![input.widthMm,input.depthMm,input.heightMm].every(n=>Number.isFinite(n)&&n>=10&&n<=2000)||
  Math.max(input.widthMm,input.depthMm,input.heightMm)/Math.min(input.widthMm,input.depthMm,input.heightMm)>10||
  !same(m.bodyMm?.width,input.widthMm)||!same(m.bodyMm?.depth,input.shape==='cylinder'?input.widthMm:input.depthMm)||!same(m.bodyMm?.height,input.heightMm)||
  m.width!==900||m.height!==900||!m.axes||
  Object.keys(m.axes).sort().join(',')!==(m.shape==='cylinder'?'diameter,height':'depth,height,width')||
  !Object.values(m.axes).every(points=>Array.isArray(points)&&points.length===2&&points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))))throw Error('렌더 결과의 규격·축 정보가 올바르지 않습니다.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await image.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==m.sha256)throw Error('렌더 이미지가 결과 정보와 일치하지 않습니다. 다시 렌더해주세요.');
 const bitmap=await createImageBitmap(image);try{if(bitmap.width!==m.width||bitmap.height!==m.height)throw Error('렌더 이미지 크기가 올바르지 않습니다.');}finally{bitmap.close();}
}
