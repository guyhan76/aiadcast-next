import {useRef,useState} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {useUiLanguage} from './ui-language';
type Quote={applied:boolean;email:string;userId?:string;quoteToken?:string;addedCredits:number;totalMicros:number;memberLimitMicros:number;ownerLimitMicros:number;spentMicros?:number;heldMicros?:number;wallet:{available:number;reserved:number}};
export function AdminDemoSupport({userId,email,onApplied}:{userId:string;email:string;onApplied:()=>Promise<void>}){
 const {t}=useUiLanguage(),[quote,setQuote]=useState<Quote>(),[busy,setBusy]=useState(false),[error,setError]=useState('');const locked=useRef(false),request=useRef(crypto.randomUUID());
 const usd=(n:number)=>'$'+(n/1e6).toFixed(4);
 async function run(apply=false){
  if(locked.current)return;
  if(apply&&(!quote?.quoteToken||quote.applied||!window.confirm(t(`${email} 회원의 10월 배정을 $1로 옮기고 테스트 이용권 ${quote.addedCredits}개를 추가합니다. 관리자 배정 $4, 전체 $5를 유지합니다. 적용할까요?`,`Move $1 of October allocation to ${email} and add ${quote.addedCredits} test credits? Administrator $4; total $5.`))))return;
  locked.current=true;setBusy(true);setError('');
  try{
   const value=await apiRequest<Quote>(apply?'/api/admin/demo-support':'/api/admin/demo-support-preview',{userId,email,...(apply?{requestId:request.current,quoteToken:quote!.quoteToken}:{})});
   if(value.email!==email||value.totalMicros!==5000000||value.memberLimitMicros!==1000000||value.ownerLimitMicros!==4000000||!Number.isSafeInteger(value.addedCredits)||value.addedCredits<0||value.addedCredits>3||(!value.applied&&typeof value.quoteToken!=='string'))throw Error('INVALID_SUPPORT_QUOTE');
   setQuote(value);if(value.applied)await onApplied();
  }catch(e){const code=e instanceof ApiRequestFailure?e.code:'';setError(code==='DEMO_SUPPORT_OWNER_BUDGET_IN_USE'?t('관리자의 사용액과 보류액을 보호해야 하므로 $1을 옮길 수 없습니다.','Cannot move $1 while protecting administrator spending and holds.'):code==='DEMO_SUPPORT_QUOTE_CHANGED'?t('조회 이후 잔액이나 비용이 바뀌었습니다. 적용 전 다시 조회해주세요.','Balances or costs changed. Review a fresh quote before applying.'):t('지원 준비 결과를 확인하지 못했습니다. 대상·기간·서버 상태를 확인하고 다시 조회하세요. 적용 응답이 끊겼다면 같은 적용 요청으로 확인할 수 있습니다.','Could not confirm support preparation. Check target, period and server, then review again. If the apply response was lost, retry the same apply request.'));}
  finally{locked.current=false;setBusy(false);}
 }
 return <section className="admin-card" aria-label={t('10월 회원 시연 지원','October member demo support')}><h3>{t('10월 회원 시연 지원','October member demo support')}</h3><p>{email}</p><p>{t('전체 $5 안에서 관리자 $4 · 회원 $1로 재배정합니다. 이용권은 보유·예약 합계 3개에서 부족한 수량만 한 번 추가하며, 사용 후 다시 채우지 않습니다. 실제 결제나 AI 생성은 실행하지 않습니다.','Redistribute the existing $5 as administrator $4 and member $1. Add only credits missing from a total of 3 available plus held credits, once; do not refill after use. No payment or AI generation runs.')}</p><button disabled={busy} onClick={()=>void run()}>{t('지원 적용 전 조회','Review support before applying')}</button>{quote&&<><p>{t('전체 한도','Total cap')} {usd(quote.totalMicros)} · {t('관리자 배정','Administrator allocation')} {usd(quote.ownerLimitMicros)} · {t('회원 배정','Member allocation')} {usd(quote.memberLimitMicros)}</p><p>{t('현재 이용권','Current credits')} {quote.wallet.available} / {t('예약','Held')} {quote.wallet.reserved} · {t('추가 수량','Additional credits')} {quote.addedCredits}</p>{!quote.applied&&<p>{t('관리자 기존 사용액','Administrator spending')} {usd(quote.spentMicros??0)} · {t('비용 보류','Cost holds')} {usd(quote.heldMicros??0)}</p>}{quote.applied?<p role="status">{t('시연 지원 적용됨 · 중복 지급 없음','Demo support applied · No duplicate grant')}</p>:<button disabled={busy} onClick={()=>void run(true)}>{t('조회한 시연 지원 적용','Apply reviewed demo support')}</button>}</>}{error&&<p role="alert">{error}</p>}</section>;
}
