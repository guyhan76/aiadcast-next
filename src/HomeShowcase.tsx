import {useEffect,useId,useRef,useState} from 'react';
import lookbook from './assets/lookbook-campaigns.json';
import travelImage from './assets/premium-travel-generated.png';
import hotelImage from './assets/premium-hotel-generated.png';
import jewelryImage from './assets/premium-jewelry-generated.png';
import luxuryImage from './assets/premium-luxury-generated.png';
import fashionImage from './assets/premium-fashion-generated.png';
import {MessageSquareText,RotateCcw,Pause,Play} from 'lucide-react';
import premiumBeauty from './assets/premium-beauty-generated.png';
import {useUiLanguage} from './ui-language';

// Newly AI-generated homepage artwork; provenance is recorded separately from app API results.
export function HomeShowcase({enabled=true}:{enabled?:boolean}){
 const {t}=useUiLanguage();
 const [active,setActive]=useState(0),id=useId(),touch=useRef<{x:number;y:number}|null>(null);
 const root=useRef<HTMLElement>(null);
 const [playing,setPlaying]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [inView,setInView]=useState(false),[hovered,setHovered]=useState(false),[touching,setTouching]=useState(false),[visible,setVisible]=useState(!document.hidden);
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:0});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{const changed=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const changed=()=>{if(media.matches)setPlaying(false);};media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
 const rotating=enabled&&playing&&inView&&visible&&!hovered&&!touching;
 useEffect(()=>{if(!rotating)return;const timer=window.setTimeout(()=>setActive(index=>(index+1)%lookbook.length),3000);return()=>window.clearTimeout(timer);},[rotating,active]);
 const images:Record<string,string>={beauty:premiumBeauty,luxury:luxuryImage,jewelry:jewelryImage,fashion:fashionImage,travel:travelImage,hotel:hotelImage};
 const campaigns=lookbook.map(item=>({...item,image:images[item.key],label:t(item.label[0],item.label[1]),title:[t(item.title[0][0],item.title[1][0]),t(item.title[0][1],item.title[1][1])],detail:t(item.detail[0],item.detail[1]),alt:t(item.alt[0],item.alt[1])}));
 const campaign=campaigns[active],nextImage=campaigns[(active+1)%campaigns.length].image;
 useEffect(()=>{const image=new Image();image.src=nextImage;},[nextImage]);
 function select(index:number,focus=false){const next=(index+campaigns.length)%campaigns.length;setPlaying(false);setActive(next);if(focus)document.getElementById(`${id}-tab-${next}`)?.focus();}

 return <section ref={root} className="home-showcase" onPointerEnter={e=>{if(e.pointerType==='mouse')setHovered(true);}} onPointerLeave={()=>setHovered(false)} onFocusCapture={e=>{if(!(e.target as HTMLElement).closest('.campaign-rotation'))setPlaying(false);}} aria-label={t('AI로 제작한 프리미엄 광고 예시','AI-generated premium ad example')}>
  <div className="showcase-heading"><strong>{t('프리미엄 광고 예시','Premium ad examples')}</strong><span>{t('AI 제작','AI-generated')}</span></div>
  <div className="campaign-tabs" role="tablist" aria-label={t('광고 예시 분야','Ad example category')}>{campaigns.map((item,index)=><button key={item.label} id={`${id}-tab-${index}`} role="tab" aria-selected={active===index} aria-controls={`${id}-panel`} tabIndex={active===index?0:-1} onClick={()=>select(index)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(active+(e.key==='ArrowRight'?1:-1),true);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();select(e.key==='Home'?0:campaigns.length-1,true);}}}>{item.label}</button>)}</div>
  <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} tabIndex={0} onTouchStart={e=>{setTouching(true);if(e.touches.length===1)touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};else touch.current=null;}} onTouchCancel={()=>{setTouching(false);touch.current=null;}} onTouchEnd={e=>{setTouching(false);const start=touch.current;touch.current=null;const end=e.changedTouches[0];if(!start||!end)return;const dx=end.clientX-start.x,dy=end.clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)select(active+(dx<0?1:-1));}}>
   <figure className={`generated-home-ad editorial-cover campaign-${campaign.key}`}>
    <img src={campaign.image} width={1122} height={1402} fetchPriority="high" alt={campaign.alt}/>
    <figcaption>
     <span className="cover-brand" aria-label="aiadcast"><span className="brand-lockup"><b>ai</b>adcast<i aria-hidden="true"/></span></span>
     <div className="cover-headline"><span className="cover-category">{campaign.label}</span><h2><span>{campaign.title[0]}</span><span>{campaign.title[1]}</span></h2></div>
    </figcaption>
    <div className="generated-ad-footer"><span>{campaign.detail}</span></div>
   </figure>
  </div>
  <div className="campaign-paging"><span aria-live={rotating?'off':'polite'}>{campaign.label} · {active+1} / {campaigns.length}</span><button type="button" className="campaign-rotation" aria-label={playing?t('자동 넘김 일시정지','Pause automatic slideshow'):t('자동 넘김 시작','Start automatic slideshow')} onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={13} aria-hidden="true"/>:<Play size={13} aria-hidden="true"/>}{playing?t('자동 넘김 · 3초','Auto · 3 sec'):t('자동 넘김 시작','Start slideshow')}</button></div>
  <div className="showcase-formats"><span>{t('원하는 매체 크기로 저장하세요','Save in the size for your channel')}</span><div><b>{t('인스타 피드','Feed')} <small>4:5</small></b><b>{t('스토리','Story')} <small>9:16</small></b><b>{t('블로그·홈페이지','Blog · Website')}</b></div></div>
  <div className="showcase-benefits"><p><MessageSquareText size={17} aria-hidden="true"/>{t('게시글·키워드도 함께 준비','Prepare captions & keywords')}</p><p><RotateCcw size={17} aria-hidden="true"/>{t('저장한 광고는 고쳐서 다시 사용','Edit and reuse saved ads')}</p></div>
  <small className="showcase-status">{t('메인 소개용으로 AI로 제작한 이미지입니다. 휴대폰 AI 생성은 서버 연결 준비 중입니다.','AI-generated artwork for this introduction. Mobile AI generation is awaiting server connection.')}</small>
 </section>;
}
