import {rememberCheckout} from './checkout-return';
import {offlineDemo} from './demo-mode';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,Mail} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import {formatPrice,pricingCatalog,type PricingCurrency} from './pricing';
import {apiRequest} from './generation-client';
import {betaSession,setBetaSession,storageNamespace,accountNamespace,type BetaSession} from './beta-session';
import {carryGuestWorkspace} from './workspace-draft';
import {accountError,exchangeEmail,readSession,type Capabilities,type EmailRequest,type TestOrder} from './account-client';
import './account-pages.css';
export {PaymentBrowserPage} from './PaymentBrowserPage';
type Context={preserve:()=>Promise<void>;returnPage:'create'|'studio'|'editor'|'home'};
function useCapabilities(){
 const [value,setValue]=useState<Capabilities|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  apiRequest<Capabilities>('/api/account/capabilities',undefined,controller.signal).then(v=>{
   if(typeof v?.email?.enabled!=='boolean'||typeof v?.checkout?.enabled!=='boolean'||v.checkout.test!==true||v.checkout.currency!=='KRW')throw Error('INVALID_CAPABILITIES');
   if(v.password!==undefined&&(typeof v.password?.enabled!=='boolean'||(v.password.enabled&&(v.password.test!==true||typeof v.password.adminReady!=='boolean'||typeof v.password.adminEmail!=='string'))))throw Error('INVALID_CAPABILITIES');
   if(active)setValue(v);
  }).catch(()=>{if(active)setFailed(true);}).finally(()=>clearTimeout(timer));
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[attempt]);
 function retry(){setValue(null);setFailed(false);setAttempt(n=>n+1);}
 return {value,failed,retry};
}
function PasswordAccountPage({mode,preserve,returnPage,cap}:Context&{mode:'signup'|'login';cap:NonNullable<Capabilities['password']>}){
 const {t,language}=useUiLanguage(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[name,setName]=useState(''),[admin,setAdmin]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const signup=mode==='signup'&&!admin,locked=useRef(false);
 async function submit(){
  if(locked.current)return;
  if(signup&&password!==confirm){setMessage(t('비밀번호가 일치하지 않습니다.','Passwords do not match.'));return;}
  locked.current=true;setBusy(true);setMessage('');
  try{
   await preserve();
   const session=await apiRequest<BetaSession>(signup?'/api/auth/test/signup':'/api/auth/test/login',{email,password,...(signup?{name}:{})});
   await carryGuestWorkspace(accountNamespace(session.user.id));setPassword('');setConfirm('');
   const paymentReturn=sessionStorage.getItem('aiadcast.checkout-login-return')==='1';sessionStorage.removeItem('aiadcast.checkout-login-return');setBetaSession(session,paymentReturn?'checkout-return':admin&&returnPage==='home'?'admin':returnPage);
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
  <p className="account-help">{t('테스트 모드 · 이메일 인증을 생략합니다. 입력한 이메일의 소유 여부는 확인하지 않습니다.','Test mode · Email verification is skipped. Ownership of the email address is not verified.')}</p>
  {!admin&&<p className="account-switch">{signup?t('이미 가입하셨나요?','Already have an account?'):t('처음 이용하시나요?','New here?')} <a href={signup?'#login':'#signup'}>{signup?t('로그인','Sign in'):t('회원가입','Sign up')}</a></p>}
  <button className="guest-link" onClick={()=>selectAdmin(!admin)}>{admin?t('일반 회원으로 이용하기','Use a member account'):t('관리자 로그인','Administrator sign-in')}</button>
  {message&&<p role="alert">{message}</p>}
 </section>;
}
function InviteAccountPage({preserve,returnPage}:Context){
 const {t}=useUiLanguage(),[invite,setInvite]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function login(){if(busy)return;setBusy(true);setMessage('');try{await preserve();const session=await apiRequest<BetaSession>('/api/auth/login',{invite:invite.trim()});await carryGuestWorkspace(accountNamespace(session.user.id));setBetaSession(session,returnPage);}catch(e){setMessage(e instanceof Error&&e.message==='INVALID_INVITE'?t('초대코드를 확인해주세요. 만료된 코드는 관리자에게 다시 요청해주세요.','Check the invitation code. Ask the administrator for a new code if it expired.'):t('로그인하지 못했습니다. 초대코드와 연결 상태를 확인해주세요.','Could not sign in. Check the invitation code and connection.'));}finally{setBusy(false);}}
 return <section className="account-page"><a className="page-back" href={'#'+returnPage}><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{t('테스트 로그인','Test sign-in')}</h1><p className="page-intro">{t('받으신 초대코드로 로그인하면 입력한 광고를 이어서 생성할 수 있습니다.','Sign in with your invitation code to continue generating your ad.')}</p><form onSubmit={e=>{e.preventDefault();void login();}}><label className="field">{t('초대코드','Invitation code')}<input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={43} value={invite} onChange={e=>setInvite(e.target.value)}/></label><button className="primary-action" disabled={busy||invite.trim().length!==43}>{busy?t('로그인 중…','Signing in…'):t('로그인하고 계속','Sign in and continue')}</button></form><p className="account-help">{t('현재 비공개 베타입니다. 이메일 회원가입은 아직 연결되지 않았습니다. 초대코드는 관리자에게 받으세요.','This is a private beta. Email signup is not connected yet. Ask the administrator for an invitation.')}</p>{message&&<p role="alert">{message}</p>}</section>;
}
export function EmailAccountPage({mode,preserve,returnPage}:Context&{mode:'signup'|'login'}){
 const {t,language}=useUiLanguage(),ko=language==='ko',capability=useCapabilities(),cap=capability.value,key='aiadcast.email-request:'+storageNamespace();
 const [email,setEmail]=useState(''),[request,setRequest]=useState<EmailRequest|undefined>(()=>readSession(key));
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[expired,setExpired]=useState(false),locked=useRef(false);
 const latest=useRef({preserve,returnPage});latest.current={preserve,returnPage};
 const signup=mode==='signup',demo=offlineDemo();
 async function demoVerify(){if(!request)return;setBusy(true);try{await apiRequest('/api/demo/auth/verify',request);await check();}catch(e){setMessage(accountError(e,ko));}finally{setBusy(false);}}
 async function check(){if(!request||locked.current)return;locked.current=true;try{
  if(Date.now()>=request.expires){setExpired(true);return;}
  const result=await exchangeEmail(request);if(result.session){await latest.current.preserve();await carryGuestWorkspace(accountNamespace(result.session.user.id));sessionStorage.removeItem(key);const target=sessionStorage.getItem('aiadcast.auth-return')==='checkout'?'checkout':latest.current.returnPage;sessionStorage.removeItem('aiadcast.auth-return');const paymentReturn=sessionStorage.getItem('aiadcast.checkout-login-return')==='1';sessionStorage.removeItem('aiadcast.checkout-login-return');setBetaSession(result.session,paymentReturn?'checkout-return':target);}
 }catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;}}
 useEffect(()=>{if(!cap?.email.enabled||cap.password?.enabled&&!demo||!request||expired)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')void check();},3000);return()=>clearInterval(timer);},[request,expired,ko,cap,demo]);
 async function submit(){if(locked.current)return;locked.current=true;setBusy(true);setMessage('');try{await preserve();const result=await apiRequest<EmailRequest>('/api/auth/email/request',{email});sessionStorage.setItem(key,JSON.stringify(result));setRequest(result);setExpired(false);}catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;setBusy(false);}}
 if(!betaSession()&&!cap)return <section className="account-page"><a className="page-back" href={'#'+returnPage}><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{signup?t('회원가입','Sign up'):t('로그인','Sign in')}</h1>
  {capability.failed?<><p role="alert">{t('로그인 방식을 확인하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해주세요. 계속되면 관리자에게 문의해주세요.','Could not check the sign-in method. Check your connection and retry. If this continues, contact your administrator.')}</p><button className="primary-action" onClick={capability.retry}>{t('로그인 방식 다시 확인','Retry sign-in setup')}</button></>:<p role="status" aria-live="polite">{t('로그인 방식을 확인하고 있습니다…','Checking how to sign in…')}</p>}
  <a className="guest-link" href="#create">{t('광고 편집 계속하기','Continue editing your ad')}</a></section>;
 if(!betaSession()&&cap?.password?.enabled&&!demo)return <PasswordAccountPage mode={mode} preserve={preserve} returnPage={returnPage} cap={cap.password}/>;
 if(!betaSession()&&cap&&!cap.email.enabled&&!demo)return <InviteAccountPage preserve={preserve} returnPage={returnPage}/>;
 if(betaSession())return <section className="account-page"><h1>{t('로그인되었습니다','You are signed in')}</h1><a className="primary-action" href={'#'+returnPage}>{t('광고 이어 만들기','Continue your ad')}</a><a href="#credits">{t('내 이용권','My credits')}</a></section>;
 return <section className="account-page"><a href={'#'+returnPage} className="page-back"><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{signup?t('회원가입','Sign up'):t('로그인','Sign in')}</h1><p className="page-intro">{demo?t('기기 내 체험 계정을 만듭니다. 실제 이메일을 보내지 않습니다.','Create a local demo account. No email is sent.'):t('이메일 하나로 시작하세요.','Start with just your email.')}</p>
 {!cap?.email.enabled&&<div className="connection-notice" id="email-availability">{t('이메일 인증 연결 준비 중입니다.','Email verification is not connected yet.')}</div>}
 {request&&!expired?<div className="email-sent"><Mail size={32}/><h2>{demo?t('체험 가입 확인','Confirm demo signup'):t('메일함을 확인해주세요','Check your inbox')}</h2><p>{demo?t('아래 버튼으로 인증 성공 상황을 시험합니다. 실제 이메일 소유 확인은 하지 않습니다.','Use the button to simulate verification. Email ownership is not verified.'):t('메일의 인증 버튼을 누르면 이 화면에서 자동으로 로그인됩니다.','Confirm the link in your email. This screen will sign you in automatically.')}</p><p className="account-help">{t('10분 안에 인증해주세요. 스팸함도 확인해주세요.','Verify within 10 minutes. Check your spam folder too.')}</p><button className="primary-action" disabled={busy} onClick={()=>void (demo?demoVerify():check())}>{demo?t('체험 인증 완료하기','Complete demo verification'):t('인증 상태 확인','Check verification')}</button><button className="guest-link" onClick={()=>{setRequest(undefined);sessionStorage.removeItem(key);setMessage('');}}>{t('이메일 다시 입력','Enter email again')}</button></div>:<form onSubmit={e=>{e.preventDefault();void submit();}}><label className="field" htmlFor="account-email">{t('이메일','Email')}<input required id="account-email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label><p className="account-help">{expired?t('인증 시간이 지났습니다. 다시 요청해주세요.','Verification expired. Request a new email.'):demo?t('이메일은 이 기기의 체험 계정을 구분하는 이름입니다. 비밀번호·메일 인증은 시험하지 않습니다.','Email identifies the local demo account. Passwords and email delivery are not tested.'):t('비밀번호 없이 인증메일로 로그인합니다.','Sign in with a verification email, without a password.')}</p><button className="primary-action" type="submit" disabled={busy||!cap?.email.enabled}><Mail size={18}/>{busy?t('보내는 중…','Sending…'):demo?t('체험 계정 만들기','Create demo account'):t('인증메일 받기','Send verification email')}</button></form>}
 <p className="account-switch">{signup?t('이미 가입하셨나요?','Already have an account?'):t('처음 이용하시나요?','New here?')} <a href={signup?'#login':'#signup'}>{signup?t('로그인','Sign in'):t('회원가입','Sign up')}</a></p>
 {message&&<p role="alert">{message}</p>}<a className="guest-link" href="#create">{t('광고 편집 계속하기','Continue editing your ad')}</a></section>;
}
export function VerifyEmailPage(){
 const {t,language}=useUiLanguage();const [token]=useState(()=>new URLSearchParams(location.hash.split('?')[1]).get('token'));
 const [done,setDone]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function verify(){setBusy(true);try{await apiRequest('/api/auth/email/verify',{token});setDone(true);history.replaceState(null,'',location.pathname+'#verify');}catch(e){setError(accountError(e,language==='ko'));}finally{setBusy(false);}}
 return <section className="account-page"><h1>{done?t('인증 완료','Email verified'):t('이메일 인증','Verify your email')}</h1><p>{done?t('가입을 시작한 앱으로 돌아가세요. 자동으로 로그인됩니다.','Return to the app where you started. You will be signed in automatically.'):t('직접 로그인을 요청하셨나요? 인증하면 요청한 기기에 로그인됩니다.','Did you request this sign-in? Confirming signs in the device that requested it.')}</p>{!done&&<button className="primary-action" disabled={busy||!token} onClick={()=>void verify()}>{t('이메일 인증하기','Verify email')}</button>}{error&&<p role="alert">{error}</p>}</section>;
}
export function CheckoutPage({preserve,returnPage}:Context){
 const {language,t}=useUiLanguage(),ko=language==='ko',capability=useCapabilities(),cap=capability.value,session=betaSession();
 const preference=readSession<{selected:string;currency:PricingCurrency}>('aiadcast.checkout-choice');
 const [selected,setSelected]=useState(()=>pricingCatalog.packs.some(p=>p.id===preference?.selected)?preference!.selected:'credits-v2-100'),[currency,setCurrency]=useState<PricingCurrency>(preference?.currency==='USD'?'USD':'KRW');
 const orderKey='aiadcast.checkout-order:'+storageNamespace(),[order,setOrder]=useState<TestOrder|undefined>(()=>readSession(orderKey));
 const [agreed,setAgreed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[balance,setBalance]=useState<number|null>(null),locked=useRef(false);
 const demo=offlineDemo(),refreshing=useRef(false),refreshAgain=useRef(false);const [checking,setChecking]=useState(false);
 async function simulate(action:'approve'|'decline'|'cancel'){if(!order||locked.current)return;locked.current=true;setBusy(true);try{const next=await apiRequest<TestOrder>(`/api/demo/checkout/orders/${order.id}/${action}`,{});keepOrder(next);const status=await apiRequest<{wallet:{available:number;credits?:{available:number}}}>('/api/status');setBalance(order?.unit==='legacy-ticket'||order&&!order.unit?status.wallet.available:status.wallet.credits?.available??0);setMessage(action==='cancel'?t('결제를 취소했습니다. 이용권은 추가되지 않았습니다.','Checkout canceled. No credits were added.'):'');}catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;setBusy(false);}}
 const pack=pricingCatalog.packs.find(p=>p.id===selected)!,names=[t('체험용','Trial'),t('기본형','Essential'),t('묶음형','Bundle')];
 useEffect(()=>{sessionStorage.setItem('aiadcast.checkout-choice',JSON.stringify({selected,currency}));},[selected,currency]);
 function keepOrder(value:TestOrder){setOrder(value);sessionStorage.setItem(orderKey,JSON.stringify(value));}
 async function refresh(manual=false){
  if(!session)return;if(locked.current){if(manual&&refreshing.current)refreshAgain.current=true;return;}
  locked.current=true;refreshing.current=true;setChecking(true);
  try{do{refreshAgain.current=false;try{
   if(order){const result=await apiRequest<TestOrder>('/api/checkout/orders/'+order.id);keepOrder({...order,...result});}
   const status=await apiRequest<{wallet:{available:number;credits?:{available:number}}}>('/api/status');setBalance(order?.unit==='legacy-ticket'||order&&!order.unit?status.wallet.available:status.wallet.credits?.available??0);setMessage('');
  }catch(e){setMessage(accountError(e,ko));}}while(refreshAgain.current);
  }finally{refreshing.current=false;locked.current=false;setChecking(false);}
 }
 useEffect(()=>{if(!session)return;void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&order&&order.state==='pending')void refresh();},5000);return()=>clearInterval(timer);},[order?.id,order?.state,session?.token]);
 async function checkout(){if(locked.current||!cap?.checkout.enabled)return;locked.current=true;setBusy(true);setMessage('');try{
  await preserve();if(!session){sessionStorage.setItem('aiadcast.auth-return','checkout');location.hash='login';return;}
  const key='aiadcast.checkout-request:'+session.user.id+':'+selected;
  let requestId=sessionStorage.getItem(key);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId);}
  const result=await apiRequest<TestOrder>('/api/checkout/orders',{pack:selected,requestId,agreed});keepOrder(result);rememberCheckout(result,returnPage);
 }catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;setBusy(false);}}
 function clearOrder(){if(order)sessionStorage.removeItem('aiadcast.checkout-request:'+session?.user.id+':'+order.pack);sessionStorage.removeItem(orderKey);setOrder(undefined);setAgreed(false);setMessage('');}
 if(order?.state==='paid')return <section className="account-page"><Check size={40}/><h1>{demo?t('체험 이용권이 추가되었습니다','Demo credits added'):t('이용권이 추가되었습니다','Credits added')}</h1><p>{order.credits}{t('개 추가',' credits added')}{balance!==null&&<> · {t('보유','Balance')} {balance}{t('개','')}</>}</p><p className="account-help">{demo?t('시연용 · 실제 청구 없음','Demo · No real charge'):t('시연용 · 실제 청구 없음','Demo · No real charge')}</p><a className="primary-action" href={'#'+(returnPage==='home'?'create':returnPage)}>{t('광고 만들기','Create an ad')}</a><button className="guest-link" onClick={clearOrder}>{t('이용권 목록','Credit packs')}</button></section>;
 return <section className="account-page checkout-page"><a href={'#'+returnPage} className="page-back"><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{t('이용권 선택','Choose credits')}</h1>{session&&<a className="primary-action" href="#checkout-return">{t('광고 이미지 만들기','Create an ad image')}</a>}<p className="page-intro">{t('자동 구독 없이, 필요한 만큼.','Buy what you need. No subscription.')}</p>
 <div className="connection-notice" id="checkout-availability">{!cap?(capability.failed?t('결제 연결 상태를 확인하지 못했습니다. 다시 확인해주세요.','Could not check checkout availability. Please retry.'):t('결제 연결 상태를 확인하고 있습니다…','Checking checkout availability…')):demo?t('시연용 · 실제 청구 없음','Demo · No real charge'):cap.checkout.enabled?t('시연용 · 실제 청구 없음','Demo · No real charge'):t('서버에 테스트 결제가 연결되어 있지 않습니다. 기다려도 결제가 시작되지 않습니다. 관리자에게 테스트 이용권과 생성 예산 준비를 요청해주세요.','Test checkout is not connected on the server. Waiting will not start a payment. Ask your administrator to arrange test credits and a generation budget.')}</div>
 {capability.failed&&<button className="guest-link" onClick={capability.retry}>{t('결제 연결 다시 확인','Retry checkout connection')}</button>}
 {balance!==null&&<p className="credit-balance">{t('보유 이용권','Your credits')} <strong>{balance}{t('개','')}</strong></p>}
 {order?<section className="checkout-summary"><h2>{t('결제 진행 확인','Checkout status')}</h2><p>{order.credits}{order.unit==='credit-v2'?t(' 크레딧',' credits'):t('개 기존 이용권',' legacy tickets')} · {formatPrice(order.amount,'KRW',language)}</p><p>{demo?t('성공·실패·취소 상황을 선택해 시험하세요. 금액은 체험용 견적입니다.','Choose success, failure or cancellation. Prices are demo quotes.'):t('결제창에서 완료한 뒤 이 앱으로 돌아오세요.','Complete checkout, then return to this app.')}</p>{demo&&<div className="demo-checkout-actions"><button disabled={busy||order.state!=='pending'} onClick={()=>void simulate('approve')}>{t('결제 성공 시험','Simulate successful checkout')}</button><button disabled={busy||order.state!=='pending'} onClick={()=>void simulate('decline')}>{t('결제 실패 시험','Simulate failed checkout')}</button><button disabled={busy||order.state!=='pending'} onClick={()=>void simulate('cancel')}>{t('결제 취소 시험','Simulate canceled checkout')}</button>{order.state==='canceled'&&<button onClick={clearOrder}>{t('이용권 다시 선택','Select credits again')}</button>}</div>}{order.checkoutUrl&&<a className="primary-action" href={order.checkoutUrl} referrerPolicy="no-referrer">{t('결제창 열기','Open checkout')}</a>}<button className="guest-link" disabled={busy} aria-busy={checking} aria-label={t('결제 상태 확인','Check payment status')} onClick={()=>void refresh(true)}>{checking?t('확인 중 · 다시 확인 예약','Checking · queue another check'):t('결제 상태 확인','Check payment status')}</button><details><summary>{t('결제를 취소했나요?','Canceled checkout?')}</summary><p>{t('승인 여부가 불확실하면 먼저 상태를 확인해주세요.','If approval is uncertain, check the status first.')}</p><button onClick={clearOrder}>{t('이용권 다시 선택','Select credits again')}</button></details></section>:<>
 <label className="field checkout-currency">{t('표시 통화','Display currency')}<select value={currency} onChange={e=>setCurrency(e.target.value as PricingCurrency)}><option value="KRW">KRW · 원</option><option value="USD">USD · $</option></select></label>
 <fieldset className="checkout-packs"><legend>{t('광고 이용권','Ad credits')}</legend>{pricingCatalog.packs.map((item,i)=><label key={item.id} className={selected===item.id?'selected':''}><input type="radio" name="credit-pack" value={item.id} checked={selected===item.id} onChange={()=>setSelected(item.id)}/><span><strong>{names[i]} · {item.credits}{t(' 크레딧',' credits')}</strong></span><b>{formatPrice(item.prices[currency],currency,language)}</b></label>)}</fieldset>
 <p className="account-help">{t('생성·재생성 1회 10크레딧 · 정상 결과 제공 시 차감. 취향 반려·미확인 시 자동 환급하지 않습니다. 입력 수정·저장·공유는 무료입니다. 기존 이용권을 먼저 사용하고 소진 후 신규 크레딧을 사용합니다.','10 credits per generation or regeneration, charged on delivery. Preference rejection or no review does not refund. Input edits, save and share are free. Legacy tickets are used first.')}</p>
 <section className="checkout-summary" aria-label={t('결제 확인','Order review')}><h2>{t('최종 금액','Total')}</h2><p><span>{pack.credits}{t(' 크레딧',' credits')}</span><strong>{formatPrice(pack.prices[currency],currency,language)}</strong></p><p className="checkout-tax">{currency==='KRW'?t('부가세 포함','Includes Korean VAT'):t('현지 세금 별도 · 원화 테스트 결제만 지원','Local taxes excluded · Test checkout supports KRW only')}</p></section>
 {cap?.checkout.enabled&&session&&<label className="checkout-consent"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>{t('이용권 수량과 금액을 확인했습니다','I have checked the credits and amount.')}</label>}
 <button className="primary-action" disabled={busy||!cap?.checkout.enabled||currency!=='KRW'||Boolean(session&&!agreed)} onClick={()=>void checkout()}>{!cap?(capability.failed?t('결제 상태 확인 실패','Checkout check failed'):t('결제 상태 확인 중…','Checking checkout…')):!cap.checkout.enabled?t('테스트 결제 미연결','Test checkout unavailable'):!session?t('이메일로 로그인하고 계속','Sign in with email to continue'):busy?t('준비 중…','Preparing…'):t('결제','Pay')}</button></>}
 {message&&<p role="alert">{message}</p>}</section>;
}

