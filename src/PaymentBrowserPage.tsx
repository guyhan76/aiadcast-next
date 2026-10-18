import {DEMO_CHECKOUT_RETURN,verifiedReceipt} from './checkout-return';
import {useEffect,useRef,useState} from 'react';
import {apiRequest} from './generation-client';
import {accountError,readSession,type TestOrder} from './account-client';
import {useUiLanguage} from './ui-language';
type Launch=TestOrder&{clientKey:string;customerKey:string;orderName:string;successUrl:string;failUrl:string};
type Grant={orderId:string;ticket:string};
type PaymentSDK=(key:string)=>{payment:(options:{customerKey:string})=>{requestPayment:(options:Record<string,unknown>)=>Promise<void>}};
let sdk:Promise<PaymentSDK>|undefined;
function loadSDK(){
 if(!sdk)sdk=new Promise<PaymentSDK>((resolve,reject)=>{const script=document.createElement('script');script.src='https://js.tosspayments.com/v2/standard';script.referrerPolicy='no-referrer';script.onload=()=>{const api=(window as Window&{TossPayments?:PaymentSDK}).TossPayments;if(api)resolve(api);else reject(Error('SDK_UNAVAILABLE'));};script.onerror=()=>reject(Error('SDK_UNAVAILABLE'));document.head.appendChild(script);}).catch(e=>{sdk=undefined;throw e;});
 return sdk;
}
export function PaymentBrowserPage({returning}:{returning:boolean}){
 const {t,language}=useUiLanguage(),[query]=useState(()=>new URLSearchParams(returning?(location.search||readSession<string>('aiadcast.payment-return')||''):location.hash.split('?')[1]));
 const [grant]=useState<Grant|undefined>(()=>returning?readSession('aiadcast.browser-checkout'):query.get('ticket')?{orderId:query.get('orderId')??'',ticket:query.get('ticket')??''}:readSession('aiadcast.browser-checkout'));
 const [launch,setLaunch]=useState<Launch>(),[busy,setBusy]=useState(false),[done,setDone]=useState<TestOrder>(),[error,setError]=useState(''),locked=useRef(false);
 useEffect(()=>{let active=true;if(!grant)return;sessionStorage.setItem('aiadcast.browser-checkout',JSON.stringify(grant));
 // Remove grant secrets from the visible URL after retaining them in this tab.
 if(returning){sessionStorage.setItem('aiadcast.payment-return',JSON.stringify(query.toString()));history.replaceState(null,'',location.pathname+'#payment-return');}
 if(!returning)history.replaceState(null,'',location.pathname+'#pay');
 if(!returning)apiRequest<Launch>('/api/checkout/launch',grant).then(v=>{if(active)setLaunch(v);}).catch(e=>{if(active)setError(accountError(e,language==='ko'));});
 return()=>{active=false};},[grant,returning,language]);
 async function pay(){if(!launch||busy)return;setBusy(true);setError('');try{const TossPayments=await loadSDK();await TossPayments(launch.clientKey).payment({customerKey:launch.customerKey}).requestPayment({method:'CARD',amount:{currency:'KRW',value:launch.amount},orderId:launch.id,orderName:launch.orderName,successUrl:launch.successUrl,failUrl:launch.failUrl});}catch(e){setError(t('결제창이 닫혔거나 연결하지 못했습니다. 앱에서 상태를 확인한 후 다시 시도해주세요.','Checkout closed or could not connect. Check the status in the app before retrying.'));}finally{setBusy(false);}}
 async function confirm(){if(!grant||locked.current)return;locked.current=true;setBusy(true);setError('');try{
  if(query.get('paymentKey')){if(query.get('orderId')!==grant.orderId)throw Error('ORDER_MISMATCH');await apiRequest<TestOrder>('/api/checkout/confirm',{...grant,paymentKey:query.get('paymentKey'),amount:Number(query.get('amount'))});}
  const result=await apiRequest<TestOrder>('/api/checkout/receipt',grant);
  if(result.id!==grant.orderId||!verifiedReceipt(result))throw Error('PURCHASE_NOT_VERIFIED');
  if(verifiedReceipt(result)){setDone(result);sessionStorage.removeItem('aiadcast.payment-return');history.replaceState(null,'',location.pathname+'#payment-return');}
 }catch(e){setError(accountError(e,language==='ko'));}finally{locked.current=false;setBusy(false);}}
 // Approval is an idempotent server operation. A retry never accepts client-provided prices.
 useEffect(()=>{if(returning&&grant){const timer=setTimeout(()=>void confirm(),0);return()=>clearTimeout(timer);}},[returning,grant]);
 const canceled=returning&&!query.get('paymentKey')&&!!query.get('code');
 return <section className="account-page"><h1>{done?t('테스트 결제 완료','Test payment complete'):t('테스트 결제','Test checkout')}</h1><div className="connection-notice">{t('실제 금액은 청구되지 않습니다.','No real money is charged.')}</div>
 {done?<><p className="credit-balance">{done.receipt!.grantedCredits}{t('개 지급 확인 · 현재 잔액 ',' credits confirmed · Current balance ')}<strong>{done.receipt!.balance}{t('개',' credits')}</strong></p><a className="primary-action" href={DEMO_CHECKOUT_RETURN}>{t('광고 만들기 계속','Continue creating your ad')}</a><p>{t('결제를 시작한 시연 앱에서 같은 계정의 주문을 다시 확인하고 저장한 작업을 이어갑니다. 자동 생성하지 않습니다.','The demo app rechecks the original account and order, then resumes your saved work. Generation does not start automatically.')}</p></>:!grant?<p role="alert">{t('원래 앱에서 결제창을 다시 열어주세요.','Reopen checkout from the original app.')}</p>:returning?<><p>{canceled?t('결제가 완료되지 않았습니다. 원래 앱에서 상태를 확인하고 다시 시도할 수 있습니다.','Checkout did not complete. Return to the app to check its status and retry.'):t('승인 내역을 확인하고 있습니다. 원래 앱에서도 결과를 확인할 수 있습니다.','Checking payment approval. You can also check the result in the original app.')}</p>{!canceled&&<button className="primary-action" disabled={busy} onClick={()=>void confirm()}>{busy?t('확인 중…','Checking…'):t('승인 결과 다시 확인','Check approval again')}</button>}</>:launch?<><p className="page-intro">{launch.credits}{launch.unit==='credit-v2'?t(' 크레딧',' credits'):t('개 광고',' ads')} · {launch.amount.toLocaleString(language==='ko'?'ko-KR':'en-US')}{t('원',' KRW')}</p><button className="primary-action" disabled={busy} onClick={()=>void pay()}>{busy?t('연결 중…','Connecting…'):t('테스트 결제하기','Pay in test mode')}</button></>:<p role="status">{t('결제 정보를 불러오는 중…','Loading checkout…')}</p>}
 <p className="account-help">{t('테스트 이용권 지급과 이미지 생성 예산·규격 기능의 준비 상태는 별개입니다.','Test credits do not guarantee image budget or dimension availability.')}</p><details><summary>{t('앱이 열리지 않나요?','App did not open?')}</summary><p>{t('업데이트된 aiadcast 시연 앱을 직접 열고 결제한 계정으로 로그인한 뒤 내 이용권에서 결제 후 작업 이어가기를 누르세요. 앱이 없으면 설치 후 같은 계정으로 확인하세요. 이 브라우저로 사진이나 로그인을 옮기지 않습니다.','Open the updated aiadcast demo app, sign in with the purchasing account and resume from My credits. If absent, install the app first. Photos and sign-in are not transferred to this browser.')}</p><a href="#credits">{t('웹에서 내 이용권 확인','Check credits on the web')}</a></details>{!done&&<a href={DEMO_CHECKOUT_RETURN}>{t('앱에서 결제 상태 확인','Check payment in the app')}</a>}{error&&<p role="alert">{error}</p>}</section>;
}
