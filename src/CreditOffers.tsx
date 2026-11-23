import {checkoutOffers,formatPrice,type BillingPeriod} from './pricing';
import {useUiLanguage} from './ui-language';
import './credit-offers.css';

export function CreditOffers({value,change}:{value:string;change:(id:string)=>void}){
 const {t,language}=useUiLanguage();
 const selected=checkoutOffers.find(o=>o.id===value)??checkoutOffers[0];
 const label=(period:BillingPeriod)=>period==='monthly'?t('월간','Monthly'):period==='annual'?t('연간','Annual'):t('크레딧 추가','Top up');
 return <div className="credit-offers">
  <div className="offer-tabs" role="group" aria-label={t('결제 방식','Billing period')}>
   {(['monthly','annual','topup'] as const).map(period=><button key={period} type="button" aria-pressed={selected.period===period}
    onClick={()=>{const rows=checkoutOffers.filter(o=>o.period===period);change((rows.find(o=>o.credits===selected.credits)??rows[0]).id);}}>{label(period)}</button>)}
  </div>
  <fieldset className="offer-grid checkout-packs"><legend>{label(selected.period)}</legend>
   {checkoutOffers.filter(o=>o.period===selected.period).map(o=><label key={o.id} className={o.id===value?'selected':''}>
    <input type="radio" name="credit-pack" value={o.id} checked={o.id===value} onChange={()=>change(o.id)}/>
    <span><strong>{o.period==='topup'?t(o.credits+'크레딧',o.credits+' credits'):t(o.ko,o.en)}</strong>
    {o.period!=='topup'&&<small>{t('매월 '+o.credits+'크레딧',o.credits+' credits each month')}</small>}</span>
    <span className="offer-amount"><b>{formatPrice(o.monthlyRate||o.prices.KRW,'KRW',language)}{o.period!=='topup'&&t(' / 월',' / mo')}</b>
    <small>{o.period==='annual'?t('연 '+formatPrice(o.prices.KRW,'KRW',language)+' 결제',formatPrice(o.prices.KRW,'KRW',language)+' billed yearly'):o.period==='topup'?t('1회 결제','One-time purchase'):t('월 결제','Monthly billing')}</small></span>
   </label>)}
  </fieldset>
 </div>;
}
