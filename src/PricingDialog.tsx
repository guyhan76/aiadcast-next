import {playPackage} from './PlayCheckout';
import {useNativeVersion} from './app-version';
import {useId,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {CreditOffers} from './CreditOffers';
import './pricing.css';
import {useUiLanguage} from './ui-language';

export function PricingDialog(){
 const {language,t}=useUiLanguage(),native=useNativeVersion();
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
 const [selected,select]=useState('plan-plus-monthly');
 if(native?.packageName===playPackage)return <a className="pricing-trigger" href="#checkout">{t('이용 요금','Pricing')}</a>;
 return <>
  <button className="pricing-trigger" onClick={()=>dialog.current?.showModal()}>{t('이용 요금','Pricing')}</button>
  <dialog ref={dialog} className="pricing-dialog" aria-labelledby={titleId} lang={language}>
   <div className="pricing-head"><span>AIADCAST</span><button className="icon-button" aria-label={t('요금 안내 닫기','Close pricing')} onClick={()=>dialog.current?.close()}><X size={21}/></button></div>
   <div className="pricing-title"><h2 id={titleId}>{t('이용 요금','Pricing')}</h2><span>{t('베타','Beta')}</span></div>
   <p className="pricing-intro">{t('이미지와 영상에 함께 쓰는 크레딧을 충전하세요.','Top up once for both images and videos.')}</p>
   <CreditOffers value={selected} change={select}/>
   <a href="#checkout" className="pricing-checkout-link" onClick={()=>{sessionStorage.setItem('aiadcast.checkout-choice',JSON.stringify({selected}));dialog.current?.close();}}>{t('선택한 상품 보기','View selected offer')}</a>
   <p className="credit-rules"><strong>{t('이미지 1장당 5크레딧 · 영상 1초당 2크레딧','5 credits per image · 2 credits per second of video')}</strong><span>{t('같은 광고의 저장·공유·재다운로드에는 추가로 차감하지 않습니다.','Saving, sharing and downloading the same ad again do not use additional credits.')}</span></p>
   <section className="pricing-policy"><h3>{t('차감과 복구 안내','Charges and recovery')}</h3><ul>
    <li>{t('정상 결과 제공 시 차감합니다. 단순 취향 반려·미확인은 자동 복원하지 않습니다.','Credits are charged on delivery. Preference rejection or no review does not refund.')}</li>
    <li>{t('시스템 오류·확인된 생성 결함은 추가 차감 없이 수정하거나 이용권을 복원합니다.','System errors and verified generation defects receive a correction or credit restoration.')}</li>
    <li>{t('새로운 연출·배경·AI 부분 수정은 실행 전에 필요한 크레딧을 안내합니다.','New scenes, backgrounds and AI edits show required credits before you proceed.')}</li>
   </ul></section>
   <div className="pricing-notes"><p>{t('부가세 포함','Includes Korean VAT')}</p><p>{t('실제 구매 가능 여부와 최종 금액은 결제 화면에서 확인하세요.','Check checkout for availability and the final price.')}</p></div>
  </dialog>
 </>;
}
