import {useEffect,useRef,useState,type ReactNode} from 'react';
import {BrandLogo} from './BrandLogo';
import {betaSession} from './beta-session';
import {prepareGoogleConnection} from './google-readiness';
import {ApiRequestFailure} from './generation-client';
import {consumeLoginDestination} from './login-navigation';
import {signInBoundary} from './sign-in-boundary';
import {installVerifiedLogin} from './verified-login';
import {useUiLanguage} from './ui-language';
import {captureKakaoReturn,clearKakao,kakaoDestination,pendingKakao,pollKakao,startKakao,type KakaoIntent} from './kakao-client';

export function KakaoButton({intent,disabled=false}:{intent:KakaoIntent;disabled?:boolean}) {
  const {t}=useUiLanguage();
  const [available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const locked=useRef(false), mounted=useRef(false);
  useEffect(()=>{
    mounted.current=true;
    if(kakaoDestination()) void prepareGoogleConnection().then(c=>{if(mounted.current)setAvailable(c.kakao?.enabled===true);}).catch(()=>{});
    return ()=>{mounted.current=false;};
  },[]);
  async function open() {
    if(locked.current)return;
    const route=location.hash;
    locked.current=true;setBusy(true);setFailed(false);
    try { await startKakao(intent,()=>mounted.current&&location.hash===route); }
    catch { if(mounted.current)setFailed(true); }
    finally {locked.current=false;if(mounted.current)setBusy(false);}
  }
  if(!available)return null;
  const label=intent==='link'?t('이 계정에 카카오 연결','Link Kakao to this account'):intent==='signup'?t('카카오로 새 계정 만들기','Create an account with Kakao'):t('카카오로 계속하기','Continue with Kakao');
  return <><button className="kakao-continue" type="button" onClick={()=>void open()} disabled={disabled||busy}>{label}</button>{failed&&<p role="alert">{t('카카오 로그인을 열지 못했습니다. 다시 시도해 주세요.','Could not open Kakao. Please try again.')}</p>}</>;
}

function KakaoReturn() {
  const {t}=useUiLanguage(),[cycle,retry]=useState(0);
  const [flow]=useState(pendingKakao);
  const [status,setStatus]=useState<'waiting'|'unknown'|'cancelled'|'failed'|'conflict'|'paused'>(flow?'waiting':'failed');
  const leave=()=>{clearKakao();location.hash=betaSession()?'credits':'login';};
  useEffect(()=>{
    if(!flow)return;
    let live=true,active=false,timer:ReturnType<typeof setTimeout>|undefined;
    const boundary=signInBoundary();
    const stop=(next:typeof status)=>{live=false;clearTimeout(timer);setStatus(next);};
    async function check() {
      if(!live||active||document.visibilityState==='hidden')return;
      if(!flow||pendingKakao()?.state!==flow.state||Date.now()>=flow.expires){stop('failed');return;}
      clearTimeout(timer);
      if(!pendingKakao()?.receipt){
        timer=setTimeout(()=>void check(),Math.max(1,flow.expires-Date.now()));return;
      }
      active=true;
      try {
        boundary();const result=await pollKakao(flow);boundary();
        if(!live||pendingKakao()?.state!==flow.state)return;
        if(result.state==='verified'){
          if(flow.intent==='link'&&result.session.user.id!==flow.owner)throw Error('SESSION_CHANGED');
          clearKakao(flow);installVerifiedLogin(result.session,flow.intent==='link'?'credits':consumeLoginDestination());return;
        }
        if(result.state!=='pending'){clearKakao(flow);stop(result.state);return;}
        timer=setTimeout(()=>void check(),4000);
      } catch(error) {
        if(!live)return;
        if(error instanceof ApiRequestFailure&&error.status<500&&error.status!==429){clearKakao(flow);stop('failed');}
        else stop('paused');
      } finally {active=false;}
    }
    const resume=()=>void check();
    const openFailed=()=>{clearKakao(flow);stop('failed');};
    window.addEventListener('focus',resume);window.addEventListener('aiadcast-kakao-return',resume);
    window.addEventListener('aiadcast-kakao-open-failed',openFailed);document.addEventListener('visibilitychange',resume);
    void check();
    return ()=>{live=false;clearTimeout(timer);window.removeEventListener('focus',resume);window.removeEventListener('aiadcast-kakao-return',resume);window.removeEventListener('aiadcast-kakao-open-failed',openFailed);document.removeEventListener('visibilitychange',resume);};
  },[flow,cycle]);
  const message={
    waiting:t('카카오 인증을 기다리고 있습니다.','Waiting for Kakao sign-in.'),
    unknown:t('아직 연결된 계정이 없습니다. 기존 회원은 Google 로그인 후 내 계정에서 카카오를 연결해 주세요.','No linked account yet. Existing members can sign in with Google and link Kakao in My account.'),
    cancelled:t('카카오 로그인을 취소했습니다.','Kakao sign-in was cancelled.'),
    failed:t('카카오 로그인을 완료하지 못했습니다. 다시 시작해 주세요.','Could not finish Kakao sign-in. Please start again.'),
    conflict:t('이미 다른 계정에 연결된 카카오계정입니다.','This Kakao account is already linked to a different account.'),
    paused:t('연결이 지연되고 있습니다.','The connection is taking longer than expected.')
  }[status];
  return <main className="google-signin"><section className="google-signin-card"><h1><BrandLogo/></h1><p role="status">{message}</p>
    {status==='unknown'&&<KakaoButton intent="signup"/>}
    {status==='paused'&&<button onClick={()=>{setStatus('waiting');retry(n=>n+1);}}>{t('다시 확인','Check again')}</button>}
    <button type="button" onClick={leave}>{status==='waiting'?t('취소','Cancel'):betaSession()?t('내 계정으로','My account'):t('로그인 화면으로','Back to sign-in')}</button></section></main>;
}
export function KakaoBoundary({children}:{children:ReactNode}) {
  const currentRoute=()=>{captureKakaoReturn();return {hash:location.hash,state:pendingKakao()?.state};};
  const [route,setRoute]=useState(currentRoute);
  useEffect(()=>{
    const update=()=>setRoute(currentRoute());
    window.addEventListener('aiadcast-kakao-started',update);
    window.addEventListener('hashchange',update);
    if(kakaoDestination()&&kakaoDestination()!=='web'&&pendingKakao()&&location.hash!=='#kakao-return')location.hash='kakao-return';
    return ()=>{window.removeEventListener('hashchange',update);window.removeEventListener('aiadcast-kakao-started',update);};
  },[]);
  return route.hash==='#kakao-return'?<KakaoReturn key={route.state??'return'}/>:<>{children}</>;
}
