import {betaSession} from './beta-session';
import {imageFile,loadImage,type Asset} from './model';
import {pricingCatalog} from './pricing';
import type {GenerationJob} from './generation-client';
type Order={unit?:'legacy-ticket'|'credit-v2';id:string;pack:string;credits:number;amount:number;currency:'KRW';state:'pending'|'paid'|'canceled';created:number;test:true};
type Account={newCredits?:number;credits:number;orders:Record<string,Order>;orderRequests:Record<string,string>;jobs:Record<string,GenerationJob>};
type Store={version:1;users:Record<string,Account>;emails:Record<string,string>;requests:Record<string,{email:string;token:string;expires:number;verified:boolean}>};
const key='aiadcast.local-demo-data.v1';
const fresh=():Store=>({version:1,users:{},emails:{},requests:{}});
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('aiadcast-offline-demo',1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function read():Promise<Store>{const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('data').objectStore('data').get(key);r.onsuccess=()=>resolve(r.result??fresh());r.onerror=()=>reject(r.error);});}finally{db.close();}}
async function save(value:Store){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(value,key);tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
let requests:Promise<unknown>=Promise.resolve();
// Serialize local writes, including concurrent clicks from separate views.
export function demoRequest(path:string,body:any){const session=betaSession();const next=requests.catch(()=>{}).then(()=>{if((betaSession()?.token??null)!==(session?.token??null))throw Error('SESSION_CHANGED');return handle(path,body,session);});requests=next;return next;}
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>String.fromCharCode(x)).join('');
const secret=()=>btoa(token()).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const failure=(code:string,status=400)=>{throw Object.assign(Error(code),{code,status});};
const wallet=(a:Account)=>{const old=Object.values(a.jobs).filter(j=>j.creditUnit!=='credit-v2'&&(j.state==='ready'||j.state==='running')).length;const reserved=Object.values(a.jobs).filter(j=>j.creditUnit==='credit-v2'&&j.state==='running').length*10;return {available:a.credits-old,reserved:old,credits:{available:(a.newCredits??0)-reserved,reserved},kind:'local-simulation'};};
const quote=(a:Account)=>({unit:wallet(a).available>0?'legacy-ticket':'credit-v2',amount:wallet(a).available>0?1:10,policy:wallet(a).available>0?'legacy-accept-v1':'delivered-2026-10-18'} as const);
const files=import.meta.glob('./assets/showcase-*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
async function composition(source:Asset|null,category:string,preparedBackground:boolean):Promise<Asset>{
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const c=canvas.getContext('2d')!;
 const gradient=c.createLinearGradient(0,0,1080,1920);gradient.addColorStop(0,'#f7fafc');gradient.addColorStop(.5,'#dde5ed');gradient.addColorStop(1,'#6c849a');c.fillStyle=gradient;c.fillRect(0,0,1080,1920);
 c.fillStyle='#ffffff60';c.beginPath();c.ellipse(770,900,900,420,-.55,0,Math.PI*2);c.fill();c.fillStyle='#f5f8fa';c.fillRect(60,1490,960,180);
 if(source){const image=await loadImage(source.data),fit=Math.min(900/image.naturalWidth,990/image.naturalHeight);const w=image.naturalWidth*fit,h=image.naturalHeight*fit;c.save();c.shadowColor='#142c4b35';c.shadowBlur=50;c.shadowOffsetY=30;c.drawImage(image,(1080-w)/2,470+(990-h)/2,w,h);c.restore();}
 else if(preparedBackground){const lookup:Record<string,string>={hospital:'hospital',lodging:'hotel',travel:'travel',insurance:'insurance',lease:'mobility',rental:'mobility'};const asset=files[`./assets/showcase-${lookup[category]??'hotel'}.webp`];if(asset){const image=await loadImage(asset);const fit=Math.min(1080/image.naturalWidth,1920/image.naturalHeight);c.drawImage(image,(1080-image.naturalWidth*fit)/2,0,image.naturalWidth*fit,image.naturalHeight*fit);}}
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('DEMO_IMAGE_FAILED')),'image/png'));
 return imageFile(new File([blob],'aiadcast-demo-composition.png',{type:'image/png'}));
}
// No network, provider keys, card details, email delivery or real AI calls in this adapter.
async function handle(path:string,body:any,session:ReturnType<typeof betaSession>){
 const store=await read();const user=session&&session.expires>Date.now()?session.user.id:undefined;const account=user?store.users[user]:undefined;
 if(path==='/api/account/capabilities')return {email:{enabled:true},checkout:{enabled:true,test:true,currency:'KRW'},demo:true};
 if(path==='/api/health')return {mode:'offline-demo',commercialReady:false};
 if(path==='/api/auth/email/request'){
  const email=String(body?.email??'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)failure('INVALID_EMAIL');
  const requestId=crypto.randomUUID(),pollToken=secret(),expires=Date.now()+600000;store.requests[requestId]={email,token:pollToken,expires,verified:false};await save(store);return {requestId,pollToken,expires};
 }
 if(path==='/api/demo/auth/verify'||path==='/api/auth/email/exchange'){
  const r=store.requests[body?.requestId];if(!r||r.token!==body?.pollToken||r.expires<Date.now())failure('EMAIL_REQUEST_INVALID');
  if(path==='/api/demo/auth/verify'){r.verified=true;await save(store);return {verified:true};}
  if(!r.verified)return {state:'pending'};
  const id=store.emails[r.email]??('demo-'+secret().slice(0,20));store.emails[r.email]=id;store.users[id]??={credits:0,orders:{},orderRequests:{},jobs:{}};await save(store);
  return {state:'verified',session:{token:secret(),expires:Date.now()+86400000,user:{id,label:r.email}}};
 }
 if(path==='/api/auth/logout')return {ok:true};
 if(path==='/api/status')return {mode:'offline-demo',commercialReady:false,generation:{...(account?{creditQuote:quote(account)}:{}),enabled:!!account,model:'local-demo.composition',reason:account?null:'AUTH_REQUIRED'},wallet:account?wallet(account):{available:0,reserved:0,kind:'local-simulation'},budget:{limitMicros:0,spentMicros:0,heldMicros:0},assistant:{available:false}};
 if(!account)failure('AUTH_REQUIRED',401);
 if(path==='/api/auth/me')return {user:session!.user};
 if(path==='/api/account/credits')return {wallet:wallet(account!),orders:Object.values(account!.orders).sort((a,b)=>b.created-a.created).slice(0,30),grants:[]};
 if(path==='/api/checkout/orders'){
  if(!body?.agreed)failure('CONSENT_REQUIRED');const pack=pricingCatalog.packs.find(p=>p.id===body?.pack);if(!pack||typeof body?.requestId!=='string')failure('INVALID_ORDER');
  const prior=account!.orderRequests[body.requestId];if(prior)return account!.orders[prior];
  const order:Order={id:crypto.randomUUID(),pack:pack!.id,unit:'credit-v2',credits:pack!.credits,amount:pack!.prices.KRW,currency:'KRW',state:'pending',created:Date.now(),test:true};account!.orders[order.id]=order;account!.orderRequests[body.requestId]=order.id;await save(store);return order;
 }
 const checkout=path.match(/^\/api\/(demo\/)?checkout\/orders\/([^/]+)(?:\/(approve|cancel|decline))?$/);
 if(checkout){const order=account!.orders[checkout[2]];if(!order)failure('ORDER_EXPIRED',404);const action=checkout[3];if(action==='decline')failure('DEMO_DECLINED');if(order.state==='pending'&&action){order.state=action==='approve'?'paid':'canceled';if(order.state==='paid'){if(order.unit==='credit-v2')account!.newCredits=(account!.newCredits??0)+order.credits;else account!.credits+=order.credits;}await save(store);}return order;}
 if(path==='/api/generations'&&body){
  const old=Object.values(account!.jobs).find(j=>j.requestId===body.requestId);if(old)return {job:old,wallet:wallet(account!)};
  const q=quote(account!);if(q.unit==='credit-v2'){if(JSON.stringify(body.creditQuote)!==JSON.stringify(q))failure('CREDIT_QUOTE_CHANGED');if(wallet(account!).credits.available<10)failure('NO_TEST_CREDITS');}
  const id=crypto.randomUUID(),request=body.request;if(request?.dimensionDisplay)failure('AI_DIMENSION_DISPLAY_UNAVAILABLE');if(!request||!['original','creative'].includes(request.mode))failure('INVALID_REQUEST');
  const job:GenerationJob={creditUnit:q.unit,creditPolicy:q.policy,creditCost:q.amount,id,projectId:body.projectId,requestId:body.requestId,state:'running',mode:request.mode,sourceHash:body.source?.sha256??null,createdAt:new Date().toISOString(),model:'local-demo.composition',artifactId:null,artifact:null,errorCode:null};account!.jobs[id]=job;await save(store);
  try{const asset=await composition(request.mode==='original'?null:body.source??null,request.productProfile?.category??'',request.mode==='creative'&&!body.source);const latest=await read(),a=latest.users[user!],j=a.jobs[id];j.state='ready';if(j.creditUnit==='credit-v2'){a.newCredits=(a.newCredits??0)-10;j.creditCaptured=true;}j.artifactId=asset.sha256;j.artifact={id:asset.sha256,sha256:asset.sha256,dataUrl:asset.data,width:asset.width,height:asset.height,role:request.mode==='original'?'background':'creative'};await save(latest);return {job:j,wallet:wallet(a)};}
  catch(e){const latest=await read();latest.users[user!].jobs[id].state='failed';await save(latest);throw e;}
 }
 const report=path.match(/^\/api\/generations\/([^/]+)\/report$/);
 if(report){const job=account!.jobs[report[1]];if(!job?.creditCaptured||typeof body?.description!=='string'||body.description.trim().length<10)failure('INVALID_DEFECT_REPORT');job.defectReport??={state:'pending'};await save(store);return {...job.defectReport,demo:true};}
 if(path.startsWith('/api/generations?')){const id=new URL(path,'https://demo.local').searchParams.get('projectId');return {jobs:Object.values(account!.jobs).filter(j=>j.projectId===id)};}
 const generation=path.match(/^\/api\/generations\/([^/]+)(?:\/(accept|reject))?$/);
 if(generation){const job=account!.jobs[generation[1]];if(!job)failure('JOB_NOT_FOUND',404);const action=generation[2];if(action==='accept'&&job.state==='ready'){if(body?.artifactId!==job.artifactId)failure('ARTIFACT_MISMATCH');job.state='accepted';if(job.creditUnit!=='credit-v2')account!.credits-=1;await save(store);}else if(action==='reject'&&job.state==='ready'){job.state='rejected';await save(store);}return {job,wallet:wallet(account!)};}
 if(path==='/api/projects')return {projects:[]};
 failure('DEMO_ENDPOINT_UNAVAILABLE',404);
}
