import {useId,useRef,useState} from 'react';
import {X,Check} from 'lucide-react';
import {formatPrice,pricingCurrency,pricingCatalog} from './pricing';
import type {PricingLanguage,PricingCurrency} from './pricing';
import './pricing.css';
import {useUiLanguage} from './ui-language';

const copy = {
 ko:{title:'이용 요금',eyebrow:'AIADCAST / PRICING',tag:'출시 가격',intro:'한 번 만든 광고, 필요한 부분만 고쳐 계속 쓰세요.',preview:'출시 가격 안내입니다. 결제 연결 전으로, 실제 청구 없이 테스트 결제와 테스트 크레딧 정책을 검증합니다.',language:'요금 안내 언어',currency:'표시 통화',close:'요금 안내 닫기',ads:'크레딧',names:['체험용','기본형','묶음형'],descriptions:['첫 광고부터 가볍게','일상의 홍보를 꾸준히','여러 상품과 캠페인을 함께'],recommend:'추천',unit:'광고 1개당 약',features:['동일한 핵심 편집 기능','입력 수정·저장·공유 무료','여러 비율로 저장·재다운로드'],creditRules:'생성·재생성 1회 = 10크레딧',reuse:'한 광고를 피드·스토리·릴스용 이미지로 저장해도 광고 1개로 계산합니다. 릴스용 출력은 정지 이미지이며 영상 생성은 포함하지 않습니다.',policyTitle:'수정은 편하게. 차감은 분명하게.',policies:['저장된 문구·가격·규격 표시 직접 수정, 단순 비율 변경과 재다운로드에는 생성 크레딧을 차감하지 않습니다.','신규 크레딧은 생성 전 예약하고 정상 결과 제공 시 차감합니다. 단순 취향 반려·미확인은 자동 복원하지 않습니다. 기존 이용권은 기존 규칙을 유지하며 먼저 사용합니다.','시스템 오류·확인된 생성 결함은 추가 차감 없이 수정하거나 이용권을 복원합니다.','새로운 연출·배경·AI 부분 생성은 실행 전에 필요한 크레딧을 안내합니다.'],taxKRW:'원화 가격은 부가세 포함입니다.',taxUSD:'달러 가격은 해당 지역 판매세 별도 기준입니다.',checkout:'안내 언어·표시 통화 선택은 광고 문구 언어와 결제 국가를 바꾸지 않습니다. 실제 구매 시 스토어 국가와 결제 화면의 통화·총액을 확인하세요.',billing:'자동 구독 없이 필요한 수량을 선택하는 충전형 상품입니다.'},
 en:{title:'Pricing',eyebrow:'AIADCAST / PRICING',tag:'Launch prices',intro:'Create an ad once. Keep it useful with simple edits.',preview:'Launch pricing preview. Checkout is not connected. Test checkout and credits do not involve real charges.',language:'Pricing language',currency:'Display currency',close:'Close pricing',ads:'credits',names:['Trial','Essential','Bundle'],descriptions:['Start with your first ads','Keep your business visible','Create across products and campaigns'],recommend:'Recommended',unit:'Approx. per new ad',features:['The same core editing features','Free input edits, save and share','Export sizes and download again'],creditRules:'Generation or regeneration = 10 credits',reuse:'Exporting one ad for feed, stories and Reels images still counts as one ad. Reels exports are still images; video generation is not included.',policyTitle:'Flexible edits. Clear charges.',policies:['Direct edits to saved text, prices and dimension labels, simple size changes and repeat downloads do not use generation credits.','New credits are reserved before generation and charged on delivery. Preference rejection or no review does not refund. Legacy tickets retain their rules and are used first.','System errors and verified generation defects receive a correction without an extra charge or a credit restoration.','New scenes, backgrounds and AI-generated edits show the required credits before you proceed.'],taxKRW:'KRW prices include Korean VAT.',taxUSD:'USD prices exclude applicable local sales tax.',checkout:'Pricing language and display currency do not change your ad language or billing country. Your store country and checkout determine the final currency and total.',billing:'Credit packs, without an automatic subscription. Choose the quantity you need.'},
} as const;

