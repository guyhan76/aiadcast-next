import {betaSession} from './beta-session';
import {DEMO_CHECKOUT_RETURN,PREVIEW_CHECKOUT_RETURN,verifiedReceipt,checkoutContinuation} from './checkout-return';
import {useEffect,useRef,useState} from 'react';
import {Check,Clock3,CreditCard} from 'lucide-react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {accountError,readSession,type TestOrder} from './account-client';
import {useUiLanguage} from './ui-language';
type Launch=TestOrder&{clientKey:string;customerKey:string;orderName:string;successUrl:string;failUrl:string};
type Grant={orderId:string;ticket:string;app?:'preview'};
type PaymentSDK=(key:string)=>{payment:(options:{customerKey:string})=>{requestPayment:(options:Record<string,unknown>)=>Promise<void>}};
let sdk:Promise<PaymentSDK>|undefined;
function loadSDK(){
 if(!sdk)sdk=new Promise<PaymentSDK>((resolve,reject)=>{const script=document.createElement('script');script.src='https://js.tosspayments.com/v2/standard';script.referrerPolicy='no-referrer';script.onload=()=>{const api=(window as Window&{TossPayments?:PaymentSDK}).TossPayments;if(api)resolve(api);else reject(Error('SDK_UNAVAILABLE'));};script.onerror=()=>reject(Error('SDK_UNAVAILABLE'));document.head.appendChild(script);}).catch(e=>{sdk=undefined;throw e;});
 return sdk;
}
export function PaymentBrowserPage({returning}:{returning:boolean}){
 const {t,language}=useUiLanguage(),[query]=useState(()=>new URLSearchParams(returning?(location.search||readSession<string>('aiadcast.payment-return')||''):location.hash.split('?')[1]));
 const [grant]=useState<Grant|undefined>(()=>returning?readSession('aiadcast.browser-checkout'):query.get('ticket')?{orderId:query.get('orderId')??'',ticket:query.get('ticket')??'',app:query.get('app')==='preview'?'preview':undefined}:readSession('aiadcast.browser-checkout'));
 const [launch,setLaunch]=useState<Launch>(),[busy,setBusy]=useState(false),[done,setDone]=useState<TestOrder>(),[error,setError]=useState(''),locked=useRef(false);
 useEffect(()=>{let active=true;if(!grant)return;sessionStorage.setItem('aiadcast.browser-checkout',JSON.stringify(grant));
 // Remove grant secrets from the visible URL after retaining them in this tab.
 if(returning){sessionStorage.setItem('aiadcast.payment-return',JSON.stringify(query.toString()));history.replaceState(null,'',location.pathname+'#payment-return');}
 if(!returning)history.replaceState(null,'',location.pathname+'#pay');
 if(!returning)apiRequest<Launch>('/api/checkout/launch',{orderId:grant.orderId,ticket:grant.ticket}).then(v=>{if(active)setLaunch(v);}).catch(e=>{if(active)setError(accountError(e,language==='ko'));});
 return()=>{active=false};},[grant,returning,language]);
 async function pay(){if(!launch||busy)return;setBusy(true);setError('');try{const TossPayments=await loadSDK();await TossPayments(launch.clientKey).payment({customerKey:launch.customerKey}).requestPayment({method:'CARD',amount:{currency:'KRW',value:launch.amount},orderId:launch.id,orderName:launch.orderName,successUrl:launch.successUrl,failUrl:launch.failUrl});}catch(e){setError(t('결제창이 닫혔거나 연결하지 못했습니다. 앱에서 상태를 확인한 후 다시 시도해주세요.','Checkout closed or could not connect. Check the status in the app before retrying.'));}finally{setBusy(false);}}
 async function confirm(){if(!grant||locked.current)return;locked.current=true;setBusy(true);setError('');try{
  if(query.get('paymentKey')){if(query.get('orderId')!==grant.orderId)throw Error('ORDER_MISMATCH');await apiRequest<TestOrder>('/api/checkout/confirm',{orderId:grant.orderId,ticket:grant.ticket,paymentKey:query.get('paymentKey'),amount:Number(query.get('amount'))});}
  const result=await apiRequest<TestOrder>('/api/checkout/receipt',{orderId:grant.orderId,ticket:grant.ticket});
  if(result.id!==grant.orderId)throw Error('ORDER_MISMATCH');
  if(!verifiedReceipt(result))throw new ApiRequestFailure('PURCHASE_NOT_VERIFIED',409);
  if(verifiedReceipt(result)){setDone(result);sessionStorage.removeItem('aiadcast.payment-return');history.replaceState(null,'',location.pathname+'#payment-return');}
 }catch(e){setError(accountError(e,language==='ko'));}finally{locked.current=false;setBusy(false);}}
 // Approval is an idempotent server operation. A retry never accepts client-provided prices.
 useEffect(()=>{if(returning&&grant){const timer=setTimeout(()=>void confirm(),0);return()=>clearTimeout(timer);}},[returning,grant]);
 // A checkout opened in this browser retains its account or continuation.
 // External Android checkout has neither: keep its app deep link.
 const fromPreview=grant?.app==='preview';
 const webCheckout=!fromPreview&&(!!betaSession()||!!grant&&checkoutContinuation()?.orderId===grant.orderId);
 const appReturn=fromPreview?PREVIEW_CHECKOUT_RETURN:DEMO_CHECKOUT_RETURN;
 const canceled=returning&&!query.get('paymentKey')&&!!query.get('code');
 const pending=returning&&!!grant&&!done&&!canceled;
 const heading=done?t('결제 완료','Payment complete'):!grant?t('결제 정보 확인','Checkout details'):canceled?t('결제가 완료되지 않았습니다','Payment incomplete'):pending?t('결제 승인 확인','Payment approval'):t('결제','Checkout');
 const AmountIcon=done?Check:pending?Clock3:CreditCard;
 const unit=(value:number,credit:boolean)=>value.toLocaleString(language==='ko'?'ko-KR':'en-US')+(credit?t(' 크레딧',' credits'):t('개',' tickets'));
 const order=done??launch;
 const pendingMessage=t('승인 결과가 아직 확인되지 않았습니다. 다시 결제할 필요는 없습니다.','Approval is pending. You can check again without paying.');
 return <section className="account-page payment-status-page">
  <p className="payment-mode">{t('시연 결제 · 실제 청구 없음','Demo checkout · No real charge')}</p>
  <div className="payment-status-card"><span className="payment-symbol" aria-hidden="true"><AmountIcon size={28}/></span>
   <h1>{heading}</h1>
   {pending&&<p role="status">{busy?t('승인 결과를 조회하고 있습니다.','Checking approval…'):error||pendingMessage}</p>}
   {!grant&&<p role="alert">{t('결제를 시작한 앱에서 결제창을 다시 열어주세요.','Reopen checkout in the app where you started.')}</p>}
   {canceled&&<p>{t('내 이용권에서 주문 상태를 확인해 주세요.','Check this order in My credits.')}</p>}
   {order&&<dl className="payment-facts">
    {Number.isSafeInteger(order.amount)&&<div><dt>{t('결제 금액','Amount')}</dt><dd>{order.amount.toLocaleString(language==='ko'?'ko-KR':'en-US')}{t('원',' KRW')}</dd></div>}
    <div><dt>{done?t('지급 완료','Credits granted'):t('구매 이용권','Credits to receive')}</dt><dd>{unit(order.credits,order.unit==='credit-v2')}</dd></div>
    {done&&<div><dt>{t('현재 잔액','Current balance')}</dt><dd>{unit(done.receipt!.balance,done.unit==='credit-v2')}</dd></div>}
   </dl>}
   {!returning&&grant&&!order&&!error&&<p role="status">{t('결제 정보를 불러오는 중…','Loading checkout…')}</p>}
   {!pending&&!canceled&&error&&<p role="alert">{error}</p>}
  </div>
  <div className="wallet-actions">
   {done?<a className="wallet-button wallet-primary" href={webCheckout?'#checkout-return':appReturn}>{t('광고 만들기 계속','Continue creating your ad')}</a>
    :pending?<button className="wallet-button wallet-primary" disabled={busy} onClick={()=>void confirm()}>{busy?t('확인 중…','Checking…'):t('승인 결과 다시 확인','Check approval again')}</button>
    :!returning&&launch?<button className="wallet-button wallet-primary" disabled={busy} onClick={()=>void pay()}>{busy?t('연결 중…','Connecting…'):t('결제','Pay')}</button>:null}
   {webCheckout?<a className="wallet-button wallet-secondary" href="#credits">{t('내 이용권 확인','View my credits')}</a>
    :!done&&<a className="wallet-button wallet-secondary" href={appReturn}>{t('앱에서 결제 상태 확인','Check payment in the app')}</a>}
  </div>
  {!webCheckout&&<details className="payment-return-help"><summary>{t('앱이 열리지 않나요?','App did not open?')}</summary><p>{t('aiadcast 앱을 열고 결제한 계정의 내 이용권을 확인해 주세요.','Open aiadcast and check My credits with the purchasing account.')}</p>{!fromPreview&&<a className="wallet-button wallet-secondary" href={PREVIEW_CHECKOUT_RETURN}>{t('Preview 앱에서 계속','Continue in the Preview app')}</a>}<a className="wallet-button wallet-secondary" href="#credits">{t('웹에서 내 이용권 확인','Check credits on the web')}</a></details>}
 </section>;
}
