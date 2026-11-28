import {useEffect,useState} from 'react';
import {apiRequest} from './generation-client';
import {refundNoticeEn,refundNoticeKo} from './refund-policy';
import {useUiLanguage} from './ui-language';

export function RefundNotice({compact=false}:{compact?:boolean}={}){
 const {t}=useUiLanguage();
 if(compact)return (
  <details className="checkout-refund">
   <summary>
    <strong>{t('단순 변심 환불','Change-of-mind refunds')}</strong>
    <span>{t('미사용분만 · 7일 이내 신청','Unused credits only · Apply within 7 days')}</span>
   </summary>
   <dl>
    <div>
     <dt>{t('7일은 언제부터인가요?','When do the 7 days start?')}</dt>
     <dd>{t('구매 계약 내용을 받은 날과 이용권 사용 가능일 중 늦은 날부터 계산합니다.','Count from the later of receiving the purchase terms and gaining access to the credits.')}</dd>
    </div>
    <div>
     <dt>{t('별도 접수','Other requests')}</dt>
     <dd>{t('생성 실패·중복 결제·법정 해지 등은 따로 접수할 수 있습니다.','You can separately report failed delivery or duplicate charges, or exercise statutory rights.')}</dd>
    </div>
   </dl>
  </details>
 );
 return <section className="refund-policy-notice"><h3>{t('단순 변심 환불 기한','Change-of-mind refund period')}</h3><p>{t(refundNoticeKo,refundNoticeEn)}</p></section>;
}
export function PurchaseRefundReceipt({orderNo,deadline}:{orderNo:string;deadline?:string|null}){
 const {t,language}=useUiLanguage();
 const [end,setEnd]=useState(deadline);
 useEffect(()=>{
  let active=true,pending=false,seen=false;
  async function acknowledge(){
   if(document.visibilityState!=='visible'||pending||seen)return;
   pending=true;
   try{const result=await apiRequest<{deadline:string|null}>('/api/membership/records/receipt-seen',{orderNo});
    if(active){setEnd(result.deadline);seen=true;}
   }catch{/* The receipt remains available in purchase history. */}finally{pending=false;}
  }
  if(!deadline){void acknowledge();document.addEventListener('visibilitychange',acknowledge);window.addEventListener('online',acknowledge);}
  return ()=>{active=false;document.removeEventListener('visibilitychange',acknowledge);window.removeEventListener('online',acknowledge);};
 },[orderNo,deadline]);
 return <section><RefundNotice/>{end&&<p><strong>{t('단순 변심 환불 신청 마감','Change-of-mind refund deadline')}</strong><br/>{new Intl.DateTimeFormat(language==='ko'?'ko-KR':'en-US',{timeZone:'Asia/Seoul',dateStyle:'long',timeStyle:'short'}).format(new Date(end))} ({t('한국시간','KST')})</p>}</section>;
}
