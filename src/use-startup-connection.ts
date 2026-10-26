import {useEffect,useRef,useState} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {betaSession} from './beta-session';
import {signInBoundary} from './sign-in-boundary';

// Bootstrap retries are read-only. Neither navigation nor network recovery
// may replay login exchanges or generation requests.
export function useStartupConnection(){
 const [checked,setChecked]=useState(!betaSession()),[available,setAvailable]=useState(false);
 const [checking,setChecking]=useState(true),[error,setError]=useState<'timeout'|'failed'|null>(null);
 const reconnect=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let alive=true,active:AbortController|null=null,failed=false,automaticRetries=0;
  const run=async()=>{
   if(!alive||active)return;
   const controller=new AbortController();active=controller;const guard=signInBoundary(),session=betaSession();
   failed=false;setChecking(true);setError(null);
   const current=()=>{if(!alive||active!==controller||controller.signal.aborted)return false;guard();return true;};
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const reads=[apiRequest<{google?:{enabled:boolean}}>('/api/account/capabilities',undefined,controller.signal).then(r=>{if(current())setAvailable(r.google?.enabled===true);})];
    if(session)reads.push(apiRequest<{user:{id:string}}>('/api/auth/session',undefined,controller.signal).then(r=>{if(!current())return;if(r.user?.id!==session.user.id)throw Error('SESSION_CHANGED');setChecked(true);if(!location.hash||['#login','#signup'].includes(location.hash))location.hash='home';}));
    await Promise.race([Promise.allSettled(reads).then(results=>{const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason;}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('STARTUP_TIMEOUT'));},15000);})]);
   }catch(e){
    if(alive&&active===controller){
     try{guard();}catch{return;}
     failed=!(e instanceof ApiRequestFailure&&[401,403].includes(e.status))&&!(e instanceof Error&&e.message==='SESSION_CHANGED');
     setError(e instanceof Error&&e.message==='STARTUP_TIMEOUT'?'timeout':'failed');
    }
   }finally{clearTimeout(timer);controller.abort();if(active===controller){active=null;if(alive)setChecking(false);}}
  };
  reconnect.current=()=>void run();
  const resume=()=>{if(!failed||active||automaticRetries>=2||document.visibilityState!=='visible'||!navigator.onLine)return;automaticRetries++;void run();};
  window.addEventListener('online',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);void run();
  return()=>{alive=false;active?.abort();active=null;reconnect.current=()=>{};window.removeEventListener('online',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[]);
 return {checked,available,checking,error,reconnect:()=>reconnect.current()};
}