function readPreference(key:string){try{return localStorage.getItem(key);}catch{return null;}}
function initialLanguage(fallback:PricingLanguage='ko'):PricingLanguage {const saved=readPreference('aiadcast-pricing-language');return saved==='en'||saved==='ko'?saved:fallback;}
function initialCurrency():PricingCurrency {return pricingCurrency(readPreference('aiadcast-pricing-currency'));}
function savePreference(key:string,value:string){try{localStorage.setItem(key,value);}catch{/* Display works without storage. */}}
export function PricingDialog(){
 const {language:uiLanguage,t:uiText}=useUiLanguage();
 const dialog=useRef<HTMLDialogElement>(null);
 const titleId=useId();
 const [language,setLanguage]=useState<PricingLanguage>(()=>initialLanguage(uiLanguage));
 const [currency,setCurrency]=useState<PricingCurrency>(initialCurrency);
 const t=copy[language];
 function selectLanguage(next:PricingLanguage){setLanguage(next);savePreference('aiadcast-pricing-language',next);}
 function selectCurrency(next:PricingCurrency){setCurrency(next);savePreference('aiadcast-pricing-currency',next);}
 function open(){setLanguage(initialLanguage(uiLanguage));setCurrency(initialCurrency());dialog.current?.showModal();}
 return <>
  <button className="pricing-trigger" onClick={open}>{uiText('이용 요금','Pricing')}</button>
  <dialog ref={dialog} className="pricing-dialog" aria-labelledby={titleId} lang={language}>
   <div className="pricing-head"><span>{t.eyebrow}</span><button className="icon-button" aria-label={t.close} onClick={()=>dialog.current?.close()}><X size={21}/></button></div>
   <div className="pricing-title"><h2 id={titleId}>{t.title}</h2><span>{t.tag}</span></div>
   <p className="pricing-intro">{t.intro}</p>
   <div className="pricing-controls">
    <div className="pricing-language" role="group" aria-label={t.language}>
     <span>{t.language}</span><div><button aria-pressed={language==='ko'} onClick={()=>selectLanguage('ko')}>한국어</button><button aria-pressed={language==='en'} onClick={()=>selectLanguage('en')}>English</button></div>
    </div>
    <div className="pricing-language" role="group" aria-label={t.currency}>
     <span>{t.currency}</span><div><button aria-pressed={currency==='KRW'} onClick={()=>selectCurrency('KRW')}>KRW · 원</button><button aria-pressed={currency==='USD'} onClick={()=>selectCurrency('USD')}>USD · $</button></div>
    </div>
   </div>
   <p className="pricing-preview">{t.preview}</p>
   <div className="price-cards">
    {pricingCatalog.packs.map((pack,index)=><article key={pack.id} className={`price-card${index===1?' recommended':''}`} aria-label={`${pack.credits} ${t.ads}`}>
     <div className="price-card-label"><span>{t.names[index]}</span>{index===1&&<b>{t.recommend}</b>}</div>
     <h3>{pack.credits} <span>{t.ads}</span></h3>
     <strong className="pack-price">{formatPrice(pack.prices[currency],currency,language)}</strong>
     <p className="unit-price">{t.unit} <b>{formatPrice(pack.prices[currency]===null?null:pack.prices[currency]!/(pack.credits/10),currency,language)}</b></p>
     <p className="pack-description">{t.descriptions[index]}</p>
     <ul className="pack-features">{t.features.map(feature=><li key={feature}><Check size={14} aria-hidden="true"/>{feature}</li>)}</ul>
    </article>)}
   </div>
   <a href="#checkout" className="pricing-checkout-link" onClick={()=>dialog.current?.close()}>{uiText('이용권 선택','Choose credits')}</a>
   <p className="credit-rules"><strong>{t.creditRules}</strong><span>{t.reuse}</span></p>
   <section className="pricing-policy"><h3>{t.policyTitle}</h3><ul>{t.policies.map(text=><li key={text}>{text}</li>)}</ul></section>
   <div className="pricing-notes"><p>{currency==='KRW'?t.taxKRW:t.taxUSD}</p><p>{t.billing}</p><p>{t.checkout}</p></div>
  </dialog>
 </>;
}
