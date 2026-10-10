import {MessageSquareText,RotateCcw} from 'lucide-react';
import premiumBeauty from './assets/premium-beauty-generated.png';
import {useUiLanguage} from './ui-language';

// Newly AI-generated homepage artwork; provenance is recorded separately from app API results.
export function HomeShowcase(){
 const {t}=useUiLanguage();
 return <section className="home-showcase" aria-label={t('AI로 제작한 프리미엄 광고 예시','AI-generated premium ad example')}>
  <div className="showcase-heading"><strong>{t('내 브랜드를 보여주는 한 장','A frame for your brand.')}</strong><span>{t('AI 생성 예시','AI-generated example')}</span></div>
  <figure className="generated-home-ad">
   <img src={premiumBeauty} width={1122} height={1402} fetchPriority="high" alt={t('자연광 아래 석재 위에 놓인 아이보리 선물박스, 향수병과 세이지색 화장품 패키지를 AI로 제작한 이미지','AI-generated ivory gift box, glass perfume bottle and sage cosmetic packaging on sunlit stone')}/>
   <figcaption><span>aiadcast</span><h2>{t('첫인상부터,','From the first glance,')}<br/>{t('브랜드답게.','distinctly yours.')}</h2></figcaption>
   <div className="generated-ad-footer">{t('향수 · 화장품 · 프리미엄 패키지','Perfume · Cosmetics · Premium packaging')}</div>
  </figure>
  <div className="showcase-formats"><span>{t('필요한 곳에 맞춰 저장','Save for your channels')}</span><div><b>{t('인스타 피드','Feed')} <small>4:5</small></b><b>{t('스토리','Story')} <small>9:16</small></b><b>{t('블로그·홈페이지','Blog · Website')}</b></div></div>
  <div className="showcase-benefits"><p><MessageSquareText size={17} aria-hidden="true"/>{t('게시글·키워드도 함께 준비','Prepare captions & keywords')}</p><p><RotateCcw size={17} aria-hidden="true"/>{t('저장한 광고는 고쳐서 다시 사용','Edit and reuse saved ads')}</p></div>
  <small className="showcase-status">{t('메인 소개용으로 AI로 제작한 이미지입니다. 휴대폰 AI 생성은 서버 연결 준비 중입니다.','AI-generated artwork for this introduction. Mobile AI generation is awaiting server connection.')}</small>
 </section>;
}
