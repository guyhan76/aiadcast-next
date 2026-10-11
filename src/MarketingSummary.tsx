import type {MarketingPlan} from './marketing-plan';
import {channelInfo} from './publishing';
import {useUiLanguage} from './ui-language';
import './marketing-summary.css';

export function MarketingSummary({plan,saved=false}:{plan:MarketingPlan;saved?:boolean}){
 const {t,language}=useUiLanguage();
 return <section className="marketing-summary" aria-label={t('광고 제작 의도와 활용 정보','Creative intent and publishing suggestions')}>
  <div className="marketing-summary-title"><h3>{t('이 광고의 제작 의도','The intent behind this ad')}</h3><small>{saved?t('생성 당시 기획','Generation snapshot'):t('현재 입력 기준 기획','Plan from current details')}</small></div>
  <p>{plan.intent}</p>
  <p><b>{t('타깃 고객','Audience')}</b> {plan.target.label}</p>
  <details><summary>{t('추천 근거 보기','Why this audience?')}</summary><p>{plan.target.reason}</p><p>{t('입력 정보에 따른 규칙 기반 제안입니다. 생성 이미지의 상품 일치·실측 정확도 또는 광고 성과를 검증한 결과는 아닙니다.','These rule-based suggestions use supplied details. They do not verify image fidelity, measurement accuracy or advertising performance.')}</p></details>
  <h4>{t('추천 채널','Suggested channels')}</h4>
  <ul className="marketing-channels">{plan.channels.map(id=><li key={id}>{channelInfo(id,language).name}</li>)}</ul>
  <h4>{t(`검색어 ${plan.keywordCount}개`,`${plan.keywordCount} search phrases`)}</h4>
  <ul className="marketing-keywords">{plan.keywords.map(word=><li key={word}>{word}</li>)}</ul>
 </section>;
}
