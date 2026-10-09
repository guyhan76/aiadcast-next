import {useId,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {formatPrice,pricingCurrency,pricingProposal} from './pricing';
import type {PricingLanguage} from './pricing';
import './pricing.css';

const copy = {
 ko:{title:'이용 요금',eyebrow:'AIADCAST / PRICING',tag:'출시 제안가',intro:'필요한 만큼 충전하고, 완성한 광고에 사용하세요.',preview:'출시 전 요금 미리보기입니다. 현재 구매하거나 차감하지 않습니다.',language:'요금 안내 언어',close:'요금 안내 닫기',currency:'표시 통화: KRW · 원화',credits:'크레딧',names:['시작하기','꾸준한 제작','여러 상품 관리'],recommend:'추천',unit:'기본 이미지 1장 약',standard:'기본 제작',premium:'고급 제작',images:'장',upTo:'최대',or:'또는',creditRules:'기본 제작 1장 = 1크레딧 · 고급 제작 1장 = 3크레딧',mix:'두 제작 방식을 섞어 사용할 수 있습니다. 요청 전에 필요한 크레딧을 안내합니다.',policyTitle:'수정은 편하게. 차감은 분명하게.',policies:['문구 직접 수정·규격 표시·비율 변경·재다운로드는 무료입니다.','생성 전 이용권을 예약하고, 품질 확인 후 고객이 결과를 승인하면 차감하는 정책을 준비하고 있습니다.','시스템 오류·확인된 생성 결함은 추가 차감 없이 수정하거나 이용권을 복원합니다.','새 콘셉트 요청·추가 AI 생성은 비용을 안내한 뒤 진행합니다. 영상 요금은 별도입니다.'],tax:'원화 제안가는 부가세 포함 기준입니다.',checkout:'언어 선택은 요금 안내에만 적용됩니다. 실제 결제 금액·통화는 스토어 국가와 결제 화면의 가격을 따릅니다.',quality:'고급 제작의 모델·품질 범위는 실제 생성 품질과 원가 검증 후 확정합니다.'},
 en:{title:'Pricing',eyebrow:'AIADCAST / PRICING',tag:'Proposed launch prices',intro:'Top up when you need to. Create ads at your own pace.',preview:'Pre-launch pricing preview. Purchases and credit charges are not available.',language:'Pricing language',close:'Close pricing',currency:'Display currency: USD · US dollars',credits:'credits',names:['Get started','Create regularly','Manage more products'],recommend:'Recommended',unit:'Approx. per standard image',standard:'Standard',premium:'Premium',images:'images',upTo:'Up to',or:'or',creditRules:'Standard image = 1 credit · Premium image = 3 credits',mix:'Mix both options. The required credits will be shown before each request.',policyTitle:'Flexible edits. Clear charges.',policies:['Manual text edits, dimension labels, aspect-ratio changes and repeat downloads are free.','Our planned policy reserves credits before generation and charges after quality checks and your acceptance.','System errors and verified generation defects receive a correction without an extra charge or a credit restoration.','New concepts and additional AI generation require a new quote. Video pricing will be separate.'],tax:'USD proposal prices exclude applicable sales tax.',checkout:'This language choice changes the pricing preview only. Your store country and checkout determine the final currency and charge.',quality:'Premium model and quality specifications will be confirmed after testing output quality and costs.'},
} as const;

function initialLanguage():PricingLanguage {
 try{return localStorage.getItem('aiadcast-pricing-language')==='en'?'en':'ko';}catch{return 'ko';}
}
export function PricingDialog(){
 const dialog=useRef<HTMLDialogElement>(null);
 const titleId=useId();
 const [language,setLanguage]=useState<PricingLanguage>(initialLanguage);
 const t=copy[language],currency=pricingCurrency(language);
 function select(next:PricingLanguage){setLanguage(next);try{localStorage.setItem('aiadcast-pricing-language',next);}catch{/* Display works without storage. */}}
 return <>
  <button className="pricing-trigger" onClick={()=>{try{const saved=localStorage.getItem('aiadcast-pricing-language');if(saved==='ko'||saved==='en')setLanguage(saved);}catch{/* Keep this dialog's language if storage is unavailable. */}dialog.current?.showModal();}}>이용 요금</button>
  <dialog ref={dialog} className="pricing-dialog" aria-labelledby={titleId} lang={language}>
   <div className="pricing-head"><span>{t.eyebrow}</span><button className="icon-button" aria-label={t.close} onClick={()=>dialog.current?.close()}><X size={21}/></button></div>
   <div className="pricing-title"><h2 id={titleId}>{t.title}</h2><span>{t.tag}</span></div>
   <p className="pricing-intro">{t.intro}</p>
   <div className="pricing-language" role="group" aria-label={t.language}>
    <button aria-pressed={language==='ko'} onClick={()=>select('ko')}>한국어</button>
    <button aria-pressed={language==='en'} onClick={()=>select('en')}>English</button>
    <span>{t.currency}</span>
   </div>
   <p className="pricing-preview">{t.preview}</p>
   <div className="price-cards">
    {pricingProposal.packs.map((pack,index)=><article key={pack.id} className={`price-card${index===1?' recommended':''}`} aria-label={`${pack.credits} ${t.credits}`}>
     <div className="price-card-label"><span>{t.names[index]}</span>{index===1&&<b>{t.recommend}</b>}</div>
     <h3>{pack.credits} <span>{t.credits}</span></h3>
     <strong className="pack-price">{formatPrice(pack.prices[currency],currency,language)}</strong>
     <p className="unit-price">{t.unit}<br/><b>{formatPrice(pack.prices[currency]/pack.credits,currency,language)}</b></p>
     <div className="pack-yield"><p>{t.standard} · {t.upTo} {pack.credits} {t.images}</p><small>{t.or}</small><p>{t.premium} · {t.upTo} {Math.floor(pack.credits/pricingProposal.premiumCredits)} {t.images}</p></div>
    </article>)}
   </div>
   <p className="credit-rules"><strong>{t.creditRules}</strong><span>{t.mix}</span></p>
   <section className="pricing-policy"><h3>{t.policyTitle}</h3><ul>{t.policies.map(text=><li key={text}>{text}</li>)}</ul></section>
   <div className="pricing-notes"><p>{t.tax}</p><p>{t.checkout}</p><p>{t.quality}</p></div>
  </dialog>
 </>;
}
