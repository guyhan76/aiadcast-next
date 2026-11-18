import {PurchaseRefundReceipt,RefundNotice} from './RefundNotice';
import {useEffect,useState} from 'react';
import {useNativeVersion} from './app-version';
import {ApiRequestFailure,apiRequest} from './generation-client';
import {betaSession} from './beta-session';
import {rememberLoginDestination} from './login-navigation';
import {useUiLanguage} from './ui-language';
import {pricingCatalog} from './pricing';

export const playPackage = 'com.selluplabs.aiadcast.next';
type Account = {enabled:boolean;accountId:string;policyAccountId?:string};
type Product = {id:string;price:string};
type Status = 'pending'|'paid'|'verifying'|'retry'|'cancelled'|'error'|'ineligible';
type PurchaseTerms={orderNo:string;ads:number;purchasedAt:string;currency:string;paid:string};
type Receipt = {state:'paid';grantedCredits:number;balance:number;policyReceipt?:PurchaseTerms}|{state:'pending'};
type NativeEvent = {type:'catalog';products:Product[]}|{type:'purchase';token:string;account:string}|
  {type:'pending';account:string}|{type:'cancelled'|'error'};
function native(type:string, params:Record<string,string>={}) {
  const bridge=(window as Window & {AiadcastNative?:{postMessage:(s:string)=>void}}).AiadcastNative;
  if(!bridge) return false;
  bridge.postMessage(JSON.stringify({type,...params}));
  return true;
}
function notify(status:Status, balance?:number,policyReceipt?:PurchaseTerms) {
  window.dispatchEvent(new CustomEvent('aiadcast-play-status',{detail:{status,balance,policyReceipt}}));
}

// Restore completed purchases on sign-in and startup, including purchases completed while the app was closed.
export function PlayPurchaseRecovery(){
  const version=useNativeVersion();
  useEffect(()=>{
    if(version?.packageName!==playPackage) return;
    let active=true,account:Account|undefined,owner:string|undefined,epoch=0;
    let running=new Set<string>();
    const interrupted=new Set<string>();
    async function recover(){
      const token=betaSession()?.token;
      const request=++epoch;
      if(token!==owner){owner=token;account=undefined;running=new Set();interrupted.clear();}
      if(!token)return;
      try {
        const info=await apiRequest<Account>('/api/checkout/play/account');
        if(!active||request!==epoch||owner!==betaSession()?.token)return;
        account=info;
        if(info.enabled){
          // Play may already have consumed a purchase whose verification response was lost.
          for(const purchaseToken of interrupted)void verify(purchaseToken);
          native('play-restore');
        }
      } catch { if(active && request===epoch) notify('retry'); }
    }
    async function verify(token:string){
      if(running.has(token))return;
      const session=owner,inFlight=running;
      const current=()=>active&&inFlight===running&&session===betaSession()?.token;
      inFlight.add(token);
      try {
        notify('verifying');
        const receipt=await apiRequest<Receipt>('/api/checkout/play/verify',{token});
        if(!current())return;
        interrupted.delete(token);
        if(receipt.state==='paid'){
          window.dispatchEvent(new Event('aiadcast-credit-refresh'));
          notify('paid',receipt.balance,receipt.policyReceipt);
        }else{
          notify('pending');
        }
      } catch(error){
        if(!current())return;
        if(error instanceof ApiRequestFailure&&[400,403,409].includes(error.status)){
          interrupted.delete(token);
          notify('ineligible');
        }else{
          interrupted.add(token);
          notify('retry');
        }
      } finally{inFlight.delete(token);}
    }
    function receive(event:Event){
      const detail=(event as CustomEvent<NativeEvent>).detail;
      if(!detail||!account?.enabled||owner!==betaSession()?.token)return;
      const matches='account' in detail&&typeof detail.account==='string'&&[account.accountId,account.policyAccountId].includes(detail.account);
      if(!matches)return;
      if(detail.type==='pending')notify('pending');
      if(detail.type==='purchase'&&typeof detail.token==='string'&&detail.token)void verify(detail.token);
    }
    const visible=()=>{if(document.visibilityState==='visible')void recover();};
    window.addEventListener('aiadcast-play',receive);
    window.addEventListener('aiadcast-session-change',recover);
    window.addEventListener('aiadcast-play-recover',recover);
    window.addEventListener('online',recover);
    document.addEventListener('visibilitychange',visible);
    void recover();
    return ()=>{active=false;window.removeEventListener('aiadcast-play',receive);window.removeEventListener('aiadcast-session-change',recover);window.removeEventListener('aiadcast-play-recover',recover);window.removeEventListener('online',recover);document.removeEventListener('visibilitychange',visible);};
  },[version?.packageName]);
  return null;
}

