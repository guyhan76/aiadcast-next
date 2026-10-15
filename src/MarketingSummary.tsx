import type {MarketingPlan} from './marketing-plan';
import {parseMarketingPlan} from './marketing-plan';
import {channelInfo} from './publishing';
import {useUiLanguage} from './ui-language';
import './marketing-summary.css';

export function MarketingSummary({plan:storedPlan,saved=false}:{plan:MarketingPlan;saved?:boolean}){
 const {t,language}=useUiLanguage();
 // Refresh derived recommendations from the saved input; no image request or credit is needed.
 let plan:MarketingPlan|undefined;
 try{plan=parseMarketingPlan(storedPlan);}catch{return null;}
 if(!plan)return null;
 return <section className="marketing-summary" aria-label={t('광고 제작 의도와 활용 정보','Creative intent and publishing suggestions')}>
  <div className="marketing-summary-title"><h3>{t('이 광고의 제작 의도','The intent behind this ad')}</h3><small>{saved?t('저장된 광고 정보 기준','Based on saved ad details'):t('현재 입력 기준 기획','Plan from current details')}</small></div>
  <p>{plan.intent}</p>
  <p><b>{t('타깃 고객','Audience')}</b> {plan.target.label}</p>
  <details><summary>{t('추천 근거 보기','Why this audience?')}</summary><p>{plan.target.reason}</p><p>{t('입력 정보에 따른 규칙 기반 제안입니다. 생성 이미지의 상품 일치·실측 정확도 또는 광고 성과를 검증한 결과는 아닙니다.','These rule-based suggestions use supplied details. They do not verify image fidelity, measurement accuracy or advertising performance.')}</p></details>
  <h4>{t('추천 채널','Suggested channels')}</h4>
  <ul className="marketing-channels">{plan.channels.map(id=><li key={id}>{channelInfo(id,language).name}</li>)}</ul>
  <p className="marketing-channel-help">{t('릴스·쇼츠에는 이미지를 영상으로 변환해 활용하세요. 기업 홍보물에는 이미지 소재로 넣을 수 있습니다.','Convert the image to video for Reels or Shorts. It can also be placed in company promotional materials.')}</p>
  <h4>{t('추천 SEO 검색어','Recommended SEO keywords')}</h4>
  <ul className="marketing-keywords">{plan.keywords.map(word=><li key={word}>{word}</li>)}</ul>
  <p className="marketing-keyword-help">{t('상품명·관련 품목·용도를 기준으로 추천합니다. 제목과 본문에 자연스럽게 활용하세요.','Suggestions use the product name, related product types and uses. Include relevant phrases naturally in titles and body text.')}</p>
 </section>;
}
