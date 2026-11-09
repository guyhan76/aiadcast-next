import {useStartupConnection} from './use-startup-connection';
import {prepareGoogleConnection} from './google-readiness';
import {installVerifiedLogin} from './verified-login';
import {GoogleAccountRecovery,rememberGoogleLink,readGoogleLink,type GoogleLinkFlow} from './GoogleAccountRecovery';
import {BrandLogo} from './BrandLogo';
import {offlineDemo} from './demo-mode';
import {consumeLoginDestination} from './login-navigation';
import {nativeGooglePackage,nativeGoogleRestore,nativeGoogleOpen,nativeGoogleClear,type NativeGoogleFlow} from './google-native';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {betaSession,type BetaSession} from './beta-session';
import {configuredApiOrigin} from './api-origin';
import {signInBoundary} from './sign-in-boundary';
import {EmailAccountPage,VerifyEmailPage} from './AccountPages';
import {useUiLanguage,LanguageSwitcher} from './ui-language';
import './google-signin.css';
const key='aiadcast.google-flow';
type Flow={state:string;proof:string;expires:number;url:string};
const exchanges=new Map<string,Promise<BetaSession|{linkRequired:true;expires:number}>>();
window.addEventListener('aiadcast-session-change',()=>{try{nativeGoogleClear(JSON.parse(sessionStorage.getItem(key)??'null')?.state);}catch{}sessionStorage.removeItem(key);exchanges.clear();});
function callback(){try{const p=new URLSearchParams(location.search),flow=JSON.parse(sessionStorage.getItem(key)??'null') as Flow|null;return p.get('google')==='1'?{state:p.get('state'),code:p.get('code'),error:p.get('error'),flow}:null;}catch{return null;}}
async function restoreLink(flow:{state:string;proof:string;expires:number},signal?:AbortSignal){
 const status=await apiRequest<{state:string;expires:number}>('/api/auth/google/link/status',{state:flow.state,proof:flow.proof},signal);
 if(!['confirmation','waiting'].includes(status.state)||!Number.isFinite(status.expires)||status.expires<=Date.now())return;
 // Storage is written only after the caller revalidates its session boundary.
 return {state:flow.state,proof:flow.proof,expires:Math.min(status.expires,flow.expires)};
}
export function GoogleGate({children}:{children:ReactNode}){
 const {t,language}=useUiLanguage();const [route,setRoute]=useState(location.hash),[reply,setReply]=useState(callback),[busy,setBusy]=useState(false),[error,setError]=useState(''),[linkNeeded,setLinkNeeded]=useState(false);const mounted=useRef(true),navigationVersion=useRef(0);useEffect(()=>{mounted.current=true;const navigate=()=>{navigationVersion.current++;};window.addEventListener('hashchange',navigate);return()=>{mounted.current=false;navigationVersion.current++;window.removeEventListener('hashchange',navigate);};},[]);const locked=useRef(false),stopNative=useRef<()=>void>(()=>{});
 const [nativePhase,setNativePhase]=useState<'waiting'|'checking'|'paused'>('checking'),[nativeCycle,setNativeCycle]=useState(0);
 const connection=useStartupConnection(),{checked,available}=connection;
 const [linkFlow,setLinkFlow]=useState<GoogleLinkFlow|undefined>(readGoogleLink);
 const [nativeFlow,setNativeFlow]=useState<NativeGoogleFlow|undefined>(nativeGoogleRestore);
 const nativeUnsupported=(!!(window as Window&{AiadcastNative?:unknown}).AiadcastNative||!!configuredApiOrigin()&&configuredApiOrigin()!==location.origin)&&!nativeGooglePackage();
 // Hosted checkout uses its existing server-validated ticket, not an app login.
 const payment=['#pay','#payment-return','#checkout-return'].includes(location.hash.split('?')[0])||new URLSearchParams(location.search).get('checkout')==='return';
 const signed=!!betaSession(),demoAuth=offlineDemo()&&!betaSession()&&['#login','#signup'].includes(route),recovery=route==='#account-recovery',link=signed&&(route==='#google-link'||sessionStorage.getItem('aiadcast.google-recover')==='1');
 useEffect(()=>{const update=()=>setRoute(location.hash);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 useEffect(()=>{if(!signed&&!reply&&!recovery&&!payment&&!demoAuth&&!location.hash.startsWith('#verify'))location.hash='login';},[]);
 useEffect(()=>{if(!reply)return;let alive=true;const guard=signInBoundary();history.replaceState(null,'',location.pathname+'#login');
  const {flow,state,code}=reply;
  if(reply.error||!flow||flow.expires<=Date.now()||flow.state!==state||!code){sessionStorage.removeItem(key);setError(t('로그인을 다시 시작해주세요.','Please start sign-in again.'));return;}
  setBusy(true);locked.current=true;
  let result=exchanges.get(flow.state);if(!result){result=apiRequest<BetaSession|{linkRequired:true;expires:number}>('/api/auth/google/finish',{state,proof:flow.proof,code});exchanges.set(flow.state,result);}
  void result.then(session=>{guard();if(!alive)return;if('linkRequired' in session){setLinkFlow(rememberGoogleLink({...flow,expires:session.expires}));return;}sessionStorage.removeItem(key);sessionStorage.removeItem('aiadcast.google-recover');installVerifiedLogin(session,consumeLoginDestination());}).catch(async e=>{if(!alive)return;try{guard();const restored=await restoreLink(flow);guard();if(alive&&restored){setLinkFlow(rememberGoogleLink(restored));return;}}catch{}if(!alive)return;sessionStorage.removeItem(key);const need=e instanceof ApiRequestFailure&&e.code==='GOOGLE_ACCOUNT_LINK_REQUIRED';setLinkNeeded(need);setError(need?t('기존 계정을 확인한 뒤 Google을 연결해주세요.','Verify your existing account to connect Google.'):t('로그인을 완료하지 못했습니다. 다시 시도해주세요.','Could not finish sign-in. Please retry.'));}).finally(()=>{if(alive){locked.current=false;setBusy(false);}});return()=>{alive=false;};
 },[reply]);
 function clearNative(){stopNative.current();nativeGoogleClear(nativeFlow?.state);sessionStorage.removeItem(key);setNativeFlow(undefined);}
 useEffect(()=>{
  if(!nativeFlow||linkFlow)return;
  let alive=true,polling=false,queued=false,paused=false,attempts=0,failures=0;
  let active:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const guard=signInBoundary(),deadline=Math.min(nativeFlow.expires,Date.now()+120_000);
  const stop=()=>{alive=false;queued=false;clearTimeout(timer);clearTimeout(endTimer);active?.abort();};
  const fail=(error?:unknown)=>{
   if(!alive)return;
   stop();nativeGoogleClear(nativeFlow.state);sessionStorage.removeItem(key);setNativeFlow(undefined);
   const need=error instanceof ApiRequestFailure&&error.code==='GOOGLE_ACCOUNT_LINK_REQUIRED';
   const chromeUnavailable=error instanceof CustomEvent&&error.detail?.code==='CHROME_UNAVAILABLE';
   setLinkNeeded(need);
   setError(chromeUnavailable
    ?t('Chrome을 열 수 없습니다. Chrome을 설치하거나 사용 설정한 뒤 다시 시도해주세요.','Cannot open Chrome. Install or enable Chrome, then try again.')
    :need?t('기존 계정을 확인한 뒤 Google을 연결해주세요.','Verify your existing account to connect Google.')
    :t('로그인을 다시 시작해주세요.','Please start sign-in again.'));
  };
  // Exhaustion pauses this proof, rather than starting another OAuth exchange.
  const pause=()=>{if(!alive)return;if(nativeFlow.expires<=Date.now()){fail();return;}paused=true;queued=false;clearTimeout(timer);active?.abort();setNativePhase('paused');};
  const endTimer=setTimeout(pause,Math.max(0,deadline-Date.now()));
  stopNative.current=stop;
  const schedule=(delay:number)=>{clearTimeout(timer);if(alive&&!paused)timer=setTimeout(()=>void poll(),delay);};
  const transient=(e:unknown)=>e instanceof ApiRequestFailure?[408,429,500,502,503,504].includes(e.status):e instanceof TypeError||e instanceof Error&&['TimeoutError','AbortError'].includes(e.name)||e instanceof Error&&e.message==='API_UNAVAILABLE';
  const poll=async()=>{
   if(!alive||paused)return;
   if(nativeFlow.expires<=Date.now()){fail();return;}
   if(Date.now()>=deadline||attempts>=40){pause();return;}
   if(polling){queued=true;return;}
   if(locked.current||document.visibilityState!=='visible'||!navigator.onLine)return;
   try{guard();}catch{fail();return;}
   polling=true;attempts++;queued=false;clearTimeout(timer);
   const controller=new AbortController();active=controller;
   let timeout:ReturnType<typeof setTimeout>|undefined,delay=3000;
   try{
    // Only this proof-bound status protocol is replayable. No generic POST retry.
    const r=await Promise.race([
     apiRequest<{state:'pending'|'verified'|'link-required';expires?:number;session?:BetaSession}>('/api/auth/google/native-poll',{state:nativeFlow.state,proof:nativeFlow.proof},controller.signal).catch(async e=>{
      guard();if(!alive||paused||controller.signal.aborted)throw e;
      if(transient(e)||e instanceof ApiRequestFailure&&['GOOGLE_FLOW_INVALID','GOOGLE_ACCOUNT_LINK_REQUIRED'].includes(e.code)){
       try{const restored=await restoreLink(nativeFlow,controller.signal);guard();if(alive&&!paused&&restored)return {state:'link-required' as const,expires:restored.expires};}catch{}
      }
      throw e;
     }),
     new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new DOMException('Timeout','TimeoutError'));},15_000);})
    ]);
    guard();if(!alive||paused)return;
    if(nativeFlow.expires<=Date.now()){fail();return;}
    failures=0;
    if(r.state==='link-required'){stop();setLinkFlow(rememberGoogleLink({...nativeFlow,expires:Math.min(r.expires??nativeFlow.expires,nativeFlow.expires)}));return;}
    if(r.state==='verified'&&r.session){if(!/^[A-Za-z0-9_-]{43}$/.test(r.session.token)||!Number.isFinite(r.session.expires)||r.session.expires<=Date.now()||!/^[A-Za-z0-9_-]{8,100}$/.test(r.session.user?.id)||typeof r.session.user?.label!=='string')throw Error('INVALID_AUTH_RESPONSE');stop();nativeGoogleClear(nativeFlow.state);sessionStorage.removeItem(key);sessionStorage.removeItem('aiadcast.google-recover');installVerifiedLogin(r.session,consumeLoginDestination());return;}
    if(r.state!=='pending')throw Error('INVALID_AUTH_RESPONSE');
   }catch(e){
    if(!alive||paused)return;
    try{guard();}catch{fail();return;}
    if(transient(e)){failures++;if(failures>=3){pause();return;}delay=failures*3000;}
    else{fail(e);return;}
   }finally{
    clearTimeout(timeout);controller.abort();active=undefined;polling=false;
    // A return/focus event during the request is drained once, never in parallel.
    if(alive&&!paused)schedule(queued&&failures===0?0:delay);
   }
  };
  const resume=()=>{if(!alive||paused||document.visibilityState!=='visible')return;setNativePhase('checking');void poll();};
  const sessionChanged=()=>{stop();setNativeFlow(undefined);};
  const routeChanged=()=>{if(!['#login','#google-link'].includes(location.hash))clearNative();};
  window.addEventListener('aiadcast-google-return',resume);window.addEventListener('aiadcast-google-open-failed',fail);window.addEventListener('focus',resume);window.addEventListener('online',resume);window.addEventListener('aiadcast-session-change',sessionChanged);window.addEventListener('hashchange',routeChanged);document.addEventListener('visibilitychange',resume);
  void poll();
  return()=>{stop();if(stopNative.current===stop)stopNative.current=()=>{};window.removeEventListener('aiadcast-google-return',resume);window.removeEventListener('aiadcast-google-open-failed',fail);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);window.removeEventListener('aiadcast-session-change',sessionChanged);window.removeEventListener('hashchange',routeChanged);document.removeEventListener('visibilitychange',resume);};
 },[nativeFlow,linkFlow,nativeCycle]);
 async function start(){if(locked.current||nativeUnsupported)return;locked.current=true;setBusy(true);setError('');const guard=signInBoundary(),startRoute=location.hash,startNavigation=navigationVersion.current;try{
  const capabilities=await prepareGoogleConnection();guard();if(!mounted.current||location.hash!==startRoute||navigationVersion.current!==startNavigation){locked.current=false;setBusy(false);return;}if(capabilities.google?.enabled!==true)throw new ApiRequestFailure('GOOGLE_UNAVAILABLE',503);
  const flow=await apiRequest<Flow>('/api/auth/google/start',{language,linkRecovery:true,...(nativeGooglePackage()?{packageId:nativeGooglePackage()}:{})});guard();if(!mounted.current||location.hash!==startRoute||navigationVersion.current!==startNavigation){locked.current=false;setBusy(false);return;}const url=new URL(flow.url);if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth')throw Error('INVALID_AUTH_URL');if(nativeGooglePackage()){setNativePhase('waiting');setNativeFlow(nativeGoogleOpen(flow));locked.current=false;setBusy(false);}else{sessionStorage.setItem(key,JSON.stringify(flow));location.assign(url.href);}
 }catch(e){locked.current=false;setBusy(false);if(!mounted.current||location.hash!==startRoute||navigationVersion.current!==startNavigation)return;setError(e instanceof ApiRequestFailure&&e.code==='GOOGLE_UNAVAILABLE'?t('Google 로그인을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.','Google sign-in is unavailable. Please try again shortly.'):t('로그인을 시작하지 못했습니다. 다시 시도해주세요.','Could not start sign-in. Please retry.'));}}
 if(linkFlow&&!signed)return <GoogleAccountRecovery flow={linkFlow} onCancel={()=>{setReply(null);setBusy(false);locked.current=false;setLinkFlow(undefined);clearNative();location.assign(location.pathname+'#login');}}/>;
 if(payment)return <>{children}</>;
 // Deliberate device-only simulation uses its own adapter and account namespace.
 // Signed demo sessions still pass the same session check above.
 if(demoAuth)return <EmailAccountPage mode={route==='#signup'?'signup':'login'} preserve={async()=>{}} returnPage="home"/>;
 if(route.startsWith('#verify'))return <><div className="auth-language"><LanguageSwitcher/></div><VerifyEmailPage/></>;
 // Existing ownership verification is a recovery route, never the default signup path.
 if(recovery&&!signed)return <div className="google-recovery"><div className="auth-language"><LanguageSwitcher/></div><EmailAccountPage mode="login" preserve={async()=>{}} returnPage="home"/></div>;
 if(signed&&checked&&!reply&&!link)return <>{children}</>;
 const signingIn=busy||!!nativeFlow||!!reply&&!error||signed&&!checked&&!connection.error;
 return <main className="google-signin"><div className="google-signin-card"><h1><BrandLogo/></h1><p>{t('쉽고 빠르게, 나만의 광고 이미지','Your ad image. Easy and fast.')}</p>{(!signingIn||busy&&!reply)&&<button className="google-continue" disabled={!!nativeFlow||nativeUnsupported||available===false||busy||signed&&!checked} onClick={()=>void start()}>{busy?t('Google 로그인 여는 중…','Opening Google sign-in…'):link?t('이 계정에 Google 연결','Connect Google to this account'):t('Google로 계속하기','Continue with Google')}</button>}{nativeFlow&&<>{nativePhase==='paused'&&<><p role="alert">{t('로그인 확인이 지연되고 있습니다. 다시 확인해주세요.','Sign-in confirmation is taking too long. Please check again.')}</p><button onClick={()=>{setNativePhase('checking');setNativeCycle(n=>n+1);}}>{t('로그인 다시 확인','Check sign-in again')}</button></>}<button onClick={clearNative}>{t('취소','Cancel')}</button></>}{nativeUnsupported&&<p role="status">{t('이 앱의 Google 로그인 연결을 준비 중입니다.','Google sign-in for this app is not connected yet.')}</p>}{!nativeUnsupported&&available===false&&!error&&!connection.checking&&!connection.error&&<p role="status">{t('Google 로그인 연결 준비 중입니다.','Google sign-in is not connected yet.')}</p>}{(signingIn&&(!busy||!!reply))&&(!nativeFlow||nativePhase!=='paused')&&!nativeUnsupported&&(!signed||!connection.error)&&<p role="status" aria-live="polite">{nativeFlow&&nativePhase==='waiting'?t('Google에서 계정을 선택한 뒤 앱으로 돌아와 주세요.','Choose your account in Google, then return to the app.'):t('로그인을 확인하고 있어요','Finishing sign-in…')}</p>}{signed&&connection.error&&<><p role="alert">{connection.error==='timeout'?t('연결이 지연되고 있습니다. 다시 연결해주세요.','Connection is taking too long. Please reconnect.'):t('연결하지 못했습니다. 다시 연결해주세요.','Could not connect. Please reconnect.')}</p><button type="button" disabled={connection.checking} onClick={connection.reconnect}>{t('다시 연결','Reconnect')}</button></>}{error&&<p role="alert">{error}</p>}{linkNeeded&&<a href="#account-recovery" onClick={()=>sessionStorage.setItem('aiadcast.google-recover','1')}>{t('기존 계정 확인','Verify existing account')}</a>}<div className="auth-language"><LanguageSwitcher/></div></div></main>;
}

