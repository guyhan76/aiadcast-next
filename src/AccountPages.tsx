import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,Mail} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import {formatPrice,pricingCatalog,type PricingCurrency} from './pricing';
import {apiRequest} from './generation-client';
import {betaSession,setBetaSession,storageNamespace,accountNamespace} from './beta-session';
import {carryGuestWorkspace} from './workspace-draft';
import {accountError,exchangeEmail,readSession,type Capabilities,type EmailRequest,type TestOrder} from './account-client';
import './account-pages.css';
export {PaymentBrowserPage} from './PaymentBrowserPage';
type Context={preserve:()=>Promise<void>;returnPage:'create'|'studio'|'home'};
function useCapabilities(){const [value,setValue]=useState<Capabilities|null>(null);useEffect(()=>{let active=true;apiRequest<Capabilities>('/api/account/capabilities').then(v=>{if(active)setValue(v);}).catch(()=>{});return()=>{active=false};},[]);return value;}
export function EmailAccountPage({mode,preserve,returnPage}:Context&{mode:'signup'|'login'}){
 const {t,language}=useUiLanguage(),ko=language==='ko',cap=useCapabilities(),key='aiadcast.email-request:'+storageNamespace();
 const [email,setEmail]=useState(''),[request,setRequest]=useState<EmailRequest|undefined>(()=>readSession(key));
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[expired,setExpired]=useState(false),locked=useRef(false);
 const latest=useRef({preserve,returnPage});latest.current={preserve,returnPage};
 const signup=mode==='signup';
 async function check(){if(!request||locked.current)return;locked.current=true;try{
  if(Date.now()>=request.expires){setExpired(true);return;}
  const result=await exchangeEmail(request);if(result.session){await latest.current.preserve();await carryGuestWorkspace(accountNamespace(result.session.user.id));sessionStorage.removeItem(key);const target=sessionStorage.getItem('aiadcast.auth-return')==='checkout'?'checkout':latest.current.returnPage;sessionStorage.removeItem('aiadcast.auth-return');setBetaSession(result.session,target);}
 }catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;}}
 useEffect(()=>{if(!request||expired)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')void check();},3000);return()=>clearInterval(timer);},[request,expired,ko]);
 async function submit(){if(locked.current)return;locked.current=true;setBusy(true);setMessage('');try{await preserve();const result=await apiRequest<EmailRequest>('/api/auth/email/request',{email});sessionStorage.setItem(key,JSON.stringify(result));setRequest(result);setExpired(false);}catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;setBusy(false);}}
 if(betaSession())return <section className="account-page"><h1>{t('로그인되었습니다','You are signed in')}</h1><a className="primary-action" href={'#'+returnPage}>{t('광고 이어 만들기','Continue your ad')}</a><a href="#checkout">{t('내 이용권','My credits')}</a></section>;
 return <section className="account-page"><a href={'#'+returnPage} className="page-back"><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{signup?t('회원가입','Sign up'):t('로그인','Sign in')}</h1><p className="page-intro">{t('이메일 하나로 시작하세요.','Start with just your email.')}</p>
 {!cap?.email.enabled&&<div className="connection-notice" id="email-availability">{t('이메일 인증 연결 준비 중입니다.','Email verification is not connected yet.')}</div>}
 {request&&!expired?<div className="email-sent"><Mail size={32}/><h2>{t('메일함을 확인해주세요','Check your inbox')}</h2><p>{t('메일의 인증 버튼을 누르면 이 화면에서 자동으로 로그인됩니다.','Confirm the link in your email. This screen will sign you in automatically.')}</p><p className="account-help">{t('10분 안에 인증해주세요. 스팸함도 확인해주세요.','Verify within 10 minutes. Check your spam folder too.')}</p><button className="primary-action" onClick={()=>void check()}>{t('인증 상태 확인','Check verification')}</button><button className="guest-link" onClick={()=>{setRequest(undefined);sessionStorage.removeItem(key);setMessage('');}}>{t('이메일 다시 입력','Enter email again')}</button></div>:<form onSubmit={e=>{e.preventDefault();void submit();}}><label className="field" htmlFor="account-email">{t('이메일','Email')}<input required id="account-email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label><p className="account-help">{expired?t('인증 시간이 지났습니다. 다시 요청해주세요.','Verification expired. Request a new email.'):t('비밀번호 없이 인증메일로 로그인합니다.','Sign in with a verification email, without a password.')}</p><button className="primary-action" type="submit" disabled={busy||!cap?.email.enabled}><Mail size={18}/>{busy?t('보내는 중…','Sending…'):t('인증메일 받기','Send verification email')}</button></form>}
 {message&&<p role="alert">{message}</p>}<a className="guest-link" href="#create">{t('광고 편집 계속하기','Continue editing your ad')}</a></section>;
}
export function VerifyEmailPage(){
 const {t,language}=useUiLanguage();const [token]=useState(()=>new URLSearchParams(location.hash.split('?')[1]).get('token'));
 const [done,setDone]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function verify(){setBusy(true);try{await apiRequest('/api/auth/email/verify',{token});setDone(true);history.replaceState(null,'',location.pathname+'#verify');}catch(e){setError(accountError(e,language==='ko'));}finally{setBusy(false);}}
 return <section className="account-page"><h1>{done?t('인증 완료','Email verified'):t('이메일 인증','Verify your email')}</h1><p>{done?t('가입을 시작한 앱으로 돌아가세요. 자동으로 로그인됩니다.','Return to the app where you started. You will be signed in automatically.'):t('직접 로그인을 요청하셨나요? 인증하면 요청한 기기에 로그인됩니다.','Did you request this sign-in? Confirming signs in the device that requested it.')}</p>{!done&&<button className="primary-action" disabled={busy||!token} onClick={()=>void verify()}>{t('이메일 인증하기','Verify email')}</button>}{error&&<p role="alert">{error}</p>}</section>;
}
export function CheckoutPage({preserve,returnPage}:Context){
 const {language,t}=useUiLanguage(),ko=language==='ko',cap=useCapabilities(),session=betaSession();
 const preference=readSession<{selected:string;currency:PricingCurrency}>('aiadcast.checkout-choice');
 const [selected,setSelected]=useState(()=>pricingCatalog.packs.some(p=>p.id===preference?.selected)?preference!.selected:'basic'),[currency,setCurrency]=useState<PricingCurrency>(preference?.currency==='USD'?'USD':'KRW');
 const orderKey='aiadcast.checkout-order:'+storageNamespace(),[order,setOrder]=useState<TestOrder|undefined>(()=>readSession(orderKey));
 const [agreed,setAgreed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[balance,setBalance]=useState<number|null>(null),locked=useRef(false);
 const pack=pricingCatalog.packs.find(p=>p.id===selected)!,names=[t('체험용','Trial'),t('기본형','Essential'),t('묶음형','Bundle')];
 useEffect(()=>{sessionStorage.setItem('aiadcast.checkout-choice',JSON.stringify({selected,currency}));},[selected,currency]);
 function keepOrder(value:TestOrder){setOrder(value);sessionStorage.setItem(orderKey,JSON.stringify(value));}
 async function refresh(){if(!session||locked.current)return;locked.current=true;try{
  if(order){const result=await apiRequest<TestOrder>('/api/checkout/orders/'+order.id);keepOrder({...order,...result});}
  const status=await apiRequest<{wallet:{available:number}}>('/api/status');setBalance(status.wallet.available);setMessage('');
 }catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;}}
 useEffect(()=>{if(!session)return;void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&order&&order.state!=='paid')void refresh();},5000);return()=>clearInterval(timer);},[order?.id,order?.state,session?.token]);
 async function checkout(){if(locked.current)return;locked.current=true;setBusy(true);setMessage('');try{
  await preserve();if(!session){sessionStorage.setItem('aiadcast.auth-return','checkout');location.hash='login';return;}
  const key='aiadcast.checkout-request:'+session.user.id+':'+selected;
  let requestId=sessionStorage.getItem(key);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(key,requestId);}
  const result=await apiRequest<TestOrder>('/api/checkout/orders',{pack:selected,requestId,agreed});keepOrder(result);
 }catch(e){setMessage(accountError(e,ko));}finally{locked.current=false;setBusy(false);}}
 function clearOrder(){if(order)sessionStorage.removeItem('aiadcast.checkout-request:'+session?.user.id+':'+order.pack);sessionStorage.removeItem(orderKey);setOrder(undefined);setAgreed(false);setMessage('');}
 if(order?.state==='paid')return <section className="account-page"><Check size={40}/><h1>{t('테스트 이용권이 추가되었습니다','Test credits added')}</h1><p>{order.credits}{t('개 추가',' credits added')}{balance!==null&&<> · {t('보유','Balance')} {balance}{t('개','')}</>}</p><p className="account-help">{t('테스트 결제이며 실제 청구되지 않습니다.','This was a test payment. No real charge was made.')}</p><a className="primary-action" href={'#'+(returnPage==='home'?'create':returnPage)}>{t('광고 만들기','Create an ad')}</a><button className="guest-link" onClick={clearOrder}>{t('이용권 목록','Credit packs')}</button></section>;
 return <section className="account-page checkout-page"><a href={'#'+returnPage} className="page-back"><ArrowLeft size={18}/>{t('돌아가기','Back')}</a><h1>{t('이용권 선택','Choose credits')}</h1><p className="page-intro">{t('자동 구독 없이, 필요한 만큼.','Buy what you need. No subscription.')}</p>
 <div className="connection-notice" id="checkout-availability">{cap?.checkout.enabled?t('테스트 결제 · 실제 청구되지 않습니다.','Test checkout · No real charge.'):t('결제 연결 준비 중입니다. 실제 결제는 발생하지 않습니다.','Checkout is not connected yet. No payment will be made.')}</div>
 {balance!==null&&<p className="credit-balance">{t('보유 이용권','Your credits')} <strong>{balance}{t('개','')}</strong></p>}
 {order?<section className="checkout-summary"><h2>{t('결제 진행 확인','Checkout status')}</h2><p>{order.credits}{t('개 광고',' ads')} · {formatPrice(order.amount,'KRW',language)}</p><p>{t('결제창에서 완료한 뒤 이 앱으로 돌아오세요.','Complete checkout, then return to this app.')}</p>{order.checkoutUrl&&<a className="primary-action" href={order.checkoutUrl} referrerPolicy="no-referrer">{t('테스트 결제창 열기','Open test checkout')}</a>}<button className="guest-link" onClick={()=>void refresh()}>{t('결제 상태 확인','Check payment status')}</button><details><summary>{t('결제를 취소했나요?','Canceled checkout?')}</summary><p>{t('승인 여부가 불확실하면 먼저 상태를 확인해주세요.','If approval is uncertain, check the status first.')}</p><button onClick={clearOrder}>{t('이용권 다시 선택','Select credits again')}</button></details></section>:<>
 <label className="field checkout-currency">{t('표시 통화','Display currency')}<select value={currency} onChange={e=>setCurrency(e.target.value as PricingCurrency)}><option value="KRW">KRW · 원</option><option value="USD">USD · $</option></select></label>
 <fieldset className="checkout-packs"><legend>{t('광고 이용권','Ad credits')}</legend>{pricingCatalog.packs.map((item,i)=><label key={item.id} className={selected===item.id?'selected':''}><input type="radio" name="credit-pack" value={item.id} checked={selected===item.id} onChange={()=>setSelected(item.id)}/><span><strong>{names[i]} · {item.credits}{t('개',' ads')}</strong></span><b>{formatPrice(item.prices[currency],currency,language)}</b></label>)}</fieldset>
 <p className="account-help">{t('문구 직접 수정·재다운로드는 추가 차감 없음','No extra credits for manual text edits or repeat downloads')}</p>
 <section className="checkout-summary" aria-label={t('결제 확인','Order review')}><h2>{t('최종 금액','Total')}</h2><p><span>{pack.credits}{t('개 광고',' ads')}</span><strong>{formatPrice(pack.prices[currency],currency,language)}</strong></p><p className="checkout-tax">{currency==='KRW'?t('부가세 포함','Includes Korean VAT'):t('현지 세금 별도 · 원화 테스트 결제만 지원','Local taxes excluded · Test checkout supports KRW only')}</p></section>
 {cap?.checkout.enabled&&session&&<label className="checkout-consent"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>{t('이용권 수량·금액과 테스트 결제임을 확인했습니다.','I have checked the credits, amount and test payment notice.')}</label>}
 <button className="primary-action" disabled={busy||!cap?.checkout.enabled||currency!=='KRW'||Boolean(session&&!agreed)} onClick={()=>void checkout()}>{!cap?.checkout.enabled?t('결제 연결 준비 중','Checkout coming soon'):!session?t('이메일로 로그인하고 계속','Sign in with email to continue'):busy?t('준비 중…','Preparing…'):t('테스트 결제 준비','Continue to test checkout')}</button></>}
 {message&&<p role="alert">{message}</p>}</section>;
}

