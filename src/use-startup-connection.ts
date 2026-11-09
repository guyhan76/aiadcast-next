import {useEffect,useRef,useState} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {betaSession} from './beta-session';
import {signInBoundary} from './sign-in-boundary';
import {hasVerifiedLogin} from './verified-login';

// At most three GET attempts per explicit connection cycle. Never replay an
// authentication exchange, generation or save. Focus/online share this budget.
export function useStartupConnection(){
 const [checked,setChecked]=useState(()=>!betaSession()||hasVerifiedLogin()),[available,setAvailable]=useState<boolean|undefined>();
 const [checking,setChecking]=useState(true),[error,setError]=useState<'timeout'|'failed'|null>(null);
 const reconnect=useRef<()=>void>(()=>{});
 useEffect(()=>{
  // A fresh login response has already authenticated this exact session.
  if(hasVerifiedLogin()){setChecked(true);setChecking(false);return;}
  let alive=true,active:AbortController|null=null,failed=false,attempts=0,deadline=Date.now()+15_000;
  let retryTimer:ReturnType<typeof setTimeout>|undefined;
  const cancelWait=()=>{clearTimeout(retryTimer);retryTimer=undefined;};
  const run=async()=>{
   if(!alive||active)return;
   if(Date.now()>=deadline){cancelWait();failed=false;setChecking(false);setError('timeout');return;}
   cancelWait();attempts++;
   const controller=new AbortController();active=controller;const guard=signInBoundary(),session=betaSession();
   failed=false;setChecking(true);setError(null);
   const current=()=>{if(!alive||active!==controller||controller.signal.aborted)return false;guard();return true;};
   let timer:ReturnType<typeof setTimeout>|undefined,retry=false;
   try{
    const reads:Promise<void>[]=[];
    // Discovery warms the guest connection in the background, but never gates
    // the Google button. The start endpoint remains the authority on availability.
    if(!session)reads.push(apiRequest<{google?:{enabled:boolean}}>('/api/account/capabilities',undefined,controller.signal).then(r=>{if(current())setAvailable(r.google?.enabled===true);}));
    if(session)reads.push(apiRequest<{user:{id:string}}>('/api/auth/session',undefined,controller.signal).then(r=>{if(!current())return;if(r.user?.id!==session.user.id)throw Error('SESSION_CHANGED');setChecked(true);if(!location.hash||['#login','#signup'].includes(location.hash))location.hash='home';}));
    await Promise.race([Promise.all(reads),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('STARTUP_TIMEOUT'));},Math.min(15000,Math.max(1,deadline-Date.now())));})]);
   }catch(e){
    if(alive&&active===controller){
     try{guard();}catch{return;}
     failed=e instanceof ApiRequestFailure?[408,429,500,502,503,504].includes(e.status):e instanceof TypeError||e instanceof Error&&['STARTUP_TIMEOUT','API_UNAVAILABLE'].includes(e.message);
     retry=failed&&Date.now()<deadline&&attempts<3&&navigator.onLine&&document.visibilityState==='visible';
     if(!retry)setError(e instanceof Error&&e.message==='STARTUP_TIMEOUT'?'timeout':'failed');
    }
   }finally{
    clearTimeout(timer);controller.abort();
    if(active===controller){active=null;if(alive){
     if(retry)retryTimer=setTimeout(()=>{retryTimer=undefined;if(navigator.onLine&&document.visibilityState==='visible')void run();else{setChecking(false);setError('failed');}},attempts*1000);
     else setChecking(false);
    }}
   }
  };
  reconnect.current=()=>{if(active||retryTimer)return;attempts=0;deadline=Date.now()+15_000;void run();};
  const resume=()=>{if(!failed||active||attempts>=3||document.visibilityState!=='visible'||!navigator.onLine)return;void run();};
  window.addEventListener('online',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);void run();
  return()=>{alive=false;cancelWait();active?.abort();active=null;reconnect.current=()=>{};window.removeEventListener('online',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[]);
 return {checked,available,checking,error,reconnect:()=>reconnect.current()};
}
