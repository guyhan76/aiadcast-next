import {CommerceRecords} from './CommerceRecords';
import {useEffect,useRef,useState} from 'react';
import {apiRequest,ApiRequestFailure,type ApiStatus} from './generation-client';
import {betaSession,setBetaSession} from './beta-session';
import {useUiLanguage} from './ui-language';
import type {TestOrder} from './account-client';
import {ArrowLeft,ImagePlus,RefreshCw} from 'lucide-react';
import './account-pages.css';
type Grant={id:string;credits:number;state:'pending'|'completed';created:number};
type CustomerSale={id:string;ads:number;verified:string;restored:boolean};
type Credits={sales?:CustomerSale[];wallet:ApiStatus['wallet'];orders:TestOrder[];grants:Grant[]};
function valid(value:Credits){return value&&Number.isSafeInteger(value.wallet?.available)&&value.wallet.available>=0&&Number.isSafeInteger(value.wallet?.reserved)&&value.wallet.reserved>=0&&(!value.wallet.credits||[value.wallet.credits.available,value.wallet.credits.reserved].every(n=>Number.isSafeInteger(n)&&n>=0))&&(value.wallet.kind!=='customer-ads'||(Array.isArray(value.sales)&&value.sales.every(s=>Number.isSafeInteger(s.ads)&&s.ads>0&&typeof s.id==='string'&&Number.isFinite(Date.parse(s.verified)))))&&Array.isArray(value.orders)&&Array.isArray(value.grants)&&value.orders.every(o=>typeof o.id==='string'&&Number.isSafeInteger(o.credits)&&o.credits>0&&Number.isFinite(o.created)&&Number.isSafeInteger(o.amount)&&o.amount>=0&&o.currency==='KRW'&&o.test===true&&['pending','verified','paid','canceled'].includes(o.state))&&value.grants.every(g=>typeof g.id==='string'&&Number.isSafeInteger(g.credits)&&g.credits>0&&Number.isFinite(g.created)&&['pending','completed'].includes(g.state));}
export function CreditsPage({returnPage}:{returnPage:string}){
 const {t,language}=useUiLanguage(),session=betaSession(),[data,setData]=useState<Credits>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[checked,setChecked]=useState(''),[expired,setExpired]=useState(false);
 const request=useRef<AbortController|null>(null);
 async function refresh(){if(!session||request.current)return;const controller=new AbortController();request.current=controller;setBusy(true);setError('');setExpired(false);setData(undefined);setChecked('');const timer=setTimeout(()=>controller.abort(),15000);
  try{const value=await apiRequest<Credits>('/api/account/credits',undefined,controller.signal);if(request.current!==controller)return;if(!valid(value))throw Error('INVALID_CREDITS');setData(value);setChecked(new Date().toISOString());}
  catch(e){if(request.current===controller){setExpired(e instanceof ApiRequestFailure&&e.status===401);setError(controller.signal.aborted?t('15초 안에 이용권 정보를 확인하지 못했습니다. 다시 조회해주세요.','Credits lookup timed out after 15 seconds. Please retry.'):e instanceof ApiRequestFailure&&e.status===401?t('로그인이 만료되었습니다. 같은 계정으로 로그인해주세요.','Your session expired. Sign in with the same account.'):t('이용권 정보를 확인하지 못했습니다. 잔액을 0으로 처리하지 않았습니다. 다시 조회해주세요.','Could not check your credits. Your balance has not been treated as zero. Please retry.'));}}
  finally{clearTimeout(timer);if(request.current===controller){request.current=null;setBusy(false);}}
 }
 useEffect(()=>{
  void refresh();
  function afterPurchase(){
   if(!session || session.token!==betaSession()?.token)return;
   // An in-flight balance read may have started before the purchase was credited.
   request.current?.abort();
   request.current=null;
   void refresh();
  }
  window.addEventListener('aiadcast-credit-refresh',afterPurchase);
  return ()=>{
   window.removeEventListener('aiadcast-credit-refresh',afterPurchase);
   request.current?.abort();
   request.current=null;
  };
 },[session?.token]);
 const orderStatus=(order:TestOrder)=>{
  if(order.state==='paid')return t('결제 완료','Paid');
  if(order.state==='verified')return t('결제 완료 · 지급 중','Paid · Adding credits');
  if(order.providerStatus==='EXPIRED')return t('승인 만료','Approval expired');
  if(order.providerStatus==='ABORTED')return t('승인 실패','Approval failed');
  if(order.state==='canceled')return t('결제 취소','Canceled');
  if(order.providerStatus==='NO_APPROVAL')return t('승인 내역 없음','No approval found');
  if(order.providerStatus==='UNAVAILABLE')return t('승인 조회 지연','Approval lookup delayed');
  if(order.providerStatus==='LOOKUP_DENIED')return t('승인 조회 불가','Approval lookup unavailable');
  if(order.providerStatus==='PARTIAL_CANCELED')return t('부분 취소','Partially canceled');
  return t('승인 대기','Awaiting approval');
 };
 const locale=language==='ko'?'ko-KR':'en-US';
 const shortDate=(timestamp:string|number)=>new Intl.DateTimeFormat(locale,{year:'numeric',month:'short',day:'numeric'}).format(new Date(timestamp));
 const available=data?(data.wallet.unlimited?t('관리자 · 차감 없음','Administrator · No charge'):data.wallet.kind==='customer-ads'
  ?t(`광고 ${Math.floor((data.wallet.credits?.available??0)/10)}장`,`${Math.floor((data.wallet.credits?.available??0)/10)} ads`)
  :data.wallet.credits?data.wallet.credits.available+t(' 크레딧',' credits'):data.wallet.available+t('개',' credits')):t('미조회','Not checked');
 const legacy=!!data?.wallet.credits&&data.wallet.available>0;
 return <section className="account-page credits-page">
  <a className="page-back" href={'#'+returnPage}><ArrowLeft size={18} aria-hidden="true"/>{t('돌아가기','Back')}</a>
  <header className="wallet-heading"><h1>{t('내 이용권','My credits')}</h1>{session&&<span>{session.user.label}</span>}</header>
  <div className="wallet-card"><dl className="credit-summary"><dt>{t('사용 가능','Available')}</dt><dd>{available}</dd></dl>
   {legacy&&<div className="wallet-legacy"><span>{t('기존 이용권','Legacy tickets')}</span><strong>{data.wallet.available}{t('개',' tickets')}</strong><span>{t('먼저 사용','Used first')}</span></div>}
   <div className="wallet-tools"><p role="status" title={checked?new Date(checked).toLocaleTimeString(locale):undefined}>{busy?t('조회 중…','Checking…'):checked?t('조회 완료','Checked'):t('미조회','Not checked')}</p>
    {session&&<button className="wallet-button wallet-refresh" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={17} aria-hidden="true"/>{t('이용권 다시 조회','Refresh credits')}</button>}
   </div>
  </div>
  {error&&<p role="alert">{error}</p>}
  {!session||expired?<a className="wallet-button wallet-primary" href="#login" onClick={()=>{if(expired)setBetaSession(null,'login');}}>{expired?t('같은 계정으로 로그인','Sign in with the same account'):t('로그인','Sign in')}</a>:null}
  <div className="wallet-actions"><a className="wallet-button wallet-primary" href="#checkout">{t('이용권 구매하기','Buy credits')}</a>
   {session&&<a className="wallet-button wallet-secondary" href="#create"><ImagePlus size={20} aria-hidden="true"/>{t('광고 이미지 만들기','Create an ad image')}</a>}</div>
  <h2>{t('최근 구매 내역','Recent purchases')}</h2>
  {!data?<p>{t('구매 내역 미조회','Purchases not checked')}</p>:data.sales?.length?<ul className="wallet-history">{data.sales.map(s=><li key={s.id}>
   <strong>{t(`광고 ${s.ads}장`,`${s.ads} ads`)}</strong><span className="wallet-state">{s.restored?t('구매 복원','Restored'):t('구매 확인','Verified')}</span><time>{shortDate(s.verified)}</time></li>)}</ul>
   :!data.orders.length?<p>{t('조회된 구매 내역이 없습니다.','No purchases found.')}</p>:<ul className="wallet-history">{data.orders.map(o=><li key={o.id}>
    <strong>{o.credits}{o.unit==='credit-v2'?t(' 크레딧',' credits'):t('개 기존 이용권',' legacy tickets')}</strong>
    <span className={'wallet-state state-'+o.state}>{orderStatus(o)}</span><time>{shortDate(o.created)}</time><b>{o.amount.toLocaleString(locale)}{t('원',' KRW')}</b>
   </li>)}</ul>}
  {session&&<CommerceRecords key={session.user.id}/>}
 </section>;
}
