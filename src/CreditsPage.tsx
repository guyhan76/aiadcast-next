import {AppVersionInfo} from './AppVersionInfo';
import {useEffect,useRef,useState} from 'react';
import {apiRequest,ApiRequestFailure,type ApiStatus} from './generation-client';
import {betaSession,setBetaSession} from './beta-session';
import {useUiLanguage} from './ui-language';
import type {TestOrder} from './account-client';
import './account-pages.css';
type Grant={id:string;credits:number;state:'pending'|'completed';created:number};
type Credits={wallet:ApiStatus['wallet'];orders:TestOrder[];grants:Grant[]};
function valid(value:Credits){return value&&Number.isSafeInteger(value.wallet?.available)&&value.wallet.available>=0&&Number.isSafeInteger(value.wallet?.reserved)&&value.wallet.reserved>=0&&Array.isArray(value.orders)&&Array.isArray(value.grants)&&value.orders.every(o=>typeof o.id==='string'&&Number.isSafeInteger(o.credits)&&o.credits>0&&Number.isFinite(o.created)&&Number.isSafeInteger(o.amount)&&o.amount>=0&&o.currency==='KRW'&&o.test===true&&['pending','verified','paid','canceled'].includes(o.state))&&value.grants.every(g=>typeof g.id==='string'&&Number.isSafeInteger(g.credits)&&g.credits>0&&Number.isFinite(g.created)&&['pending','completed'].includes(g.state));}
export function CreditsPage({returnPage}:{returnPage:string}){
 const {t,language}=useUiLanguage(),session=betaSession(),[data,setData]=useState<Credits>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[checked,setChecked]=useState(''),[expired,setExpired]=useState(false);
 const request=useRef<AbortController|null>(null);
 async function refresh(){if(!session||request.current)return;const controller=new AbortController();request.current=controller;setBusy(true);setError('');setExpired(false);setData(undefined);setChecked('');const timer=setTimeout(()=>controller.abort(),15000);
  try{const value=await apiRequest<Credits>('/api/account/credits',undefined,controller.signal);if(request.current!==controller)return;if(!valid(value))throw Error('INVALID_CREDITS');setData(value);setChecked(new Date().toISOString());}
  catch(e){if(request.current===controller){setExpired(e instanceof ApiRequestFailure&&e.status===401);setError(controller.signal.aborted?t('15초 안에 이용권 정보를 확인하지 못했습니다. 다시 조회해주세요.','Credits lookup timed out after 15 seconds. Please retry.'):e instanceof ApiRequestFailure&&e.status===401?t('로그인이 만료되었습니다. 같은 계정으로 로그인해주세요.','Your session expired. Sign in with the same account.'):t('이용권 정보를 확인하지 못했습니다. 잔액을 0으로 처리하지 않았습니다. 다시 조회해주세요.','Could not check your credits. Your balance has not been treated as zero. Please retry.'));}}
  finally{clearTimeout(timer);if(request.current===controller){request.current=null;setBusy(false);}}
 }
 useEffect(()=>{void refresh();return()=>{request.current?.abort();request.current=null;};},[session?.token]);
 const state=(v:string)=>({paid:t('결제 완료','Paid'),pending:t('확인 중','Pending'),verified:t('지급 확인 중','Verifying grant'),canceled:t('취소','Canceled'),completed:t('지급 완료','Granted')}[v]??v);
 return <><AppVersionInfo/><section className="account-page credits-page"><a href={'#'+returnPage}>{t('돌아가기','Back')}</a><h1>{t('내 이용권','My credits')}</h1>
 <p>{session?.user.label??t('로그인 후 내 이용권을 확인할 수 있습니다.','Sign in to view your credits.')}</p>
 <dl className="credit-summary"><div><dt>{t('사용 가능','Available')}</dt><dd>{data?(data.wallet.unlimited?t('관리자 테스트 · 차감 없음','Administrator tests · No charge'):data.wallet.available+t('개',' credits')):t('미조회','Not checked')}</dd></div><div><dt>{t('예약 중','Reserved')}</dt><dd>{data?data.wallet.reserved+t('개',' credits'):t('미조회','Not checked')}</dd></div></dl>
 {data?.wallet.credits&&<p>{t('기존 이용권 우선 사용 · 신규 크레딧','Legacy tickets first · New credits')}: {data.wallet.credits.available} · {t('예약 중','Reserved')}: {data.wallet.credits.reserved}</p>}
 <p role="status">{busy?t('서버에서 이용권을 조회 중입니다…','Checking credits with the server…'):checked?<>{t('조회 완료','Checked')} · <time dateTime={checked}>{new Date(checked).toLocaleTimeString()}</time></>:t('이용권 정보 미조회','Credits not checked')}</p>
 {error&&<p role="alert">{error}</p>}{expired&&<a className="primary-action" href="#login" onClick={()=>{setBetaSession(null,'login');}}>{t('같은 계정으로 로그인','Sign in with the same account')}</a>}{session?<button disabled={busy} onClick={()=>void refresh()}>{busy?t('조회 중…','Checking…'):t('이용권 다시 조회','Refresh credits')}</button>:<a className="primary-action" href="#login">{t('로그인','Sign in')}</a>}
 <p className="account-help">{t('이용권과 이미지 생성용 API 예산은 별도입니다. 이용권이 있어도 예산 배정·비용 보류·규격 기능의 준비 상태에 따라 생성이 제한될 수 있습니다.','Credits and image generation API budget are separate. Allocation, cost holds and dimension readiness may still prevent generation.')}</p>
 <h2>{t('최근 구매 내역','Recent purchases')}</h2>{!data?<p>{t('구매 내역 미조회','Purchases not checked')}</p>:!data.orders.length?<p>{t('조회된 구매 내역이 없습니다.','No purchases found.')}</p>:<ul className="credit-history">{data.orders.map(o=><li key={o.id}><strong>{o.credits}{o.unit==='credit-v2'?t(' 크레딧',' credits'):t('개 기존 이용권',' legacy tickets')} · {state(o.state)}</strong><span>{new Date(o.created).toLocaleString(language==='ko'?'ko-KR':'en-US')} · {o.amount.toLocaleString()} KRW · {t('테스트 결제','Test payment')}</span></li>)}</ul>}
 <h2>{t('최근 관리자 지급 내역','Recent administrator grants')}</h2>{!data?<p>{t('지급 내역 미조회','Grants not checked')}</p>:!data.grants.length?<p>{t('조회된 관리자 지급 내역이 없습니다.','No administrator grants found.')}</p>:<ul className="credit-history">{data.grants.map(g=><li key={g.id}><strong>{g.credits}{t('개',' credits')} · {state(g.state)}</strong><span>{new Date(g.created).toLocaleString(language==='ko'?'ko-KR':'en-US')}</span></li>)}</ul>}
 <p className="account-help">{t('구매·관리자 지급 내역은 각각 최근 30건이며, 현재 잔액은 사용·예약·복원 결과를 포함합니다.','Up to 30 recent purchases and administrator grants are shown. The current balance also reflects use, reservations and restorations.')}</p>
 <a className="primary-action" href="#checkout">{t('이용권 구매하기','Buy credits')}</a>{session&&<a className="guest-link" href="#checkout-return">{t('결제 후 작업 이어가기','Resume after checkout')}</a>}
 </section></>;
}
