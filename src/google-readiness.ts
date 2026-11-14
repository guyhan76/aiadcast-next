import {apiRequest,ApiRequestFailure} from './generation-client';
import {apiIdentity} from './api-origin';
import {betaSession} from './beta-session';
import {signInBoundary} from './sign-in-boundary';

type Capabilities={google?:{enabled:boolean}};
type Pending={key:string;controller:AbortController;promise:Promise<Capabilities>};
let pending:Pending|undefined,ready:{key:string;until:number;value:Capabilities}|undefined;
window.addEventListener('aiadcast-session-change',()=>{pending?.controller.abort();pending=undefined;ready=undefined;});
const transient=(error:unknown)=>error instanceof ApiRequestFailure
 ?[408,500,502,503,504].includes(error.status)
 :error instanceof TypeError||error instanceof Error&&(error.message==='API_UNAVAILABLE'||error.name==='TimeoutError');

// One shared, bounded GET warm-up. Never retry OAuth POSTs or paid operations.
// The short memory-only readiness receipt is not authentication or authorization.
export function prepareGoogleConnection():Promise<Capabilities>{
 const key=JSON.stringify([apiIdentity(),betaSession()?.token??null]);
 if(ready?.key===key&&ready.until>Date.now())return Promise.resolve(ready.value);
 if(pending?.key===key)return pending.promise;
 pending?.controller.abort();ready=undefined;
 const controller=new AbortController(),guard=signInBoundary(),deadline=Date.now()+80_000;
 const run=async()=>{
  for(let attempt=0;attempt<6;attempt++){
   guard();controller.signal.throwIfAborted();
   const remaining=deadline-Date.now();if(remaining<=0)throw new DOMException('Connection timeout','TimeoutError');
   const request=new AbortController(),cancel=()=>request.abort(controller.signal.reason);
   controller.signal.addEventListener('abort',cancel,{once:true});
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const value=await Promise.race([
     apiRequest<Capabilities>('/api/account/capabilities',undefined,request.signal),
     new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(new DOMException('Connection timeout','TimeoutError'));request.abort();},Math.min(15_000,remaining));})
    ]);
    guard();controller.signal.throwIfAborted();if(!value||typeof value!=='object')throw Error('API_UNAVAILABLE');
    ready={key,until:Date.now()+10_000,value};return value;
   }catch(error){
    guard();controller.signal.throwIfAborted();
    if(!transient(error)||attempt===5||Date.now()>=deadline)throw error;
   }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);request.abort();}
   await new Promise<void>((resolve,reject)=>{
    const cancel=()=>{clearTimeout(timer);reject(controller.signal.reason);};
    const timer=setTimeout(()=>{controller.signal.removeEventListener('abort',cancel);resolve();},Math.min(2000,Math.max(1,deadline-Date.now())));
    controller.signal.addEventListener('abort',cancel,{once:true});
    if(controller.signal.aborted)cancel();
   });
  }
  throw new DOMException('Connection timeout','TimeoutError');
 };
 const item:Pending={key,controller,promise:Promise.resolve({})};
 item.promise=run().finally(()=>{if(pending===item)pending=undefined;});pending=item;
 return item.promise;
}
