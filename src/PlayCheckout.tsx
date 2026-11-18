import {useEffect,useState} from 'react';
import {useNativeVersion} from './app-version';
import {apiRequest} from './generation-client';
import {betaSession} from './beta-session';
import {rememberLoginDestination} from './login-navigation';
import {useUiLanguage} from './ui-language';
import {pricingCatalog} from './pricing';

export const playPackage = 'com.selluplabs.aiadcast.next';
type Account = {enabled:boolean;accountId:string};
type Product = {id:string;price:string};
type Status = 'pending'|'paid'|'verifying'|'retry'|'cancelled'|'error';
type Receipt = {state:'paid';grantedCredits:number;balance:number}|{state:'pending'};
type NativeEvent = {type:'catalog';products:Product[]}|{type:'purchase';token:string;account:string}|
  {type:'pending';account:string}|{type:'cancelled'|'error'};
function native(type:string, params:Record<string,string>={}) {
  const bridge=(window as Window & {AiadcastNative?:{postMessage:(s:string)=>void}}).AiadcastNative;
  if(!bridge) return false;
  bridge.postMessage(JSON.stringify({type,...params}));
  return true;
}
function notify(status:Status, balance?:number) {
  window.dispatchEvent(new CustomEvent('aiadcast-play-status',{detail:{status,balance}}));
}

// Restore completed purchases on sign-in and startup, including purchases completed while the app was closed.
export function PlayPurchaseRecovery(){
  const version=useNativeVersion();
  useEffect(()=>{
    if(version?.packageName!==playPackage) return;
    let active=true,account:Account|undefined,owner:string|undefined,epoch=0;
    const running=new Set<string>();
    async function recover(){
      const token=betaSession()?.token;
      const request=++epoch;
      if(token!==owner){owner=token;account=undefined;}
      if(!token)return;
      try {
        const info=await apiRequest<Account>('/api/checkout/play/account');
        if(!active||request!==epoch||owner!==betaSession()?.token)return;
        account=info;
        if(info.enabled)native('play-restore');
      } catch { if(active && request===epoch) notify('retry'); }
    }
    async function receive(event:Event){
      const detail=(event as CustomEvent<NativeEvent>).detail;
      if(!detail || !account?.enabled || owner!==betaSession()?.token) return;
      if(detail.type==='pending' && detail.account===account.accountId){notify('pending');return;}
      if(detail.type!=='purchase'||detail.account!==account.accountId||running.has(detail.token))return;
      const token=detail.token, session=owner;
      running.add(token);
      try {
        notify('verifying');
        const receipt=await apiRequest<Receipt>('/api/checkout/play/verify',{token});
        if(active && session===betaSession()?.token)notify(receipt.state,receipt.state==='paid'?receipt.balance:undefined);
      } catch { if(active && session===betaSession()?.token)notify('retry'); }
      finally{running.delete(token);}
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
  const [choice,choose]=useState('credits_100'),[busy,setBusy]=useState(false),[status,setStatus]=useState<Status>(),[balance,setBalance]=useState<number>();
  useEffect(()=>{
    let active=true;
    setAccount(undefined);setProducts(undefined);setStatus(undefined);setBalance(undefined);setBusy(false);
    if(!session)return;
    function receive(event:Event){
      const detail=(event as CustomEvent<NativeEvent>).detail;
      if(detail?.type==='catalog'){const available=detail.products.filter(p=>pricingCatalog.packs.some(pack=>'credits_'+pack.credits===p.id));setProducts(available);choose(old=>available.some(p=>p.id===old)?old:available[0]?.id??'');}
      if(detail?.type==='cancelled'||detail?.type==='error'){setBusy(false);setStatus(detail.type);}
    }
    function update(event:Event){const v=(event as CustomEvent<{status:Status;balance?:number}>).detail;setStatus(v.status);setBusy(v.status==='verifying');if(v.balance!==undefined)setBalance(v.balance);}
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
    if(busy||!account?.enabled||!products?.some(p=>p.id===choice))return;
    setBusy(true);setStatus(undefined);
    if(!native('play-buy',{product:choice,account:account.accountId})){setStatus('error');setBusy(false);}
  }
  const product=products?.find(p=>p.id===choice);
  const messages:Record<Status,string>={
    pending:t('결제 대기 중입니다. 승인 후 크레딧이 지급됩니다.','Payment is pending. Credits are added after approval.'),
    paid:t('구매를 확인했습니다.','Purchase confirmed.'),verifying:t('Google Play 구매를 확인하고 있습니다.','Verifying your Google Play purchase.'),
    retry:t('구매 확인이 지연되고 있습니다. 결제 내역을 다시 확인해 주세요.','Verification is delayed. Check your purchases again.'),
    cancelled:t('결제를 취소했습니다.','Purchase canceled.'),error:t('Google Play에 연결하지 못했습니다.','Could not connect to Google Play.')
  };
  return <section className="account-page checkout-page"><a className="page-back" href={'#'+returnPage}>{t('돌아가기','Back')}</a><h1>{t('이용권 선택','Choose credits')}</h1>
    <p className="page-intro">{t('신규 가입 첫 광고 1장 무료 · 계정당 1회','One free ad per newly registered account')}</p>
    {session&&<>{!account?.enabled && !status && <p>{account?t('Google Play 결제 준비 중입니다.','Google Play billing is not available yet.'):t('결제 연결 확인 중…','Checking billing…')}</p>}
    {account?.enabled&&<fieldset className="checkout-packs"><legend>{t('광고 이용권','Ad credits')}</legend>
      {pricingCatalog.packs.map(pack=>{const item=products?.find(p=>p.id==='credits_'+pack.credits);return item&&<label key={item.id} className={choice===item.id?'selected':''}>
        <input type="radio" name="play-credit-pack" checked={choice===item.id} disabled={busy} onChange={()=>choose(item.id)}/>
        <span>{pack.credits/pack.creditsPerGeneration}{t('장',' ads')}</span><b>{item.price}</b></label>;})}
      {!products?.length && <p>{products?t('구매 가능한 원화 상품이 없습니다.','No KRW credit packs are available.'):t('상품 가격을 불러오는 중…','Loading store prices…')}</p>}
    </fieldset>}</>}
    {(!session||account?.enabled)&&<button className="primary-action" disabled={Boolean(session)&&(!product||busy||status==='retry')} onClick={()=>void buy()}>
      {!session?t('로그인하고 계속','Sign in to continue'):product?product.price+' · '+t('Google Play 결제','Pay with Google Play'):t('Google Play 결제','Pay with Google Play')}</button>}
    {status&&<p role="status">{messages[status]} {status==='paid'&&balance!==undefined&&t('잔액 '+balance+' 크레딧 · 광고 '+Math.floor(balance/10)+'장','Balance: '+balance+' credits')}</p>}
    {session&&<button className="guest-link" disabled={busy} onClick={()=>retry(n=>n+1)}>{t('구매 내역 다시 확인','Check purchases again')}</button>}
  </section>;
}
