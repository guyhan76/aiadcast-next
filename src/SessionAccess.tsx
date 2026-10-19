import {useEffect,useState} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {betaSession} from './beta-session';
import {requestLogin,type ProtectedRoute} from './auth-intent';
import {useUiLanguage} from './ui-language';
type State='guest'|'checking'|'ready'|'expired'|'unavailable';
export function useSessionAccess(route:string){
 const session=betaSession(),token=session?.token;
 const initial:State=!session?'guest':session.expires<=Date.now()?'expired':'checking';
 const [result,setResult]=useState<{token:string|undefined;route:string;state:State}>({token,route,state:initial}),[verifiedToken,setVerifiedToken]=useState<string>();
 const [attempt,setAttempt]=useState(0);
 const state:State=result.token===token&&result.route===route?result.state:initial;
 function retry(){setResult({token,route,state:initial});setAttempt(n=>n+1);}
 useEffect(()=>{
  const update=(state:State)=>setResult({token,route,state});
  if(!session){update('guest');return;}if(session.expires<=Date.now()){update('expired');return;}
  let active=true,invalidated=false;const controller=new AbortController();update('checking');const timeout=setTimeout(()=>controller.abort(),10000);
  const expiry=setTimeout(()=>{invalidated=true;controller.abort();if(active)update('expired');},Math.min(session.expires-Date.now(),2147483647));
  const invalid=()=>{invalidated=true;controller.abort();if(active)update('expired');};window.addEventListener('aiadcast-session-invalidated',invalid);
  void apiRequest<{user:{id:string;label:string}}>('/api/auth/me',undefined,controller.signal).then(v=>{if(!v?.user||v.user.id!==session.user.id||typeof v.user.label!=='string')throw Error('INVALID_SESSION');if(active&&!invalidated){setVerifiedToken(token);update(session.expires>Date.now()?'ready':'expired');}}).catch(e=>{if(active)update(invalidated||session.expires<=Date.now()||e instanceof ApiRequestFailure&&[401,403].includes(e.status)?'expired':'unavailable');}).finally(()=>clearTimeout(timeout));
  return()=>{active=false;clearTimeout(timeout);clearTimeout(expiry);controller.abort();window.removeEventListener('aiadcast-session-invalidated',invalid);};
 },[token,route,attempt]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')retry();};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[token,route]);
 return {state,retainWhileChecking:!!token&&verifiedToken===token&&state==='checking',retry};
}
export type SessionAccess=ReturnType<typeof useSessionAccess>;
export function LoginRequired({route,access,back}:{route:ProtectedRoute;access:SessionAccess;back:string}){
 const {t}=useUiLanguage();const [error,setError]=useState('');
 return <section className="account-page login-required" aria-label={t('로그인 안내','Sign-in required')}><h1>{access.state==='checking'?t('로그인 상태 확인 중','Checking sign-in'):t('로그인이 필요합니다','Please sign in')}</h1>
 <p role="status">{access.state==='checking'?t('계정을 확인한 뒤 화면을 엽니다.','We will open this screen after checking your account.'):access.state==='unavailable'?t('로그인 상태를 확인하지 못했습니다. 연결을 확인하고 다시 시도해주세요. 저장된 작업은 유지됩니다.','Could not verify sign-in. Check your connection and retry. Saved work is unchanged.'):access.state==='expired'?t('로그인이 만료되었습니다. 다시 로그인하면 하려던 작업으로 돌아갑니다. 저장된 작업은 유지됩니다.','Your session expired. Sign in again to continue. Saved work is unchanged.'):t('광고 만들기와 내 프로젝트는 로그인 후 이용할 수 있습니다. 로그인하면 선택한 화면으로 이어집니다.','Sign in to create ads or open your projects. We will return to the screen you selected.')}</p>
 {access.state==='unavailable'?<button className="primary-action" onClick={access.retry}>{t('로그인 상태 다시 확인','Retry sign-in check')}</button>:access.state!=='checking'&&<button className="primary-action" onClick={()=>{try{requestLogin(route,back);}catch{setError(t('이 기기에 이동 정보를 보관하지 못했습니다. 저장 공간을 확인해주세요.','Could not keep the return destination. Check device storage.'));}}}>{t('로그인하고 계속','Sign in and continue')}</button>}
 <a className="page-back" href={'#'+back}>{t('돌아가기','Back')}</a>{error&&<p role="alert">{error}</p>}</section>;
}
