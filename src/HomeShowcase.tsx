import {useId,useRef,useState} from 'react';
import luxuryImage from './assets/premium-luxury-generated.png';
import fashionImage from './assets/premium-fashion-generated.png';
import {MessageSquareText,RotateCcw} from 'lucide-react';
import premiumBeauty from './assets/premium-beauty-generated.png';
import {useUiLanguage} from './ui-language';

// Newly AI-generated homepage artwork; provenance is recorded separately from app API results.
export function HomeShowcase(){
 const {t}=useUiLanguage();
 const [active,setActive]=useState(0),id=useId(),touch=useRef<{x:number;y:number}|null>(null);
 const campaigns=[
  {label:t('럭셔리','Luxury'),image:luxuryImage,dark:true,title:[t('시선을 사로잡는,','Made to capture'),t('단 하나의 존재감.','every glance.')],detail:t('가죽의 질감 · 빛의 깊이 · 절제된 고급스러움','Leather texture · Sculpted light · Quiet luxury'),alt:t('대리석과 실크 위의 버건디 가죽 가방을 AI로 제작한 럭셔리 광고','AI-generated burgundy leather handbag on marble and silk')},
  {label:t('뷰티','Beauty'),image:premiumBeauty,dark:false,title:[t('첫인상부터,','From the first glance,'),t('브랜드답게.','distinctly yours.')],detail:t('향수 · 화장품 · 프리미엄 패키지','Perfume · Cosmetics · Premium packaging'),alt:t('자연광 속 향수와 화장품 패키지를 AI로 제작한 뷰티 광고','AI-generated perfume and cosmetic packaging in natural light')},
  {label:t('패션','Fashion'),image:fashionImage,dark:false,title:[t('입는 순간,','The moment you wear it,'),t('분위기가 되다.','make it your own.')],detail:t('의류 · 스타일링 · 브랜드 컬렉션','Apparel · Styling · Brand collections'),alt:t('석재 건축 공간에서 크림 재킷과 검정 드레스를 입은 성인 모델의 AI 생성 패션 광고','AI-generated adult model wearing a cream blazer and black dress in a stone courtyard')},
 ];
 const campaign=campaigns[active];
 function select(index:number,focus=false){const next=(index+campaigns.length)%campaigns.length;setActive(next);if(focus)document.getElementById(`${id}-tab-${next}`)?.focus();}

 return <section className="home-showcase" aria-label={t('AI로 제작한 프리미엄 광고 예시','AI-generated premium ad example')}>
  <div className="showcase-heading"><strong>{t('내 브랜드를 보여주는 한 장','A frame for your brand.')}</strong><span>{t('AI 생성 예시','AI-generated example')}</span></div>
  <div className="campaign-tabs" role="tablist" aria-label={t('광고 예시 분야','Ad example category')}>{campaigns.map((item,index)=><button key={item.label} id={`${id}-tab-${index}`} role="tab" aria-selected={active===index} aria-controls={`${id}-panel`} tabIndex={active===index?0:-1} onClick={()=>select(index)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(active+(e.key==='ArrowRight'?1:-1),true);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();select(e.key==='Home'?0:2,true);}}}>{item.label}</button>)}</div>
  <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} tabIndex={0} onTouchStart={e=>{if(e.touches.length===1)touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};else touch.current=null;}} onTouchCancel={()=>{touch.current=null;}} onTouchEnd={e=>{const start=touch.current;touch.current=null;const end=e.changedTouches[0];if(!start||!end)return;const dx=end.clientX-start.x,dy=end.clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)select(active+(dx<0?1:-1));}}>
   <figure className={`generated-home-ad${campaign.dark?' campaign-dark':''}`}>
    <img src={campaign.image} width={1122} height={1402} fetchPriority="high" alt={campaign.alt}/>
    <figcaption><span>aiadcast</span><h2>{campaign.title[0]}<br/>{campaign.title[1]}</h2></figcaption>
    <div className="generated-ad-footer">{campaign.detail}</div>
   </figure>
  </div>
  <div className="campaign-paging"><span aria-live="polite">0{active+1} / 03 · {campaign.label}</span><span>{t('옆으로 넘겨보세요','Swipe to explore')} →</span></div>
  <div className="showcase-formats"><span>{t('필요한 곳에 맞춰 저장','Save for your channels')}</span><div><b>{t('인스타 피드','Feed')} <small>4:5</small></b><b>{t('스토리','Story')} <small>9:16</small></b><b>{t('블로그·홈페이지','Blog · Website')}</b></div></div>
  <div className="showcase-benefits"><p><MessageSquareText size={17} aria-hidden="true"/>{t('게시글·키워드도 함께 준비','Prepare captions & keywords')}</p><p><RotateCcw size={17} aria-hidden="true"/>{t('저장한 광고는 고쳐서 다시 사용','Edit and reuse saved ads')}</p></div>
  <small className="showcase-status">{t('메인 소개용으로 AI로 제작한 이미지입니다. 휴대폰 AI 생성은 서버 연결 준비 중입니다.','AI-generated artwork for this introduction. Mobile AI generation is awaiting server connection.')}</small>
 </section>;
}
