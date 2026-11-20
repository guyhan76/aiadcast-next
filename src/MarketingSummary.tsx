import {marketingPresentation} from './marketing-presentation';
import type {MarketingPlan,MarketingChannel} from './marketing-plan';
import {parseMarketingPlan} from './marketing-plan';
import {useUiLanguage} from './ui-language';
import './marketing-summary.css';

export function MarketingSummary({plan:storedPlan,format}:{plan:MarketingPlan;saved?:boolean;format?:string}){
 const {t,language}=useUiLanguage();let plan:MarketingPlan|undefined;
 try{plan=parseMarketingPlan(storedPlan);}catch{return null;}
 if(!plan)return null;plan=marketingPresentation(plan,language);
 // Existing input-based rules, not a new provider call or image analysis.
 const usage:Partial<Record<MarketingChannel,[string,string]>>={
  instagram:[t('인스타그램','Instagram'),format==='9:16'?t('스토리 이미지로 사용하세요.','Use as a Story image.'):format==='1:1'||format==='4:5'?t('피드 이미지로 사용하세요.','Use as a feed image.'):t('피드 게시 전 비율과 잘림을 확인하세요.','Check cropping and ratio before posting to the feed.')],
  website:[t('홈페이지·상품 상세페이지','Website / product page'),t('상품 정보와 구매·문의 링크 옆에 배치하세요.','Place beside product details and a purchase or inquiry link.')],
  blog:[t('블로그','Blog'),t('상품·서비스 설명 글에 넣고 실제 특징을 함께 설명하세요.','Include in a product or service article with factual details.')],
  lookbook:[t('룩북·상품 소개','Lookbook / product showcase'),t('같은 상품의 다른 사진과 함께 소개하세요.','Present alongside other photos of the same product.')],
  brochure:[t('소개 자료','Sales material'),t('제안서에 활용하고 인쇄 전 해상도를 확인하세요.','Use in a proposal; check resolution before printing.')]
 };
 const channels=plan.channels.filter(c=>usage[c]).slice(0,3);
 return <details className="marketing-analysis"><summary>{t('활용 가이드','Usage guide')}</summary><section className="marketing-summary" aria-label={t('광고 활용 가이드','Ad usage guide')}>
  <div className="marketing-section"><h4>{t('추천 채널','Suggested channels')}</h4><ul className="marketing-channels">{channels.map(c=><li key={c}><strong>{usage[c]![0]}</strong><p>{usage[c]![1]}</p></li>)}</ul></div>
  {plan.keywords.length>0&&<div className="marketing-section"><h4>{t('관련 검색어 후보','Related search phrases')}</h4><ul className="marketing-keywords">{plan.keywords.map(word=><li key={word}>{word}</li>)}</ul><p>{t('제목·설명에 맞는 표현만 골라 사용하세요.','Choose only phrases that fit your title and description.')}</p></div>}
  <p>{t('입력 정보 기반 제안이며, AI 이미지 분석이나 검색량 검증 결과는 아닙니다.','Suggestions use your inputs, not AI image analysis or verified search volumes.')}</p>
 </section></details>;
}
