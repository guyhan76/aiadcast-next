import {rememberLoginDestination} from './login-navigation';
import {loadWorkspace} from './workspace-draft';
import {useEffect,useRef,useState} from 'react';
import {betaSession,setBetaSession} from './beta-session';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {checkoutContinuation,verifiedReceipt,rememberCheckout} from './checkout-return';
import {accountError,type TestOrder} from './account-client';
import {useUiLanguage} from './ui-language';
export function CheckoutReturnPage(){
 const {t,language}=useUiLanguage(),[context,setContext]=useState(checkoutContinuation),[history,setHistory]=useState<TestOrder[]>(),[order,setOrder]=useState<TestOrder>(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),locked=useRef(false);
 const session=betaSession(),same=!!context&&context.userId===session?.user.id;
 async function historyOrders(){setBusy(true);setMessage('');try{const result=await apiRequest<{orders:TestOrder[]}>('/api/checkout/orders');setHistory(result.orders.filter(v=>v.state==='paid'));}catch(e){setMessage(accountError(e,language==='ko'));}finally{setBusy(false);}}
 async function recover(value:TestOrder){try{const draft=await loadWorkspace();rememberCheckout(value,draft?.returnPage??'create');setContext(checkoutContinuation());}catch{setMessage(t('저장한 작업을 읽지 못했습니다. 작업을 지우지 않고 복귀를 멈췄습니다.','Could not read your draft. Recovery stopped without deleting it.'));}}
 async function check(){if(!same||!context||locked.current)return;locked.current=true;setBusy(true);setMessage('');try{
  const value=await apiRequest<TestOrder>('/api/checkout/orders/'+context.orderId);
  if(value.id!==context.orderId||!verifiedReceipt(value))throw Error('PURCHASE_NOT_VERIFIED');
  setOrder(value);sessionStorage.setItem('aiadcast.checkout-confirmed',JSON.stringify({userId:context.userId,origin:context.origin,credits:value.receipt!.grantedCredits,balance:value.receipt!.balance,confirmedAt:Date.now()}));window.dispatchEvent(new Event('aiadcast-credit-refresh'));location.hash=context.route;
 }catch(e){if(e instanceof ApiRequestFailure&&e.status===401){setBetaSession(null,'checkout-return');return;}setMessage(accountError(e,language==='ko'));}finally{locked.current=false;setBusy(false);}}
 useEffect(()=>{void check();},[same,context?.orderId]);
 return <section className="account-page"><h1>{t('이용권 지급 확인','Confirm your credits')}</h1>
 {!context?<><p role="alert">{t('복귀 정보가 없거나 만료되었습니다. 같은 계정의 내 이용권에서 결제 상태를 확인해주세요. 저장한 작업은 유지됩니다.','Return information is missing or expired. Check payment status in My credits with the same account. Saved work is retained.')}</p><a href="#credits">{t('내 이용권 확인','My credits')}</a></>:!same?<><p role="alert">{t('결제를 시작한 계정으로 로그인해주세요. 다른 계정의 작업이나 이용권은 변경하지 않습니다.','Sign in with the account that started checkout. Other accounts are not changed.')}</p><a href="#login" onClick={()=>rememberLoginDestination('checkout-return')}>{t('로그인','Sign in')}</a><a href="#checkout-return">{t('로그인 후 지급 다시 확인','Recheck after signing in')}</a></>:order&&verifiedReceipt(order)?<><p>{order.receipt!.grantedCredits}{t('개 지급 확인 · 현재 잔액 ',' credits confirmed · Current balance ')}{order.receipt!.balance}{t('개',' credits')}</p><p>{t('사진·설명·규격을 보관한 작업으로 돌아갑니다. 생성은 자동 실행하지 않습니다.','Continue with your saved photos, description and dimensions. Generation does not start automatically.')}</p><a className="primary-action" href={'#'+context.route}>{t('광고 만들기 계속','Continue creating your ad')}</a></>:<><p>{t('서버에서 주문과 지급 내역을 확인합니다. 승인 여부가 불확실하면 새로 결제하지 말고 다시 확인해주세요.','Checking the order and credit ledger. If approval is uncertain, recheck before paying again.')}</p><button className="primary-action" disabled={busy} onClick={()=>void check()}>{busy?t('확인 중…','Checking…'):t('지급 내역 다시 확인','Recheck credits')}</button><a href="#credits">{t('내 이용권 확인','My credits')}</a></>}
 {!context&&session&&<><button disabled={busy} onClick={()=>void historyOrders()}>{t('이전 결제 내역 확인','Check previous payments')}</button>{history?.length===0&&<p>{t('이 계정에서 지급 완료된 주문을 찾지 못했습니다.','No paid orders were found for this account.')}</p>}{history?.map(value=><button key={value.id} disabled={busy} onClick={()=>void recover(value)}>{new Date(value.created).toLocaleDateString()} · {value.credits}{t('개 주문 지급 확인하고 계속',' credits — verify and continue')}</button>)}</>}
 <p className="account-help">{t('테스트 이용권입니다. 이미지 생성 예산과 규격 기능의 준비 상태는 별도로 확인됩니다.','These are test credits. Image generation budget and dimension availability are checked separately.')}</p>{message&&<p role="alert">{message}</p>}</section>;
}
