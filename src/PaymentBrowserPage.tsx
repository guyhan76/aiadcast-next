import {useEffect,useState} from 'react';
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
 const [launch,setLaunch]=useState<Launch>(),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;if(!grant)return;sessionStorage.setItem('aiadcast.browser-checkout',JSON.stringify(grant));
 // Remove grant secrets from the visible URL after retaining them in this tab.
 if(returning){sessionStorage.setItem('aiadcast.payment-return',JSON.stringify(query.toString()));history.replaceState(null,'',location.pathname+'#payment-return');}
 if(!returning)history.replaceState(null,'',location.pathname+'#pay');
 if(!returning)apiRequest<Launch>('/api/checkout/launch',grant).then(v=>{if(active)setLaunch(v);}).catch(e=>{if(active)setError(accountError(e,language==='ko'));});
 return()=>{active=false};},[grant,returning,language]);
 async function pay(){if(!launch||busy)return;setBusy(true);setError('');try{const TossPayments=await loadSDK();await TossPayments(launch.clientKey).payment({customerKey:launch.customerKey}).requestPayment({method:'CARD',amount:{currency:'KRW',value:launch.amount},orderId:launch.id,orderName:launch.orderName,successUrl:launch.successUrl,failUrl:launch.failUrl});}catch(e){setError(t('결제창이 닫혔거나 연결하지 못했습니다. 앱에서 상태를 확인한 후 다시 시도해주세요.','Checkout closed or could not connect. Check the status in the app before retrying.'));}finally{setBusy(false);}}
 async function confirm(){if(!grant||busy)return;setBusy(true);setError('');try{
  if(query.get('orderId')!==grant.orderId)throw Error('ORDER_MISMATCH');
  const result=await apiRequest<TestOrder>('/api/checkout/confirm',{...grant,paymentKey:query.get('paymentKey'),amount:Number(query.get('amount'))});
  if(result.state==='paid'){setDone(true);sessionStorage.removeItem('aiadcast.browser-checkout');sessionStorage.removeItem('aiadcast.payment-return');history.replaceState(null,'',location.pathname+'#payment-return');}
 }catch(e){setError(accountError(e,language==='ko'));}finally{setBusy(false);}}
 // Approval is an idempotent server operation. A retry never accepts client-provided prices.
 useEffect(()=>{if(returning&&query.get('paymentKey')&&grant){const timer=setTimeout(()=>void confirm(),0);return()=>clearTimeout(timer);}},[returning,grant]);
 const canceled=returning&&!query.get('paymentKey');
 return <section className="account-page"><h1>{done?t('테스트 결제 완료','Test payment complete'):t('테스트 결제','Test checkout')}</h1><div className="connection-notice">{t('실제 금액은 청구되지 않습니다.','No real money is charged.')}</div>
 {done?<p>{t('이용권이 추가되었습니다. 원래 앱으로 돌아가 광고를 만드세요.','Credits were added. Return to the original app to create your ad.')}</p>:!grant?<p role="alert">{t('원래 앱에서 결제창을 다시 열어주세요.','Reopen checkout from the original app.')}</p>:returning?<><p>{canceled?t('결제가 완료되지 않았습니다. 원래 앱에서 상태를 확인하고 다시 시도할 수 있습니다.','Checkout did not complete. Return to the app to check its status and retry.'):t('승인 내역을 확인하고 있습니다. 원래 앱에서도 결과를 확인할 수 있습니다.','Checking payment approval. You can also check the result in the original app.')}</p>{!canceled&&<button className="primary-action" disabled={busy} onClick={()=>void confirm()}>{busy?t('확인 중…','Checking…'):t('승인 결과 다시 확인','Check approval again')}</button>}</>:launch?<><p className="page-intro">{launch.credits}{t('개 광고',' ads')} · {launch.amount.toLocaleString(language==='ko'?'ko-KR':'en-US')}{t('원',' KRW')}</p><button className="primary-action" disabled={busy} onClick={()=>void pay()}>{busy?t('연결 중…','Connecting…'):t('테스트 결제하기','Pay in test mode')}</button></>:<p role="status">{t('결제 정보를 불러오는 중…','Loading checkout…')}</p>}
 {error&&<p role="alert">{error}</p>}</section>;
}
