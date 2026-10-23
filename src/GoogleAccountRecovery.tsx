import {useEffect,useRef,useState} from 'react';
import {apiRequest} from './generation-client';
import {betaSession,setBetaSession,type BetaSession} from './beta-session';
import {apiIdentity} from './api-origin';
import {signInBoundary} from './sign-in-boundary';
import {consumeLoginDestination} from './login-navigation';
import {nativeGoogleClear} from './google-native';
import {BrandLogo} from './BrandLogo';
import {LanguageSwitcher,useUiLanguage} from './ui-language';
export type GoogleLinkFlow={state:string;proof:string;expires:number;origin:string};
const key='aiadcast.google-link-pending';
export function rememberGoogleLink(flow:{state:string;proof:string;expires:number}){const pending={state:flow.state,proof:flow.proof,expires:flow.expires,origin:apiIdentity()};sessionStorage.setItem(key,JSON.stringify(pending));return pending;}
export function readGoogleLink():GoogleLinkFlow|undefined{try{const f=JSON.parse(sessionStorage.getItem(key)??'null');if(f&&f.origin===apiIdentity()&&!betaSession()&&f.expires>Date.now()&&/^[A-Za-z0-9_-]{43}$/.test(f.state)&&/^[A-Za-z0-9_-]{43}$/.test(f.proof))return f;}catch{}sessionStorage.removeItem(key);}
export function clearGoogleLink(flow?:GoogleLinkFlow){sessionStorage.removeItem(key);sessionStorage.removeItem('aiadcast.google-flow');sessionStorage.removeItem('aiadcast.google-recover');nativeGoogleClear(flow?.state);}
window.addEventListener('aiadcast-session-change',()=>{let flow:GoogleLinkFlow|undefined;try{flow=JSON.parse(sessionStorage.getItem(key)??'null');}catch{}clearGoogleLink(flow);if(flow?.origin===apiIdentity())void apiRequest('/api/auth/google/link/cancel',flow).catch(()=>{});});
type Status={state:'confirmation'|'waiting';expires:number};
export function GoogleAccountRecovery({flow,onCancel}:{flow:GoogleLinkFlow;onCancel:()=>void}){
 const {t}=useUiLanguage();const [status,setStatus]=useState<Status>(),[busy,setBusy]=useState(false),[error,setError]=useState(false);const active=useRef(true),locked=useRef(false);
 useEffect(()=>{active.current=true;const guard=signInBoundary();let checking=false;
  const check=async()=>{if(checking||document.visibilityState!=='visible')return;checking=true;
   try{guard();if(flow.expires<=Date.now())throw Error('EXPIRED');const s=await apiRequest<Status>('/api/auth/google/link/status',flow);guard();if(!active.current)return;setStatus(s);
    if(s.state==='waiting'){const r=await apiRequest<{state:'pending'|'verified';session?:BetaSession}>('/api/auth/google/link/complete',flow);guard();if(!active.current)return;if(r.state==='verified'&&r.session){clearGoogleLink(flow);setBetaSession(r.session,consumeLoginDestination());}}
   }catch{if(active.current)setError(true);}finally{checking=false;}
  };
  const invalidate=()=>{active.current=false;if(!betaSession())onCancel();};window.addEventListener('aiadcast-session-change',invalidate);
  const resume=()=>void check();const timer=setInterval(resume,3000);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);resume();
  return()=>{active.current=false;window.removeEventListener('aiadcast-session-change',invalidate);clearInterval(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[flow]);
 async function request(){if(locked.current||!active.current)return;locked.current=true;setBusy(true);setError(false);const guard=signInBoundary();try{const s=await apiRequest<Status>('/api/auth/google/link/request',{...flow,consent:true});guard();if(active.current)setStatus(s);}catch{if(active.current)setError(true);}finally{locked.current=false;if(active.current)setBusy(false);}}
 function cancel(){active.current=false;clearGoogleLink(flow);void apiRequest('/api/auth/google/link/cancel',flow).catch(()=>{});onCancel();}
 return <main className="google-signin"><div className="google-signin-card"><h1><BrandLogo/></h1><p>{status?.state==='waiting'?t('인증메일을 확인한 뒤 앱으로 돌아오세요. Google 연결과 로그인이 완료됩니다.','Confirm the email, then return here. Google will connect and sign you in.'):t('기존 계정을 한 번 확인하면 Google로 바로 로그인할 수 있습니다.','Verify your existing account once to connect Google.')}</p>{error?<p role="alert">{t('연결을 완료하지 못했습니다. 다시 확인하거나 Google 로그인을 다시 시작해주세요.','Could not complete the connection. Retry or start Google sign-in again.')}</p>:null}{status?.state==='confirmation'&&<button className="google-continue" disabled={busy} onClick={()=>void request()}>{t('계정 확인 후 Google 연결','Verify account and connect Google')}</button>}{status?.state==='waiting'&&<p role="status">{t('확인을 기다리는 중…','Waiting for confirmation…')}</p>}<button className="guest-link" onClick={cancel}>{t('취소하고 돌아가기','Cancel and return')}</button><div className="auth-language"><LanguageSwitcher/></div></div></main>;
}
