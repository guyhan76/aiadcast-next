import {playPackage} from './PlayCheckout';
import {useNativeVersion} from './app-version';
import {useId,useRef} from 'react';
import {X,Check} from 'lucide-react';
import {formatPrice,pricingCatalog} from './pricing';
import './pricing.css';
import {useUiLanguage} from './ui-language';

export function PricingDialog(){
 const {language,t}=useUiLanguage(),native=useNativeVersion();
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
 if(native?.packageName===playPackage)return <a className="pricing-trigger" href="#checkout">{t('이용 요금','Pricing')}</a>;
 const features=[t('입력 수정·저장·공유 무료','Free input edits, save and share'),t('여러 비율로 저장·재다운로드','Export sizes and download again')];
 return <>
  <button className="pricing-trigger" onClick={()=>dialog.current?.showModal()}>{t('이용 요금','Pricing')}</button>
  <dialog ref={dialog} className="pricing-dialog" aria-labelledby={titleId} lang={language}>
   <div className="pricing-head"><span>AIADCAST</span><button className="icon-button" aria-label={t('요금 안내 닫기','Close pricing')} onClick={()=>dialog.current?.close()}><X size={21}/></button></div>
   <div className="pricing-title"><h2 id={titleId}>{t('이용 요금','Pricing')}</h2><span>{t('국내 출시 가격','Korean launch prices')}</span></div>
   <p className="pricing-intro">{t('광고 이미지는 첫 1장이 무료입니다.','Your first ad image is free.')}</p>
   <div className="price-cards">
    <article className="price-card" aria-label={t('첫 광고 1장 무료','First ad free')}>
     <div className="price-card-label"><span>{t('처음 시작','Get started')}</span></div>
     <h3>1 <span>{t('장','ad')}</span></h3><strong className="pack-price">{t('무료','Free')}</strong>
     <p className="pack-description">{t('신규 가입 시 계정당 1회','Once per newly registered account')}</p>
     <a href="#create" className="pricing-checkout-link" onClick={()=>dialog.current?.close()}>{t('광고 만들기','Create an ad')}</a>
    </article>
    {pricingCatalog.packs.map((pack,index)=><article key={pack.id} className={'price-card'+(index===1?' recommended':'')} aria-label={String(pack.credits/pack.creditsPerGeneration)+t('장',' ads')}>
     <div className="price-card-label"><span>{index===0?t('가볍게 시작','Start small'):t('꾸준한 홍보','Keep creating')}</span>{index===1&&<b>{t('추천','Recommended')}</b>}</div>
     <h3>{pack.credits/pack.creditsPerGeneration} <span>{t('장','ads')}</span></h3>
     <strong className="pack-price">{formatPrice(pack.prices.KRW,'KRW',language)}</strong>
     <p className="unit-price">{t('광고 1장당','Per ad')} <b>{formatPrice(pack.prices.KRW/(pack.credits/pack.creditsPerGeneration),'KRW',language)}</b></p>
     <ul className="pack-features">{features.map(feature=><li key={feature}><Check size={14} aria-hidden="true"/>{feature}</li>)}</ul>
    </article>)}
   </div>
   <a href="#checkout" className="pricing-checkout-link" onClick={()=>dialog.current?.close()}>{t('이용권 선택','Choose credits')}</a>
   <p className="credit-rules"><strong>{t('광고 이미지 생성·재생성 1장 = 10크레딧','One generated or regenerated ad image = 10 credits')}</strong><span>{t('같은 광고의 저장·공유·재다운로드에는 추가로 차감하지 않습니다.','Saving, sharing and downloading the same ad again do not use additional credits.')}</span></p>
   <section className="pricing-policy"><h3>{t('차감과 복구 안내','Charges and recovery')}</h3><ul>
    <li>{t('정상 결과 제공 시 차감합니다. 단순 취향 반려·미확인은 자동 복원하지 않습니다.','Credits are charged on delivery. Preference rejection or no review does not refund.')}</li>
    <li>{t('시스템 오류·확인된 생성 결함은 추가 차감 없이 수정하거나 이용권을 복원합니다.','System errors and verified generation defects receive a correction or credit restoration.')}</li>
    <li>{t('새로운 연출·배경·AI 부분 수정은 실행 전에 필요한 크레딧을 안내합니다.','New scenes, backgrounds and AI edits show required credits before you proceed.')}</li>
   </ul></section>
   <section className="pricing-policy"><h3>{t('광고 영상','Ad video')}</h3><p>{t('광고 영상은 관리자 테스트 중입니다. 일반 회원의 영상 요금은 출시 전에 안내합니다.','Video generation is in admin testing. Member pricing will be announced before launch.')}</p></section>
   <div className="pricing-notes"><p>{t('부가세 포함 · 자동 구독 없음','Includes Korean VAT · No automatic subscription')}</p><p>{t('실제 구매 가능 여부와 최종 금액은 결제 화면에서 확인하세요.','Check checkout for availability and the final price.')}</p></div>
  </dialog>
 </>;
}
