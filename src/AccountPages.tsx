import {useState} from 'react';
import {ArrowLeft,Check,Mail} from 'lucide-react';
import {useUiLanguage} from './ui-language';
import {formatPrice,pricingCatalog,type PricingCurrency} from './pricing';
import './account-pages.css';
// These pages are a reviewable UI. No credential or payment request is made
// until production authentication and a verified store checkout are connected.
export function EmailAccountPage({mode}:{mode:'signup'|'login'}){
 const {t}=useUiLanguage(),[email,setEmail]=useState(''),[touched,setTouched]=useState(false),signup=mode==='signup';
 const invalid=touched&&email!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
 return <section className="account-page">
  <a href="#home" className="page-back"><ArrowLeft size={18}/>{t('홈','Home')}</a>
  <h1>{signup?t('회원가입','Sign up'):t('로그인','Sign in')}</h1>
  <p className="page-intro">{t('이메일로 간편하게 시작하세요.','Start with your email.')}</p>
  <div className="connection-notice" id="email-availability">{t('이메일 인증 연결 준비 중입니다. 입력한 정보는 전송하거나 저장하지 않습니다.','Email verification is not connected yet. Your input is not sent or saved.')}</div>
  <form onSubmit={e=>e.preventDefault()}>
   <label className="field" htmlFor="account-email">{t('이메일','Email')}<input id="account-email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={email} aria-invalid={invalid||undefined} aria-describedby={invalid?'email-error':undefined} onBlur={()=>setTouched(true)} onChange={e=>setEmail(e.target.value)}/></label>
   {invalid&&<p id="email-error" role="alert">{t('이메일 주소를 확인해주세요.','Check your email address.')}</p>}
   <p className="account-help">{t('비밀번호 대신 이메일 인증으로 이용합니다.','Use email verification instead of a password.')}</p>
   <button className="primary-action" type="submit" disabled aria-describedby="email-availability"><Mail size={18}/>{t('인증메일 받기','Send verification email')}</button>
  </form>
  <p className="account-switch">{signup?t('이미 계정이 있나요?','Already have an account?'):t('처음 이용하시나요?','New here?')} <a href={signup?'#login':'#signup'}>{signup?t('로그인','Sign in'):t('회원가입','Sign up')}</a></p>
  <a className="guest-link" href="#create">{t('가입 없이 광고 편집하기','Edit an ad without signing up')}</a>
 </section>;
}
export function CheckoutPage(){
 const {language,t}=useUiLanguage(),[selected,setSelected]=useState<string>('basic'),[currency,setCurrency]=useState<PricingCurrency>('KRW');
 const pack=pricingCatalog.packs.find(p=>p.id===selected)!,names=[t('체험용','Trial'),t('기본형','Essential'),t('묶음형','Bundle')];
 return <section className="account-page checkout-page">
  <a href="#home" className="page-back"><ArrowLeft size={18}/>{t('홈','Home')}</a>
  <h1>{t('이용권 선택','Choose credits')}</h1><p className="page-intro">{t('자동 구독 없이, 필요한 만큼.','Buy what you need. No subscription.')}</p>
  <div className="connection-notice" id="checkout-availability">{t('결제 연결 준비 중입니다. 상품을 비교할 수 있으며 실제 결제는 발생하지 않습니다.','Checkout is not connected yet. Compare packs here; no payment will be made.')}</div>
  <label className="field checkout-currency">{t('표시 통화','Display currency')}<select value={currency} onChange={e=>setCurrency(e.target.value as PricingCurrency)}><option value="KRW">KRW · 원</option><option value="USD">USD · $</option></select></label>
  <fieldset className="checkout-packs"><legend>{t('광고 이용권','Ad credits')}</legend>{pricingCatalog.packs.map((item,i)=><label key={item.id} className={selected===item.id?'selected':''}><input type="radio" name="credit-pack" value={item.id} checked={selected===item.id} onChange={()=>setSelected(item.id)}/><span><strong>{names[i]} · {item.credits}{t('개',' ads')}</strong><small>{t('새 광고','New ads')} {item.credits}{t('개 제작',' creations')}</small></span><b>{formatPrice(item.prices[currency],currency,language)}</b></label>)}</fieldset>
  <ul className="checkout-benefits"><li><Check size={17}/>{t('문구 직접 수정·재다운로드는 추가 차감 없음','No extra credits for manual text edits or repeat downloads')}</li><li><Check size={17}/>{t('같은 광고는 여러 비율로 저장','Save the same ad in multiple sizes')}</li></ul>
  <section className="checkout-summary" aria-label={t('결제 확인','Order review')}><h2>{t('선택한 이용권','Selected pack')}</h2><p><span>{pack.credits}{t('개 광고',' ads')}</span><strong>{formatPrice(pack.prices[currency],currency,language)}</strong></p><p className="checkout-tax">{currency==='KRW'?t('부가세 포함','Includes Korean VAT'):t('현지 세금 별도','Local taxes not included')}</p></section>
  <button className="primary-action" disabled aria-describedby="checkout-availability">{t('결제 연결 준비 중','Checkout coming soon')}</button>
  <p className="account-help">{t('실제 구매 통화와 최종 금액은 결제 연결 후 확인할 수 있습니다.','Billing currency and the final total will be available when checkout is connected.')}</p>
 </section>;
}
