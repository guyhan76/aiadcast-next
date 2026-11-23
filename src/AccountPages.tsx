import {RefundNotice} from './RefundNotice';
import {PlayCheckoutPage,playPackage} from './PlayCheckout';
import {useNativeVersion} from './app-version';
import {signInBoundary} from './sign-in-boundary';
import {consumeLoginDestination,rememberLoginDestination} from './login-navigation';
import {PREVIEW_PACKAGE,rememberCheckout} from './checkout-return';
import {offlineDemo} from './demo-mode';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,Mail} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import {CreditOffers} from './CreditOffers';
import {formatPrice,checkoutOffers,type PricingCurrency} from './pricing';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {betaSession,setBetaSession,storageNamespace,accountNamespace,type BetaSession} from './beta-session';
import {carryGuestWorkspace} from './workspace-draft';
import {accountError,exchangeEmail,readSession,type Capabilities,type EmailRequest,type TestOrder} from './account-client';
import './account-pages.css';
export {PaymentBrowserPage} from './PaymentBrowserPage';
type Context={preserve:()=>Promise<void>;returnPage:'create'|'studio'|'editor'|'home'};
// Login discovery retries only reads; malformed capabilities never select a fallback form.
// Three 20s attempts plus 1s/2s backoff bound the wait to about 63s.
function useCapabilities(autoRetry=false){
 const [value,setValue]=useState<Capabilities|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),[reconnecting,setReconnecting]=useState(false);
 useEffect(()=>{
  let active=true,controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined,retryTimer:ReturnType<typeof setTimeout>|undefined;
  async function load(index:number){
   controller=new AbortController();timer=setTimeout(()=>controller?.abort(),autoRetry?20000:10000);
   try{
    const v=await apiRequest<Capabilities>('/api/account/capabilities',undefined,controller.signal);
    if(typeof v?.email?.enabled!=='boolean'||typeof v?.checkout?.enabled!=='boolean'||v.checkout.test!==true||v.checkout.currency!=='KRW')throw Error('INVALID_CAPABILITIES');
    if(v.password!==undefined&&(typeof v.password?.enabled!=='boolean'||(v.password.enabled&&(v.password.test!==true||typeof v.password.adminReady!=='boolean'||typeof v.password.adminEmail!=='string'))))throw Error('INVALID_CAPABILITIES');
    if(active)setValue(v);
   }catch(error){
    if(!active)return;
    const transient=error instanceof ApiRequestFailure?[408,429,500,502,503,504].includes(error.status):error instanceof TypeError||error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)||error instanceof Error&&error.message==='API_UNAVAILABLE';
    if(autoRetry&&transient&&index<2){setReconnecting(true);retryTimer=setTimeout(()=>void load(index+1),1000*(index+1));}
    else setFailed(true);
   }finally{clearTimeout(timer);}
  }
  void load(0);
  return()=>{active=false;clearTimeout(timer);clearTimeout(retryTimer);controller?.abort();};
 },[attempt,autoRetry]);
 function retry(){setValue(null);setFailed(false);setReconnecting(false);setAttempt(n=>n+1);}
 return {value,failed,retry,reconnecting};
}
function PasswordAccountPage({mode,preserve,returnPage,cap}:Context&{mode:'signup'|'login';cap:NonNullable<Capabilities['password']>}){
 const {t,language}=useUiLanguage(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[name,setName]=useState(''),[admin,setAdmin]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const signup=mode==='signup'&&!admin,locked=useRef(false);
 async function submit(){
  if(locked.current)return;
  if(signup&&password!==confirm){setMessage(t('비밀번호가 일치하지 않습니다.','Passwords do not match.'));return;}
  locked.current=true;setBusy(true);setMessage('');const assertCurrent=signInBoundary();
  try{
   await preserve();assertCurrent();
   const session=await apiRequest<BetaSession>(signup?'/api/auth/test/signup':'/api/auth/test/login',{email,password,...(signup?{name}:{})});
   assertCurrent();await carryGuestWorkspace(accountNamespace(session.user.id),assertCurrent);assertCurrent();setPassword('');setConfirm('');
   setBetaSession(session,consumeLoginDestination());
  }catch(e){setMessage(accountError(e,language==='ko'));}finally{locked.current=false;setBusy(false);}
 }
 function selectAdmin(value:boolean){setAdmin(value);setEmail(value?cap.adminEmail:'');setPassword('');setConfirm('');setMessage('');}
 return <section className="account-page"><a className="page-back" href={'#'+returnPage}><ArrowLeft size={18}/>{t('돌아가기','Back')}</a>
  <h1>{admin?t('관리자 로그인','Administrator sign-in'):signup?t('테스트 회원가입','Test signup'):t('로그인','Sign in')}</h1>
  <p className="page-intro">{admin?t('초대코드 없이 관리자 계정으로 로그인하세요.','Sign in to your administrator account without an invitation.'):signup?t('이메일과 비밀번호로 바로 시작하세요.','Start with your email and password.'):t('가입한 계정으로 광고를 이어서 만드세요.','Continue your ad with your account.')}</p>
  <form onSubmit={e=>{e.preventDefault();void submit();}}>
   {signup&&<label className="field">{t('이름 · 선택','Name · optional')}<input autoComplete="name" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>}
   <label className="field">{t('이메일','Email')}<input type="email" autoComplete="username" inputMode="email" required maxLength={254} value={email} readOnly={admin} onChange={e=>setEmail(e.target.value)}/></label>
   <label className="field">{t('비밀번호','Password')}<input type="password" autoComplete={signup?'new-password':'current-password'} required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   {signup&&<label className="field">{t('비밀번호 확인','Confirm password')}<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
   {admin&&!cap.adminReady&&<p role="status" className="connection-notice">{t('관리자 비밀번호를 서버에 한 번 설정해야 합니다. 설정 후 바로 로그인할 수 있습니다.','Set the administrator password on the server once, then sign in directly.')}</p>}
   <button className="primary-action" disabled={busy||Boolean(admin&&!cap.adminReady)}>{busy?t('처리 중…','Working…'):signup?t('가입하고 시작하기','Sign up and start'):t('로그인하고 계속','Sign in and continue')}</button>
  </form>
  {!admin&&<p className="account-switch">{signup?t('이미 가입하셨나요?','Already have an account?'):t('처음 이용하시나요?','New here?')} <a href={signup?'#login':'#signup'}>{signup?t('로그인','Sign in'):t('회원가입','Sign up')}</a></p>}
  <button className="guest-link" onClick={()=>selectAdmin(!admin)}>{admin?t('일반 회원으로 이용하기','Use a member account'):t('관리자 로그인','Administrator sign-in')}</button>
  {message&&<p role="alert">{message}</p>}
 </section>;
}
function InviteAccountPage({preserve,returnPage}:Context){
 const {t}=useUiLanguage(),[invite,setInvite]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function login(){if(busy)return;setBusy(true);setMessage('');try{await preserve();const session=await apiRequest<BetaSession>('/api/auth/login',{invite:invite.trim()});await carryGuestWorkspace(accountNamespace(session.user.id));setBetaSession(session,consumeLoginDestination());}catch(e){setMessage(e instanceof Error&&e.message==='INVALID_INVITE'?t('초대코드를 확인해주세요. 만료된 코드는 관리자에게 다시 요청해주세요.','Check the invitation code. Ask the administrator for a new code if it expired.'):t('로그인하지 못했습니다. 초대코드와 연결 상태를 확인해주세요.','Could not sign in. Check the invitation code and connection.'));}finally{setBusy(false);}}
 return <section className="account-page"><a className="page-back" href={'#'+returnPage}><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{t('테스트 로그인','Test sign-in')}</h1><p className="page-intro">{t('받으신 초대코드로 로그인하면 입력한 광고를 이어서 생성할 수 있습니다.','Sign in with your invitation code to continue generating your ad.')}</p><form onSubmit={e=>{e.preventDefault();void login();}}><label className="field">{t('초대코드','Invitation code')}<input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={43} value={invite} onChange={e=>setInvite(e.target.value)}/></label><button className="primary-action" disabled={busy||invite.trim().length!==43}>{busy?t('로그인 중…','Signing in…'):t('로그인하고 계속','Sign in and continue')}</button></form><p className="account-help">{t('현재 비공개 베타입니다. 이메일 회원가입은 아직 연결되지 않았습니다. 초대코드는 관리자에게 받으세요.','This is a private beta. Email signup is not connected yet. Ask the administrator for an invitation.')}</p>{message&&<p role="alert">{message}</p>}</section>;
}
export function EmailAccountPage({mode,preserve,returnPage}:Context&{mode:'signup'|'login'}){
 const {t,language}=useUiLanguage(),ko=language==='ko',capability=useCapabilities(true),cap=capability.value,key='aiadcast.email-request:'+storageNamespace();
 const [passwordMode,setPasswordMode]=useState(false);
 const alive=useRef(true),attempt=useRef(0);useEffect(()=>{alive.current=true;return()=>{alive.current=false;attempt.current++;};},[]);
 const [email,setEmail]=useState(''),[request,setRequest]=useState<EmailRequest|undefined>(()=>readSession(key));
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[expired,setExpired]=useState(false),locked=useRef(false);
 const latest=useRef({preserve,returnPage});latest.current={preserve,returnPage};
 const signup=mode==='signup',demo=offlineDemo();
 function resetRequest(){attempt.current++;setRequest(undefined);sessionStorage.removeItem(key);setExpired(false);setMessage('');}
 function boundary(){const guard=signInBoundary(),version=attempt.current;return()=>{guard();if(!alive.current||version!==attempt.current)throw Error('SESSION_CHANGED');};}
 async function demoVerify(){if(!request)return;setBusy(true);try{await apiRequest('/api/demo/auth/verify',request);await check();}catch(e){setMessage(accountError(e,ko));}finally{setBusy(false);}}
 async function check(){if(!request||locked.current)return;const assertCurrent=boundary();locked.current=true;setBusy(true);try{
  if(Date.now()>=request.expires){setExpired(true);return;}
  const result=await exchangeEmail(request);assertCurrent();if(result.session){await latest.current.preserve();assertCurrent();await carryGuestWorkspace(accountNamespace(result.session.user.id),assertCurrent);assertCurrent();sessionStorage.removeItem(key);setBetaSession(result.session,consumeLoginDestination());}
 }catch(e){if(alive.current){if(e instanceof ApiRequestFailure&&e.code==='EMAIL_REQUEST_INVALID'){setExpired(true);sessionStorage.removeItem(key);setMessage('');}else setMessage(accountError(e,ko));}}finally{locked.current=false;if(alive.current)setBusy(false);}}
 useEffect(()=>{if(!cap?.email.enabled||passwordMode||!request||expired)return;const resume=()=>{if(document.visibilityState==='visible')void check();};const timer=setInterval(resume,3000);window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);return()=>{clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);};},[request,expired,ko,cap,passwordMode]);
 async function submit(){if(locked.current)return;const assertCurrent=boundary();locked.current=true;setBusy(true);setMessage('');try{await preserve();assertCurrent();const result=await apiRequest<EmailRequest>('/api/auth/email/request',{email});assertCurrent();sessionStorage.setItem(key,JSON.stringify(result));setRequest(result);setExpired(false);}catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;setBusy(false);}}
 if(!betaSession()&&!cap)return <section className="account-page"><a className="page-back" href={'#'+returnPage}><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{signup?t('회원가입','Sign up'):t('로그인','Sign in')}</h1>
  {capability.failed?<><p role="alert">{t('로그인 방식을 확인하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해주세요. 계속되면 관리자에게 문의해주세요.','Could not check the sign-in method. Check your connection and retry. If this continues, contact your administrator.')}</p><button className="primary-action" onClick={capability.retry}>{t('로그인 방식 다시 확인','Retry sign-in setup')}</button></>:<p role="status" aria-live="polite">{capability.reconnecting?t('서버 연결을 다시 확인하고 있습니다. 잠시만 기다려주세요…','Checking the server connection again. Please wait…'):t('로그인 방식을 확인하고 있습니다…','Checking how to sign in…')}</p>}
  <a className="guest-link" href="#create">{t('광고 편집 계속하기','Continue editing your ad')}</a></section>;
 if(!betaSession()&&cap?.password?.enabled&&!demo&&(!cap.email.enabled||passwordMode))return <><PasswordAccountPage mode={mode} preserve={preserve} returnPage={returnPage} cap={cap.password}/>{cap.email.enabled&&<button className="guest-link" onClick={()=>{resetRequest();setPasswordMode(false);}}>{t('이메일로 로그인','Sign in with email')}</button>}</>;
 if(!betaSession()&&cap&&!cap.email.enabled&&!demo)return <InviteAccountPage preserve={preserve} returnPage={returnPage}/>;
 if(betaSession())return <section className="account-page"><h1>{t('로그인되었습니다','You are signed in')}</h1><a className="primary-action" href={'#'+returnPage}>{t('광고 이어 만들기','Continue your ad')}</a><a href="#credits">{t('내 이용권','My credits')}</a></section>;
 return <section className="account-page"><a href={'#'+returnPage} className="page-back"><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{signup?t('회원가입','Sign up'):t('로그인','Sign in')}</h1><p className="page-intro">{demo?t('기기 내 체험 계정을 만듭니다. 실제 이메일을 보내지 않습니다.','Create a local demo account. No email is sent.'):t('이메일 하나로 시작하세요.','Start with just your email.')}</p>
 {!cap?.email.enabled&&<div className="connection-notice" id="email-availability">{t('이메일 인증 연결 준비 중입니다.','Email verification is not connected yet.')}</div>}
 {request&&!expired?<div className="email-sent"><Mail size={32}/><h2>{demo?t('체험 가입 확인','Confirm demo signup'):t('메일함을 확인해주세요','Check your inbox')}</h2><p>{demo?t('아래 버튼으로 인증 성공 상황을 시험합니다. 실제 이메일 소유 확인은 하지 않습니다.','Use the button to simulate verification. Email ownership is not verified.'):t('메일의 인증 버튼을 누르면 이 화면에서 자동으로 로그인됩니다.','Confirm the link in your email. This screen will sign you in automatically.')}</p><p className="account-help">{t('10분 안에 인증해주세요. 스팸함도 확인해주세요.','Verify within 10 minutes. Check your spam folder too.')}</p><button className="primary-action" disabled={busy} onClick={()=>void (demo?demoVerify():check())}>{demo?t('체험 인증 완료하기','Complete demo verification'):t('인증 상태 확인','Check verification')}</button><button className="guest-link" disabled={busy} onClick={resetRequest}>{t('이메일 다시 입력','Enter email again')}</button></div>:<form onSubmit={e=>{e.preventDefault();void submit();}}><label className="field" htmlFor="account-email">{t('이메일','Email')}<input required id="account-email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label><p className="account-help">{expired?t('인증 시간이 지났습니다. 다시 요청해주세요.','Verification expired. Request a new email.'):demo?t('이메일은 이 기기의 체험 계정을 구분하는 이름입니다. 비밀번호·메일 인증은 시험하지 않습니다.','Email identifies the local demo account. Passwords and email delivery are not tested.'):t('비밀번호 없이 인증메일로 로그인합니다.','Sign in with a verification email, without a password.')}</p><button className="primary-action" type="submit" disabled={busy||!cap?.email.enabled}><Mail size={18}/>{busy?t('보내는 중…','Sending…'):demo?t('체험 계정 만들기','Create demo account'):t('인증메일 받기','Send verification email')}</button></form>}
 <p className="account-switch">{signup?t('이미 가입하셨나요?','Already have an account?'):t('처음 이용하시나요?','New here?')} <a href={signup?'#login':'#signup'}>{signup?t('로그인','Sign in'):t('회원가입','Sign up')}</a></p>
 {cap?.password?.enabled&&!demo&&<button className="guest-link" disabled={busy} onClick={()=>{resetRequest();setPasswordMode(true);}}>{t('기존 비밀번호로 로그인','Sign in with existing password')}</button>}
 {message&&<p role="alert">{message}</p>}<a className="guest-link" href="#create">{t('광고 편집 계속하기','Continue editing your ad')}</a></section>;
}
export function VerifyEmailPage(){
 const {t,language}=useUiLanguage();const [token]=useState(()=>new URLSearchParams(location.hash.split('?')[1]).get('token'));
 const [done,setDone]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),locked=useRef(false);
 async function verify(){if(locked.current)return;locked.current=true;setBusy(true);try{await apiRequest('/api/auth/email/verify',{token});setDone(true);history.replaceState(null,'',location.pathname+'#verify');}catch(e){setError(accountError(e,language==='ko'));}finally{locked.current=false;setBusy(false);}}
 return <section className="account-page"><h1>{done?t('인증 완료','Email verified'):t('이메일 인증','Verify your email')}</h1><p>{done?t('가입을 시작한 앱으로 돌아가세요. 자동으로 로그인됩니다.','Return to the app where you started. You will be signed in automatically.'):t('직접 로그인을 요청하셨나요? 인증하면 요청한 기기에 로그인됩니다.','Did you request this sign-in? Confirming signs in the device that requested it.')}</p>{!done&&<button className="primary-action" disabled={busy||!token} onClick={()=>void verify()}>{t('이메일 인증하기','Verify email')}</button>}{error&&<p role="alert">{error}</p>}</section>;
}
export function CheckoutPage(props:Omit<Context,'returnPage'>&{returnPage:Context['returnPage']|'video'}){
 const native=useNativeVersion();
 if(native?.packageName===playPackage)return <PlayCheckoutPage {...props}/>;
 if(!native && location.hostname==='appassets.androidplatform.net')return null;
 return <WebCheckoutPage {...props} preview={native?.packageName===PREVIEW_PACKAGE}/>;
}
type AnnualSwitch={sourceId:string;effectiveAt:number;due:boolean;pack:string|null;amount:number|null};
function WebCheckoutPage({preserve,returnPage,preview}:Omit<Context,'returnPage'>&{returnPage:Context['returnPage']|'video';preview:boolean}){
 const {language,t}=useUiLanguage(),ko=language==='ko',capability=useCapabilities(),cap=capability.value,session=betaSession();
 const preference=readSession<{selected:string;currency:PricingCurrency}>('aiadcast.checkout-choice');
 const [selected,setSelected]=useState(()=>checkoutOffers.some(p=>p.id===preference?.selected)?preference!.selected:'plan-plus-monthly'),[currency]=useState<PricingCurrency>('KRW');
 const orderKey='aiadcast.checkout-order:'+storageNamespace(),[order,setOrder]=useState<TestOrder|undefined>(()=>readSession(orderKey));
 const previousOrderOnCatalogEntry=useRef((location.hash==='#checkout?from=generation'||location.hash==='#plans')?order?.id:undefined);
 const [agreed,setAgreed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[balance,setBalance]=useState<number|null>(null),locked=useRef(false);
 const demo=offlineDemo(),refreshing=useRef(false),refreshAgain=useRef(false);const [checking,setChecking]=useState(false);
 async function simulate(action:'approve'|'decline'|'cancel'){if(!order||locked.current)return;locked.current=true;setBusy(true);try{const next=await apiRequest<TestOrder>(`/api/demo/checkout/orders/${order.id}/${action}`,{});keepOrder(next);const status=await apiRequest<{wallet:{available:number;credits?:{available:number}}}>('/api/status');setBalance(order?.unit==='legacy-ticket'||order&&!order.unit?status.wallet.available:status.wallet.credits?.available??0);setMessage(action==='cancel'?t('결제를 취소했습니다. 이용권은 추가되지 않았습니다.','Checkout canceled. No credits were added.'):'');}catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;setBusy(false);}}
 const pack=checkoutOffers.find(p=>p.id===selected)??checkoutOffers[0];
 const [switchInfo,setSwitchInfo]=useState<AnnualSwitch|null>(null);
 const [switchReady,setSwitchReady]=useState(false),[switchRetry,setSwitchRetry]=useState(0);
 useEffect(()=>{
  let stale=false,timer:ReturnType<typeof setTimeout>;
  setSwitchReady(false);
  if(!session){setSwitchInfo(null);return;}
  async function loadSwitch(){
   try{
    const result=await apiRequest<{selection:AnnualSwitch|null}>('/api/checkout/annual-switch');
    if(stale)return;
    setSwitchInfo(result.selection);setSwitchReady(true);
    if(result.selection&&!result.selection.due){
     const delay=Math.min(86400000,Math.max(1000,result.selection.effectiveAt-Date.now()+100));
     timer=setTimeout(()=>setSwitchRetry(n=>n+1),delay);
    }
   }catch{if(!stale)setSwitchReady(false);}
  }
  void loadSwitch();
  return ()=>{stale=true;clearTimeout(timer);};
 },[session?.token,order?.state,switchRetry]);
 const reserving=pack.period==='annual'&&switchInfo!==null&&!switchInfo.due;
 const sameChoice=switchInfo?.pack===selected;
 const reservedOffer=checkoutOffers.find(o=>o.id===switchInfo?.pack);
 const annualAmount=sameChoice&&switchInfo?.amount!=null?switchInfo.amount:pack.prices.KRW;
 const when=switchInfo?new Intl.DateTimeFormat(ko?'ko-KR':'en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(switchInfo.effectiveAt):'';
 async function saveSwitch(target:string|null){
  if(!switchInfo||locked.current)return;
  locked.current=true;setBusy(true);setMessage('');
  try{
   const result=await apiRequest<{selection:AnnualSwitch|null}>('/api/checkout/annual-switch',{sourceId:switchInfo.sourceId,pack:target,amount:target?pack.prices.KRW:null,agreed});
   setSwitchInfo(result.selection);setAgreed(false);
   setMessage(target?t('연간 전환을 예약했습니다.','Annual switch scheduled.'):t('전환 예약을 취소했습니다.','Switch canceled.'));
  }catch(error){setSwitchRetry(n=>n+1);setMessage(error instanceof Error&&error.message==='SWITCH_CHECKOUT_PENDING'?t('연간 결제가 진행 중입니다. 결제 상태를 먼저 확인해 주세요.','Annual checkout is pending. Check the payment status first.'):t('전환 상태를 확인한 뒤 다시 시도해 주세요.','Check your switch status and try again.'));}
  finally{locked.current=false;setBusy(false);}
 }
 useEffect(()=>{sessionStorage.setItem('aiadcast.checkout-choice',JSON.stringify({selected,currency}));},[selected,currency]);
 function keepOrder(value:TestOrder){setOrder(value);sessionStorage.setItem(orderKey,JSON.stringify(value));}
 async function refresh(manual=false){
  if(!session)return;if(locked.current){if(manual&&refreshing.current)refreshAgain.current=true;return;}
  locked.current=true;refreshing.current=true;setChecking(true);
  try{do{refreshAgain.current=false;try{
   if(order){
    const result=await apiRequest<TestOrder>('/api/checkout/orders/'+order.id);
    if(result.id===previousOrderOnCatalogEntry.current&&(result.state==='paid'||result.state==='canceled'))clearOrder();
    else keepOrder({...order,...result});
    previousOrderOnCatalogEntry.current=undefined;
   }
   const status=await apiRequest<{wallet:{available:number;credits?:{available:number}}}>('/api/status');setBalance(order?.unit==='legacy-ticket'||order&&!order.unit?status.wallet.available:status.wallet.credits?.available??0);setMessage('');
  }catch(e){setMessage(accountError(e,ko));}}while(refreshAgain.current);
  }finally{refreshing.current=false;locked.current=false;setChecking(false);}
 }
 useEffect(()=>{if(!session)return;void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&order&&order.state==='pending')void refresh();},5000);return()=>clearInterval(timer);},[order?.id,order?.state,session?.token]);
 async function checkout(){if(locked.current||!cap?.checkout.enabled)return;locked.current=true;setBusy(true);setMessage('');try{
  await preserve();if(!session){rememberLoginDestination('checkout');location.hash='login';return;}
  const switchSource=switchInfo?.due&&sameChoice?switchInfo.sourceId:undefined;
  const key='aiadcast.checkout-request:'+session.user.id+':'+selected+(switchSource?':'+switchSource:'');
  let requestId=sessionStorage.getItem(key);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId);}
  const result=await apiRequest<TestOrder>('/api/checkout/orders',{pack:selected,requestId,agreed,switchSource});keepOrder(result);sessionStorage.setItem(orderKey+':request',key);rememberCheckout(result,returnPage);
 }catch(e){setMessage(e instanceof Error&&e.message==='SUBSCRIPTION_ALREADY_ACTIVE'?t('이용 중인 구독 또는 결제 대기 중인 구독이 있습니다. 크레딧은 별도로 추가할 수 있습니다.','An active or pending plan already exists. You can still buy top-up credits.'):accountError(e,ko));}finally{locked.current=false;setBusy(false);}}
 function clearOrder(){const requestKey=sessionStorage.getItem(orderKey+':request');if(requestKey)sessionStorage.removeItem(requestKey);sessionStorage.removeItem(orderKey+':request');if(order)sessionStorage.removeItem('aiadcast.checkout-request:'+session?.user.id+':'+order.pack);sessionStorage.removeItem(orderKey);setOrder(undefined);setAgreed(false);setMessage('');}
 if(order?.state==='paid')return <section className="account-page"><Check size={40}/><h1>{demo?t('체험 이용권이 추가되었습니다','Demo credits added'):t('이용권이 추가되었습니다','Credits added')}</h1><p>{order.credits}{order.unit==='credit-v2'?t('크레딧 충전',' credits added'):t('장 추가',' tickets added')}{balance!==null&&<> · {t('보유','Balance')} {balance}{order.unit==='credit-v2'?t('크레딧',' credits'):t('장',' tickets')}</>}</p><p className="account-help">{demo?t('시연용 · 실제 청구 없음','Demo · No real charge'):t('시연용 · 실제 청구 없음','Demo · No real charge')}</p><a className="primary-action" href={'#'+(['studio','editor','video'].includes(returnPage)?returnPage:'create')}>{t('광고 만들기','Create an ad')}</a>{order.pack.endsWith('-monthly')&&<button className="primary-action" onClick={()=>{setSelected(order.pack.replace(/-monthly$/,'-annual'));clearOrder();}}>{t('연간으로 전환','Switch to annual')}</button>}<button className="guest-link" onClick={clearOrder}>{t('이용권 목록','Credit packs')}</button></section>;
 return <section className="account-page checkout-page"><a href={'#'+returnPage} className="page-back"><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{t('요금제와 크레딧','Plans and credits')}</h1>
 {session&&<div className="checkout-creator-actions">
  <a className="wallet-button wallet-primary" href="#create">{t('광고 이미지 만들기','Create an ad image')}</a>
  <a className="wallet-button wallet-primary" href="#video">{t('광고 영상 만들기','Create an ad video')}</a>
 </div>}
 <div className="connection-notice" id="checkout-availability">{!cap?(capability.failed?t('결제 연결 상태를 확인하지 못했습니다. 다시 확인해주세요.','Could not check checkout availability. Please retry.'):t('결제 연결 상태를 확인하고 있습니다…','Checking checkout availability…')):demo?t('시연용 · 실제 청구 없음','Demo · No real charge'):cap.checkout.enabled?t('시연용 · 실제 청구 없음','Demo · No real charge'):t('결제 준비 중입니다. 준비가 완료되면 여기에서 이용권을 구매할 수 있습니다.','Test checkout is not connected on the server. Waiting will not start a payment. Ask your administrator to arrange test credits and a generation budget.')}</div>
 {capability.failed&&<button className="guest-link" onClick={capability.retry}>{t('결제 연결 다시 확인','Retry checkout connection')}</button>}
 {balance!==null&&<p className="credit-balance">{t('보유 크레딧','Your credits')} <strong>{balance}</strong></p>}
 {order?<section className="checkout-summary"><h2>{t('결제 진행 확인','Checkout status')}</h2><p>{order.credits}{order.unit==='credit-v2'?t(' 크레딧',' credits'):t('개 기존 이용권',' legacy tickets')} · {formatPrice(order.amount,'KRW',language)}</p><p>{demo?t('성공·실패·취소 상황을 선택해 시험하세요. 금액은 체험용 견적입니다.','Choose success, failure or cancellation. Prices are demo quotes.'):t('결제창에서 완료한 뒤 이 앱으로 돌아오세요.','Complete checkout, then return to this app.')}</p>{demo&&<div className="demo-checkout-actions"><button disabled={busy||order.state!=='pending'} onClick={()=>void simulate('approve')}>{t('결제 성공 시험','Simulate successful checkout')}</button><button disabled={busy||order.state!=='pending'} onClick={()=>void simulate('decline')}>{t('결제 실패 시험','Simulate failed checkout')}</button><button disabled={busy||order.state!=='pending'} onClick={()=>void simulate('cancel')}>{t('결제 취소 시험','Simulate canceled checkout')}</button>{order.state==='canceled'&&<button onClick={clearOrder}>{t('이용권 다시 선택','Select credits again')}</button>}</div>}{order.checkoutUrl&&<a className="primary-action" href={preview?order.checkoutUrl+'&app=preview':order.checkoutUrl} referrerPolicy="no-referrer">{t('결제창 열기','Open checkout')}</a>}<button className="guest-link" disabled={busy} aria-busy={checking} aria-label={t('결제 상태 확인','Check payment status')} onClick={()=>void refresh(true)}>{checking?t('확인 중 · 다시 확인 예약','Checking · queue another check'):t('결제 상태 확인','Check payment status')}</button><details><summary>{t('결제를 취소했나요?','Canceled checkout?')}</summary><p>{t('승인 여부가 불확실하면 먼저 상태를 확인해주세요.','If approval is uncertain, check the status first.')}</p><button onClick={clearOrder}>{t('이용권 다시 선택','Select credits again')}</button></details></section>:<>
 {switchInfo?.pack&&<section className="checkout-summary" aria-live="polite"><h2>{t('연간 전환 예약','Scheduled annual switch')}</h2>
  <p>{t(reservedOffer?.ko??'',reservedOffer?.en??'')} · {formatPrice(switchInfo.amount,'KRW',language)}</p>
  <p>{when} (KST) · {t('월간 이용 종료 후 직접 결제하면 연간 구독이 시작됩니다.','Complete checkout after your monthly term ends to start the annual plan.')}</p>
  {switchInfo.due&&!sameChoice&&<button className="primary-action" onClick={()=>{setSelected(switchInfo.pack!);setAgreed(false);}}>{t('예약한 요금제 선택','Select reserved plan')}</button>}
  <button type="button" className="wallet-button wallet-primary annual-switch-cancel" disabled={busy} onClick={()=>void saveSwitch(null)}>{t('전환 예약 취소','Cancel switch')}</button></section>}
 <CreditOffers value={selected} change={id=>{setSelected(id);setAgreed(false);}}/>
 {pack.period!=='topup'&&<p className="account-help">{t('베타 테스트 결제입니다. 기간이 끝나도 카드가 자동 청구되지 않습니다.','Beta test checkout. Your card will not be charged automatically at renewal.')}</p>}
 <p className="account-help">{t('이미지는 1장당 5크레딧, AI 영상은 1초당 2크레딧입니다. 생성 전에 총 차감액을 확인할 수 있습니다.','Images use 5 credits each and AI video uses 2 credits per second. Review the total before creating.')}</p>
 <section className="checkout-summary" aria-label={t('결제 확인','Order review')}><h2>{currency==='USD'?t('USD 안내 가격','USD display price'):t('최종 금액','Total')}</h2><p><span>{pack.period==='topup'?t('일회 충전','One-time top-up'):t(pack.ko,pack.en)+' · '+(pack.period==='annual'?t('1년 결제','Annual payment'):t('한 달 결제','Monthly payment'))}</span><strong>{formatPrice(currency==='KRW'?annualAmount:pack.prices[currency],currency,language)}</strong></p>{currency==='USD'&&<p>{t('실제 테스트 결제 금액 (KRW)','Actual test checkout amount (KRW)')}: <strong>{formatPrice(pack.prices.KRW,'KRW',language)}</strong> · {t('USD 결제는 지원하지 않습니다. 원화로 전환해 진행하세요.','USD checkout is not supported. Switch to KRW to continue.')}</p>}<p className="checkout-tax">{currency==='KRW'?t('부가세 포함','Includes Korean VAT'):t('현지 세금 별도 · 원화 테스트 결제만 지원','Local taxes excluded · Test checkout supports KRW only')}</p></section>
 {reserving&&<p className="account-help">{t('오늘 결제액은 0원입니다. '+when+' (한국시간) 이후 예약한 요금제를 결제하면 연간 구독이 시작됩니다.','Nothing is due today. Complete checkout after '+when+' (KST) to start the annual subscription.')}</p>}
 {session&&pack.period==='annual'&&!switchReady&&<button className="guest-link" onClick={()=>setSwitchRetry(n=>n+1)}>{t('구독 상태 다시 확인','Refresh subscription status')}</button>}
 <RefundNotice/>
 {cap?.checkout.enabled&&session&&<label className="checkout-consent"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>{t('이용권 수량, 금액과 환불 조건을 확인했습니다','I have checked the credits, price and refund conditions.')}</label>}
 <button className="primary-action" disabled={busy||!cap?.checkout.enabled||currency!=='KRW'||Boolean(session&&(!agreed||(pack.period==='annual'&&!switchReady)))||Boolean(reserving&&sameChoice)} onClick={()=>reserving?void saveSwitch(selected):void checkout()}>{!cap?(capability.failed?t('결제 상태 확인 실패','Checkout check failed'):t('결제 상태 확인 중…','Checking checkout…')):!cap.checkout.enabled?t('테스트 결제 미연결','Test checkout unavailable'):!session?t('이메일로 로그인하고 계속','Sign in with email to continue'):busy?t('준비 중…','Preparing…'):reserving?(sameChoice?t('전환 예약 완료','Switch scheduled'):t('연간 전환 예약','Schedule annual switch')):switchInfo?.due&&sameChoice?t('연간 전환 결제','Pay for annual switch'):t('결제','Pay')}</button></>}
 {message&&<p role="alert">{message}</p>}</section>;
}
