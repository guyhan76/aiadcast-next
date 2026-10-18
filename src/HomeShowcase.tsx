import {useEffect,useId,useRef,useState} from 'react';
import lookbook from './assets/lookbook-campaigns.json';
import provenance from './assets/showcase-provenance.json';
import {ChevronLeft,ChevronRight,Maximize2,Pause,Play} from 'lucide-react';
import {imageFormats} from './formats';
import {useUiLanguage} from './ui-language';
import {ImageReview} from './ImageReview';

const files=import.meta.glob('./assets/showcase-*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
export function useShowcaseCampaigns(){
 const {t}=useUiLanguage();
 return lookbook.map(item=>({...item,image:files[`./assets/showcase-${item.key}.webp`],dimensions:provenance.files.find(file=>file.path===`showcase-${item.key}.webp`)!,label:t(item.label[0],item.label[1]),title:t(item.title[0].join('\n'),item.title[1].join('\n')).split('\n'),detail:t(item.detail[0],item.detail[1]),alt:t(item.alt[0],item.alt[1])}));
}
export function CampaignArtwork({campaign,priority=false,overlayCopy=true}:{campaign:ReturnType<typeof useShowcaseCampaigns>[number];priority?:boolean;overlayCopy?:boolean}){
 return <figure className={`generated-home-ad editorial-cover campaign-${campaign.key}`} data-campaign={campaign.key}>
  <img src={campaign.image} width={campaign.dimensions.width} height={campaign.dimensions.height} fetchPriority={priority?'high':'auto'} alt={campaign.alt}/>
  {overlayCopy&&<figcaption><div className="cover-headline"><span className="cover-category">{campaign.label}</span><h2>{campaign.title.map((line,i)=><span key={i}>{line}</span>)}</h2><p className="cover-detail">{campaign.detail}</p></div></figcaption>}
 </figure>;
}
// Photos are generated with imagegen; exact bilingual typography is editable DOM.
export function HomeShowcase({enabled=true}:{enabled?:boolean}){
 const {t}=useUiLanguage(),campaigns=useShowcaseCampaigns().slice(0,10);
 const [active,setActive]=useState(0),[enlarged,setEnlarged]=useState(false),id=useId(),touch=useRef<{x:number;y:number}|null>(null);
 const root=useRef<HTMLElement>(null);
 const [playing,setPlaying]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [inView,setInView]=useState(false),[hovered,setHovered]=useState(false),[touching,setTouching]=useState(false),[visible,setVisible]=useState(!document.hidden);
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:0});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{const changed=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const changed=()=>{if(media.matches)setPlaying(false);};media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
 const rotating=enabled&&playing&&inView&&visible&&!hovered&&!touching&&!enlarged;
 useEffect(()=>{if(!rotating)return;const timer=window.setTimeout(()=>setActive(index=>(index+1)%campaigns.length),5000);return()=>window.clearTimeout(timer);},[rotating,active,campaigns.length]);
 const campaign=campaigns[active],nextImage=campaigns[(active+1)%campaigns.length].image;
 useEffect(()=>{const image=new Image();image.src=nextImage;},[nextImage]);
 function select(index:number,focus=false){const next=(index+campaigns.length)%campaigns.length;setPlaying(false);setActive(next);if(focus)document.getElementById(`${id}-tab-${next}`)?.focus();}
 const artwork=()=> <CampaignArtwork campaign={campaign} priority={active===0}/>;
 return <section ref={root} className="home-showcase" onPointerEnter={e=>{if(e.pointerType==='mouse')setHovered(true);}} onPointerLeave={()=>setHovered(false)} onFocusCapture={e=>{if(!(e.target as HTMLElement).closest('.campaign-rotation'))setPlaying(false);}} aria-label={t('AI 콘셉트 광고 예시','AI concept ad examples')}>
  <div className="showcase-heading"><strong>{t('프리미엄 광고 예시','Premium ad examples')}</strong><span>{t('콘셉트 예시','Concept examples')}</span></div>
  <p className="showcase-provenance">{t('현재 이미지는 별도 제작한 콘셉트 예시입니다. 실제 앱 생성 사례는 준비 중입니다.','These are separately produced concepts. Verified app-generated examples are being prepared.')}</p>
  <div className="campaign-tabs" role="tablist" aria-label={t('광고 예시 분야','Ad example category')}>
   {(['product','service'] as const).map(kind=><div className="campaign-category-group" key={kind}><span className="campaign-group-label" aria-hidden="true">{kind==='product'?t('상품','Products'):t('서비스','Services')}</span><div>{campaigns.map((item,index)=>item.kind===kind&&<button type="button" key={item.key} id={`${id}-tab-${index}`} role="tab" aria-selected={active===index} aria-controls={`${id}-panel`} tabIndex={active===index?0:-1} onClick={()=>select(index)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(active+(e.key==='ArrowRight'?1:-1),true);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();select(e.key==='Home'?0:campaigns.length-1,true);}}}>{item.label}</button>)}</div></div>)}
  </div>
  <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} tabIndex={0} onTouchStart={e=>{setTouching(true);if(e.touches.length===1)touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};else touch.current=null;}} onTouchCancel={()=>{setTouching(false);touch.current=null;}} onTouchEnd={e=>{setTouching(false);const start=touch.current;touch.current=null;const end=e.changedTouches[0];if(!start||!end)return;const dx=end.clientX-start.x,dy=end.clientY;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy-start.y)*1.5)select(active+(dx<0?1:-1));}}>
   <div className="campaign-preview">{artwork()}<button className="campaign-enlarge" type="button" aria-label={t(`${campaign.label} 광고 확대 보기`,`Enlarge ${campaign.label} advertisement`)} onClick={()=>{setPlaying(false);setEnlarged(true);}}><span className="campaign-expand-icon"><Maximize2 size={18}/></span></button></div>
  </div>
  <div className="campaign-paging"><div className="campaign-navigation"><button type="button" aria-label={t('이전 광고','Previous ad')} onClick={()=>select(active-1)}><ChevronLeft size={20}/></button><span aria-live={rotating?'off':'polite'}>{campaign.label} · {active+1} / {campaigns.length}</span><button type="button" aria-label={t('다음 광고','Next ad')} onClick={()=>select(active+1)}><ChevronRight size={20}/></button></div><button type="button" className="campaign-rotation" aria-label={playing?t('자동 넘김 일시정지','Pause automatic slideshow'):t('자동 넘김 시작','Start automatic slideshow')} onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={14}/>:<Play size={14}/>} {playing?t('자동 · 5초','Auto · 5 sec'):t('자동 넘김','Slideshow')}</button></div>
  <div className="showcase-uses"><h3>{t('다양한 매체에 활용하세요','Create for every channel')}</h3><ul className="showcase-channels">{[t('인스타그램','Instagram'),t('유튜브','YouTube'),t('홈페이지','Website'),t('블로그','Blog'),t('포스터','Poster'),t('홍보브로셔','Promotional brochure')].map(channel=><li key={channel}>{channel}</li>)}</ul><div className="showcase-ratios"><span>{t('이미지 비율','Image ratios')}</span><ul>{imageFormats.map(format=><li key={format.id}>{format.id}</li>)}</ul></div></div>
  <a className="portfolio-entry" href="#portfolio">{t('전체 포트폴리오 보기','View all portfolios')}</a>
  {enlarged&&<ImageReview label={t(`${campaign.label} 광고`,`Advertisement · ${campaign.label}`)} onClose={()=>setEnlarged(false)}>{artwork()}</ImageReview>}
 </section>;
}

