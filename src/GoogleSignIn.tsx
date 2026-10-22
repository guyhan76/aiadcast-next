import {nativeGooglePackage,nativeGoogleRestore,nativeGoogleOpen,nativeGoogleClear,type NativeGoogleFlow} from './google-native';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {betaSession,setBetaSession,type BetaSession} from './beta-session';
import {configuredApiOrigin} from './api-origin';
import {signInBoundary} from './sign-in-boundary';
import {EmailAccountPage,VerifyEmailPage} from './AccountPages';
import {useUiLanguage} from './ui-language';
import './google-signin.css';
const key='aiadcast.google-flow';
type Flow={state:string;proof:string;expires:number;url:string};
const exchanges=new Map<string,Promise<BetaSession>>();
window.addEventListener('aiadcast-session-change',()=>{try{nativeGoogleClear(JSON.parse(sessionStorage.getItem(key)??'null')?.state);}catch{}sessionStorage.removeItem(key);exchanges.clear();});
function callback(){try{const p=new URLSearchParams(location.search),flow=JSON.parse(sessionStorage.getItem(key)??'null') as Flow|null;return p.get('google')==='1'?{state:p.get('state'),code:p.get('code'),error:p.get('error'),flow}:null;}catch{return null;}}
export function GoogleGate({children}:{children:ReactNode}){
 const {t}=useUiLanguage();const [route,setRoute]=useState(location.hash),[reply]=useState(callback),[checked,setChecked]=useState(false),[available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[linkNeeded,setLinkNeeded]=useState(false);const locked=useRef(false);
 const [nativeFlow,setNativeFlow]=useState<NativeGoogleFlow|undefined>(nativeGoogleRestore);
 const nativeUnsupported=(!!(window as Window&{AiadcastNative?:unknown}).AiadcastNative||!!configuredApiOrigin()&&configuredApiOrigin()!==location.origin)&&!nativeGooglePackage();
 const signed=!!betaSession(),recovery=route==='#account-recovery',link=signed&&(route==='#google-link'||sessionStorage.getItem('aiadcast.google-recover')==='1');
 useEffect(()=>{const update=()=>setRoute(location.hash);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 useEffect(()=>{let alive=true;const guard=signInBoundary();
  if(signed){void apiRequest<{user:BetaSession['user']}>('/api/auth/session').then(r=>{guard();if(r.user.id!==betaSession()?.user.id)throw Error('SESSION_CHANGED');if(alive){setChecked(true);if(!location.hash||['#login','#signup'].includes(location.hash))location.hash='home';}}).catch(()=>{if(alive)setError(t('로그인을 확인하지 못했습니다. 다시 시도해주세요.','Could not confirm sign-in. Please retry.'));});}
  else {setChecked(true);if(!reply&&!recovery&&!location.hash.startsWith('#verify'))location.hash='login';}
  void apiRequest<{google?:{enabled:boolean}}>('/api/account/capabilities').then(r=>{if(alive)setAvailable(r.google?.enabled===true);}).catch(()=>{if(alive)setError(t('연결을 확인한 뒤 다시 시도해주세요.','Check your connection and retry.'));});return()=>{alive=false;};
 },[]);
 useEffect(()=>{if(!reply)return;let alive=true;const guard=signInBoundary();history.replaceState(null,'',location.pathname+'#login');
  const {flow,state,code}=reply;
  if(reply.error||!flow||flow.expires<=Date.now()||flow.state!==state||!code){sessionStorage.removeItem(key);setError(t('로그인을 다시 시작해주세요.','Please start sign-in again.'));return;}
  setBusy(true);locked.current=true;
  let result=exchanges.get(flow.state);if(!result){result=apiRequest<BetaSession>('/api/auth/google/finish',{state,proof:flow.proof,code});exchanges.set(flow.state,result);}
  void result.then(session=>{guard();if(!alive)return;sessionStorage.removeItem(key);sessionStorage.removeItem('aiadcast.google-recover');setBetaSession(session,'home');}).catch(e=>{if(!alive)return;sessionStorage.removeItem(key);const need=e instanceof ApiRequestFailure&&e.code==='GOOGLE_ACCOUNT_LINK_REQUIRED';setLinkNeeded(need);setError(need?t('기존 계정을 확인한 뒤 Google을 연결해주세요.','Verify your existing account to connect Google.'):t('로그인을 완료하지 못했습니다. 다시 시도해주세요.','Could not finish sign-in. Please retry.'));}).finally(()=>{if(alive){locked.current=false;setBusy(false);}});return()=>{alive=false;};
 },[reply]);
 function clearNative(){nativeGoogleClear(nativeFlow?.state);sessionStorage.removeItem(key);setNativeFlow(undefined);}
 useEffect(()=>{if(!nativeFlow)return;let alive=true;const guard=signInBoundary();
  const fail=(error?:unknown)=>{if(!alive)return;nativeGoogleClear(nativeFlow.state);sessionStorage.removeItem(key);setNativeFlow(undefined);const need=error instanceof ApiRequestFailure&&error.code==='GOOGLE_ACCOUNT_LINK_REQUIRED';setLinkNeeded(need);setError(need?t('기존 계정을 확인한 뒤 Google을 연결해주세요.','Verify your existing account to connect Google.'):t('로그인을 다시 시작해주세요.','Please start sign-in again.'));};
  const poll=async()=>{if(!alive||locked.current||document.visibilityState!=='visible')return;if(nativeFlow.expires<=Date.now()){fail();return;}locked.current=true;
   try{const r=await apiRequest<{state:'pending'|'verified';session?:BetaSession}>('/api/auth/google/native-poll',{state:nativeFlow.state,proof:nativeFlow.proof});guard();if(!alive)return;if(r.state==='verified'&&r.session){nativeGoogleClear(nativeFlow.state);sessionStorage.removeItem(key);sessionStorage.removeItem('aiadcast.google-recover');setBetaSession(r.session,'home');}}
   catch(e){fail(e);}finally{locked.current=false;}
  };
  const resume=()=>void poll();window.addEventListener('aiadcast-google-return',resume);window.addEventListener('aiadcast-google-open-failed',fail);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);const timer=setInterval(resume,3000);resume();
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('aiadcast-google-return',resume);window.removeEventListener('aiadcast-google-open-failed',fail);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[nativeFlow]);
 async function start(){if(locked.current||nativeUnsupported)return;locked.current=true;setBusy(true);setError('');const guard=signInBoundary();try{
  const flow=await apiRequest<Flow>('/api/auth/google/start',nativeGooglePackage()?{packageId:nativeGooglePackage()}:{});guard();const url=new URL(flow.url);if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth')throw Error('INVALID_AUTH_URL');if(nativeGooglePackage()){setNativeFlow(nativeGoogleOpen(flow));locked.current=false;setBusy(false);}else{sessionStorage.setItem(key,JSON.stringify(flow));location.assign(url.href);}
 }catch{locked.current=false;setBusy(false);setError(t('로그인을 시작하지 못했습니다. 다시 시도해주세요.','Could not start sign-in. Please retry.'));}}
 if(route.startsWith('#verify'))return <VerifyEmailPage/>;
 // Existing ownership verification is a recovery route, never the default signup path.
 if(recovery&&!signed)return <div className="google-recovery"><EmailAccountPage mode="login" preserve={async()=>{}} returnPage="home"/></div>;
 if(signed&&checked&&!reply&&!link)return <>{children}</>;
 return <main className="google-signin"><div className="google-signin-card"><h1>aiadcast</h1><p>{t('쉽고 빠르게, 나만의 광고 이미지','Your ad image. Easy and fast.')}</p><button className="google-continue" disabled={!!nativeFlow||nativeUnsupported||!available||busy||signed&&!checked} onClick={()=>void start()}>{busy?t('로그인 중…','Signing in…'):link?t('이 계정에 Google 연결','Connect Google to this account'):t('Google로 계속하기','Continue with Google')}</button>{nativeFlow&&<><p role="status">{t('Google 인증 후 앱으로 돌아오면 로그인됩니다.','Return after Google verification to finish sign-in.')}</p><button onClick={clearNative}>{t('취소','Cancel')}</button></>}{nativeUnsupported&&<p role="status">{t('이 앱의 Google 로그인 연결을 준비 중입니다.','Google sign-in for this app is not connected yet.')}</p>}{!nativeUnsupported&&!available&&!error&&<p role="status">{t('Google 로그인 연결 준비 중입니다.','Google sign-in is not connected yet.')}</p>}{error&&<p role="alert">{error}</p>}{linkNeeded&&<a href="#account-recovery" onClick={()=>sessionStorage.setItem('aiadcast.google-recover','1')}>{t('기존 계정 확인','Verify existing account')}</a>}</div></main>;
}
