import {useId} from 'react';
import {Check} from 'lucide-react';
import {checkoutOffers,formatPrice,imageCredits,videoCreditsPerSecond,type BillingPeriod} from './pricing';
import {useUiLanguage} from './ui-language';
import './credit-offers.css';

export function CreditRates(){
 const {t}=useUiLanguage();
 return <p className="credit-rates"><span>{t('이미지 1장 '+imageCredits+'크레딧',imageCredits+' credits per image')}</span><span>{t('AI 영상 1초 '+videoCreditsPerSecond+'크레딧',videoCreditsPerSecond+' credits per second of AI video')}</span></p>;
}

export function CreditOffers({value,change}:{value:string;change:(id:string)=>void}){
 const {t,language}=useUiLanguage();
 const groupName=useId();
 const selected=checkoutOffers.find(o=>o.id===value)??checkoutOffers[0];
 const label=(period:BillingPeriod)=>period==='monthly'?t('월간','Monthly'):period==='annual'?t('연간','Annual'):t('크레딧 추가','Top up');
 return <div className="credit-offers">
  <div className="offer-tabs" role="group" aria-label={t('결제 방식','Billing period')}>
   {(['monthly','annual','topup'] as const).map(period=><button key={period} type="button" aria-pressed={selected.period===period}
    onClick={()=>{const rows=checkoutOffers.filter(o=>o.period===period);change((rows.find(o=>o.credits===selected.credits)??rows[0]).id);}}>{label(period)}</button>)}
  </div>
  <fieldset className="offer-grid checkout-packs"><legend>{label(selected.period)}</legend>
   {checkoutOffers.filter(o=>o.period===selected.period).map(o=><label key={o.id} className={o.id===value?'selected':''}>
    <span className="offer-choice">
     <input type="radio" name={groupName} value={o.id} checked={o.id===value} onChange={()=>change(o.id)}/>
     <span className="offer-choice-mark" aria-hidden="true"><Check size={15} strokeWidth={3}/></span>
    </span>
    <span><strong>{o.period==='topup'?t(o.credits+'크레딧',o.credits+' credits'):t(o.ko,o.en)}</strong>
    {o.period!=='topup'&&<small>{t('매월 '+o.credits+'크레딧',o.credits+' credits each month')}</small>}</span>
    <span className="offer-amount"><b>{formatPrice(o.monthlyRate||o.prices.KRW,'KRW',language)}{o.period!=='topup'&&t(' / 월',' / mo')}</b>
    {o.period==='annual'&&<small>{t('연 '+formatPrice(o.prices.KRW,'KRW',language)+' 결제',formatPrice(o.prices.KRW,'KRW',language)+' billed yearly')}</small>}</span>
   </label>)}
  </fieldset>
 </div>;
}