export function PlayCheckoutPage({preserve,returnPage}:{preserve:()=>Promise<void>;returnPage:string}){
  const {t}=useUiLanguage(),session=betaSession();
  const [account,setAccount]=useState<Account>(),[products,setProducts]=useState<Product[]>(),[attempt,retry]=useState(0);
  const [agreed,setAgreed]=useState(false),[policyReceipt,setPolicyReceipt]=useState<PurchaseTerms>();
  const [choice,choose]=useState('credits_100'),[busy,setBusy]=useState(false),[status,setStatus]=useState<Status>(),[balance,setBalance]=useState<number>();
  useEffect(()=>{
    let active=true;
    setAgreed(false);setPolicyReceipt(undefined);setAccount(undefined);setProducts(undefined);setStatus(undefined);setBalance(undefined);setBusy(false);
    if(!session)return;
    function receive(event:Event){
      const detail=(event as CustomEvent<NativeEvent>).detail;
      if(detail?.type==='catalog'){const available=detail.products.filter(p=>pricingCatalog.packs.some(pack=>'credits_'+pack.credits===p.id));setProducts(available);choose(old=>available.some(p=>p.id===old)?old:available[0]?.id??'');}
      if(detail?.type==='cancelled'||detail?.type==='error'){setBusy(false);setStatus(detail.type);}
    }
    function update(event:Event){const v=(event as CustomEvent<{status:Status;balance?:number;policyReceipt?:PurchaseTerms}>).detail;setStatus(v.status);setPolicyReceipt(v.policyReceipt);setBusy(v.status==='verifying');if(v.balance!==undefined)setBalance(v.balance);}
    window.addEventListener('aiadcast-play',receive);window.addEventListener('aiadcast-play-status',update);
    void apiRequest<Account>('/api/checkout/play/account').then(info=>{
      if(!active)return;
      setAccount(info);
      if(info.enabled){if(!native('play-catalog'))setStatus('error');window.dispatchEvent(new Event('aiadcast-play-recover'));}
    }).catch(()=>{if(active)setStatus('error');});
    return ()=>{active=false;window.removeEventListener('aiadcast-play',receive);window.removeEventListener('aiadcast-play-status',update);};
  },[session?.token,attempt]);
  async function buy(){
    if(!session){await preserve();rememberLoginDestination('checkout');location.hash='login';return;}
    if(busy||!agreed||!account?.policyAccountId||!account.enabled||!products?.some(p=>p.id===choice))return;
    setAgreed(false);setBusy(true);setStatus(undefined);
    if(!native('play-buy',{product:choice,account:account.policyAccountId})){setStatus('error');setBusy(false);}
  }
  const product=products?.find(p=>p.id===choice);
  const messages:Record<Status,string>={
    pending:t('결제 대기 중입니다. 승인 후 크레딧이 지급됩니다.','Payment is pending. Credits are added after approval.'),
    paid:t('구매를 확인했습니다.','Purchase confirmed.'),verifying:t('Google Play 구매를 확인하고 있습니다.','Verifying your Google Play purchase.'),
    retry:t('구매 확인이 지연되고 있습니다. 결제 내역을 다시 확인해 주세요.','Verification is delayed. Check your purchases again.'),
    ineligible:t('이 구매로 이용권을 지급할 수 없습니다. Google Play의 구매 계정과 주문 상태를 확인해 주세요.','These credits could not be granted. Check the purchasing account and order status in Google Play.'),
    cancelled:t('결제를 취소했습니다.','Purchase canceled.'),error:t('Google Play에 연결하지 못했습니다.','Could not connect to Google Play.')
  };
  if(status==='paid'&&policyReceipt)return <section className="account-page checkout-page">
    <h1>{t('결제 완료','Payment complete')}</h1><p role="status">{messages.paid} {balance!==undefined&&t('잔액 '+balance+' 크레딧','Balance: '+balance+' credits')}</p>
    <section className="checkout-summary"><h2>{t('구매 영수증','Purchase receipt')}</h2><p>{t('판매자 셀업랩스 · 결제처 Google Play','Sellup Labs · Google Play')}</p><p>{t('주문번호','Order number')} {policyReceipt.orderNo}</p><p>{new Date(policyReceipt.purchasedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})} · {policyReceipt.ads}{t('장',' ads')} · {new Intl.NumberFormat(undefined,{style:'currency',currency:policyReceipt.currency}).format(Number(policyReceipt.paid)/1e9)}</p><PurchaseRefundReceipt key={policyReceipt.orderNo} orderNo={policyReceipt.orderNo}/></section>
    <a className="primary-action" href="#credits">{t('내 이용권 보기','View my credits')}</a>
    <button className="wallet-button wallet-secondary" onClick={()=>{setStatus(undefined);setPolicyReceipt(undefined);setAgreed(false);}}>{t('다른 이용권 구매','Make another purchase')}</button>
  </section>;
  return <section className="account-page checkout-page"><a className="page-back" href={'#'+returnPage}>{t('돌아가기','Back')}</a><h1>{t('이용권 선택','Choose credits')}</h1>
    <p className="page-intro">{t('신규 가입 첫 광고 1장 무료 · 계정당 1회','One free ad per newly registered account')}</p>
    {session&&<>{!account?.enabled && !status && <p>{account?t('Google Play 결제 준비 중입니다.','Google Play billing is not available yet.'):t('결제 연결 확인 중…','Checking billing…')}</p>}
    {account?.enabled&&<fieldset className="checkout-packs"><legend>{t('광고 이용권','Ad credits')}</legend>
      {pricingCatalog.packs.map(pack=>{const item=products?.find(p=>p.id==='credits_'+pack.credits);return item&&<label key={item.id} className={choice===item.id?'selected':''}>
        <input type="radio" name="play-credit-pack" checked={choice===item.id} disabled={busy} onChange={()=>{choose(item.id);setAgreed(false);}}/>
        <span>{pack.credits/pack.creditsPerGeneration}{t('장',' ads')}</span><b>{item.price}</b></label>;})}
      {!products?.length && <p>{products?t('구매 가능한 원화 상품이 없습니다.','No KRW credit packs are available.'):t('상품 가격을 불러오는 중…','Loading store prices…')}</p>}
    </fieldset>}</>}
    <RefundNotice/>
    {session&&account?.enabled&&<label className="checkout-consent"><input type="checkbox" checked={agreed} disabled={busy} onChange={e=>setAgreed(e.target.checked)}/>{t('이용권 수량, 금액과 환불 조건을 확인했습니다','I have checked the credits, price and refund conditions.')}</label>}
    {(!session||account?.enabled)&&<button className="primary-action" disabled={Boolean(session)&&(!product||!agreed||!account?.policyAccountId||busy||status==='retry')} onClick={()=>void buy()}>
      {!session?t('로그인하고 계속','Sign in to continue'):product?product.price+' · '+t('Google Play 결제','Pay with Google Play'):t('Google Play 결제','Pay with Google Play')}</button>}
    {status&&<p role="status">{messages[status]} {status==='paid'&&balance!==undefined&&t('잔액 '+balance+' 크레딧 · 광고 '+Math.floor(balance/10)+'장','Balance: '+balance+' credits')}</p>}
    {session&&<button className="guest-link" disabled={busy} onClick={()=>retry(n=>n+1)}>{t('구매 내역 다시 확인','Check purchases again')}</button>}
  </section>;
}
