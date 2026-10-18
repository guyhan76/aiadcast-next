import type {MarketingPlan} from './marketing-plan';
import {parseMarketingPlan} from './marketing-plan';
import {useUiLanguage} from './ui-language';
import './marketing-summary.css';

export function MarketingSummary({plan:storedPlan,saved=false}:{plan:MarketingPlan;saved?:boolean}){
 const {t}=useUiLanguage();
 // Refresh derived recommendations from the saved input; no image request or credit is needed.
 let plan:MarketingPlan|undefined;
 try{plan=parseMarketingPlan(storedPlan);}catch{return null;}
 if(!plan)return null;
 // Presentation only: retain the complete plan and generation input unchanged.
 const ko=plan.input.locale==='ko',name=plan.input.name||(ko?'상품·서비스':'Your offer');
 const purpose=plan.input.goal==='inquiry'?(ko?'문의·상담에 필요한 정보를 전하는':'presenting the information needed for an inquiry'):plan.input.goal==='launch'?(ko?'새로운 상품·서비스를 소개하는':'introducing a new offer'):(ko?'상품·브랜드의 특징을 알리는':'highlighting product and brand details');
 const intent=ko?`${name}: ${purpose} 광고입니다.`:`${name}: an ad ${purpose}.`;
 // The rules append physical dimensions after this separator; keep those in evidence.
 const audience=plan.target.segment==='spec-fit'?plan.target.label.split(' — ')[0]:plan.target.label;
 return <section className="marketing-summary" aria-label={t('광고 제작 의도와 활용 정보','Creative intent and publishing suggestions')}>
  <div className="marketing-summary-title"><h3>{t('이 광고의 제작 의도','The intent behind this ad')}</h3><small>{saved?t('저장된 광고 정보 기준','Based on saved ad details'):t('현재 입력 기준 기획','Plan from current details')}</small></div>
  <p className="marketing-intent">{intent}</p>
  <div className="marketing-section marketing-audience"><h4>{t('타깃 고객','Audience')}</h4><p>{audience}</p></div>
  <div className="marketing-section"><h4>{t('추천 채널','Suggested channels')}</h4>
   <ul className="marketing-channels">{[t('인스타그램','Instagram'),t('유튜브','YouTube'),t('홈페이지','Website'),t('블로그','Blog'),t('포스터','Poster'),t('광고브로셔','Advertising brochure')].map(name=><li key={name}>{name}</li>)}</ul>
   <p className="marketing-help">{t('릴스·쇼츠에 쓰려면 이미지를 영상으로 변환하세요.','Convert the image to video for Reels or Shorts.')}</p>
  </div>
  <div className="marketing-section"><h4>{t('추천 SEO 검색어','Recommended SEO keywords')}</h4>
   <ul className="marketing-keywords">{plan.keywords.map(word=><li key={word}>{word}</li>)}</ul>
   <p className="marketing-help">{t('관련 검색어를 제목과 본문에 자연스럽게 활용하세요.','Use relevant phrases naturally in titles and body text.')}</p>
  </div>
  <details className="marketing-evidence"><summary>{t('추천 근거와 상세 기획','Recommendation basis and full brief')}</summary>
   <h4>{t('상세 제작 의도','Full creative intent')}</h4><p>{plan.intent}</p>
   <h4>{t('타깃 추천 근거','Audience rationale')}</h4><p>{plan.target.reason}</p>
   <p>{t('입력 정보에 따른 규칙 기반 제안입니다. 상품 일치·실측 정확도·광고 성과나 실제 검색량을 검증한 결과는 아닙니다.','These rule-based suggestions use supplied details. They do not verify product fidelity, measurement accuracy, ad performance or actual search volume.')}</p>
  </details>
 </section>;
}
