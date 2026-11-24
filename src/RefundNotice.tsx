import {useEffect,useState} from 'react';
import {apiRequest} from './generation-client';
import {refundNoticeEn,refundNoticeKo} from './refund-policy';
import {useUiLanguage} from './ui-language';

export function RefundNotice({compact=false}:{compact?:boolean}={}){
 const {t}=useUiLanguage();
 if(compact)return <details className="checkout-refund"><summary>{t('단순 변심 환불 · 미사용분 7일 이내','Change-of-mind refunds · Unused credits within 7 days')}</summary><p>{t(refundNoticeKo,refundNoticeEn)}</p></details>;
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
