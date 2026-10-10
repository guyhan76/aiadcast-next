import {ArrowRight,ImagePlus,MessageSquareText,RotateCcw} from 'lucide-react';
import {useUiLanguage} from './ui-language';

// A layout illustration, never presented as an actual generated customer result.
export function HomeShowcase(){
 const {t}=useUiLanguage();
 return <section className="home-showcase" aria-label={t('사진에서 광고로, 활용 구성 예시','From photo to ad: layout example')}>
  <div className="showcase-heading"><strong>{t('사진과 설명이, 내 브랜드의 광고로','Your photos. Your brand’s ad.')}</strong><span>{t('구성 예시','Layout example')}</span></div>
  <div className="showcase-transformation">
   <div className="showcase-source"><div className="sample-photo"><ImagePlus size={28} aria-hidden="true"/><span>{t('내 상품 사진','Your photo')}</span></div><small>{t('+ 상품·서비스 설명','+ Your description')}</small></div>
   <ArrowRight className="showcase-arrow" size={20} aria-hidden="true"/>
   <div className="sample-ad"><span className="sample-brand">{t('우리 브랜드','YOUR BRAND')}</span><strong>{t('소중한 마음을,','A thoughtful gift,')}<br/>{t('더 특별하게.','beautifully presented.')}</strong><div className="sample-gift" aria-hidden="true"><i/><b/></div><span className="sample-contact">{t('상품명 · 핵심 장점 · 연락처','Your product · Details · Contact')}</span></div>
  </div>
  <div className="showcase-formats"><span>{t('필요한 곳에 맞춰 저장','Save for your channels')}</span><div><b>{t('인스타 피드','Feed')} <small>4:5</small></b><b>{t('스토리','Story')} <small>9:16</small></b><b>{t('블로그·홈페이지','Blog · Website')}</b></div></div>
  <div className="showcase-benefits"><p><MessageSquareText size={17} aria-hidden="true"/>{t('게시글·키워드도 함께 준비','Prepare captions & keywords')}</p><p><RotateCcw size={17} aria-hidden="true"/>{t('저장한 광고는 고쳐서 다시 사용','Edit and reuse saved ads')}</p></div>
  <small className="showcase-status">{t('활용 방식을 보여주는 예시입니다. AI 생성은 서버 연결 후 사용할 수 있습니다.','Illustration of the workflow. AI generation requires a connected server.')}</small>
 </section>;
}
