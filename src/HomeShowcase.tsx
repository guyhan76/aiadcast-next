import {ShowcaseDimensionInset} from './ShowcaseDimensionInset';
import './showcase-capabilities.css';
import {useEffect,useId,useRef,useState} from 'react';
import lookbook from './assets/lookbook-campaigns.json';
import {ChevronLeft,ChevronRight,Maximize2,Pause,Play} from 'lucide-react';
import {imageFormats} from './formats';
import {useUiLanguage} from './ui-language';
import {ImageReview} from './ImageReview';

const files=import.meta.glob('./assets/showcase-*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
// Photos are generated with imagegen; exact bilingual typography is editable DOM.
export function HomeShowcase({enabled=true}:{enabled?:boolean}){
 const {t}=useUiLanguage();
 const [treatment,setTreatment]=useState<'creative'|'original'|'dimensions'>('creative');
 const [active,setActive]=useState(0),[enlarged,setEnlarged]=useState(false),id=useId(),touch=useRef<{x:number;y:number}|null>(null);
 const root=useRef<HTMLElement>(null);
 const [playing,setPlaying]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [inView,setInView]=useState(false),[hovered,setHovered]=useState(false),[touching,setTouching]=useState(false),[visible,setVisible]=useState(!document.hidden);
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:0});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{const changed=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const changed=()=>{if(media.matches)setPlaying(false);};media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
 const rotating=enabled&&playing&&inView&&visible&&!hovered&&!touching&&!enlarged;
 useEffect(()=>{if(!rotating)return;const timer=window.setTimeout(()=>{setTreatment('creative');setActive(index=>(index+1)%lookbook.length);},5000);return()=>window.clearTimeout(timer);},[rotating,active]);
 const campaigns=lookbook.map(item=>({...item,image:files[`./assets/showcase-${item.key}.webp`],label:t(item.label[0],item.label[1]),title:t(item.title[0].join('\n'),item.title[1].join('\n')).split('\n'),detail:t(item.detail[0],item.detail[1]),alt:t(item.alt[0],item.alt[1])}));
 const campaign=campaigns[active],nextImage=campaigns[(active+1)%campaigns.length].image;
 useEffect(()=>{const image=new Image();image.src=nextImage;},[nextImage]);
 function select(index:number,focus=false){const next=(index+campaigns.length)%campaigns.length;setPlaying(false);setTreatment('creative');setActive(next);if(focus)document.getElementById(`${id}-tab-${next}`)?.focus();}
 const artwork=()=> <figure className={`generated-home-ad editorial-cover campaign-${campaign.key} showcase-treatment-${treatment}`} data-treatment={treatment} data-campaign={campaign.key}>
  <img src={campaign.image} width={1080} height={1920} fetchPriority={active===0?'high':'auto'} alt={campaign.alt}/>
  {treatment==='dimensions'&&<ShowcaseDimensionInset image={campaign.image}/>}<figcaption><div className="cover-headline"><span className="cover-category">{campaign.label}</span><h2>{campaign.title.map((line,i)=><span key={i}>{line}</span>)}</h2><p className="cover-detail">{campaign.detail}</p></div><span className="showcase-art-label">{treatment==='original'?t('샘플 사진 그대로 · 레이아웃 합성','Sample photo preserved · composed layout'):treatment==='dimensions'?t('사진 규격 구성 시연 · 자동 분석 아님','Photo dimension illustration · not automatic analysis'):t('AI 제작 콘셉트 · 예시 광고','AI-created concept · sample ad')}</span></figcaption>
 </figure>;
 return <section ref={root} className="home-showcase" onPointerEnter={e=>{if(e.pointerType==='mouse')setHovered(true);}} onPointerLeave={()=>setHovered(false)} onFocusCapture={e=>{if(!(e.target as HTMLElement).closest('.campaign-rotation'))setPlaying(false);}} aria-label={t('프리미엄 광고 구성 예시','Premium advertising composition examples')}>
  <div className="showcase-heading"><strong>{t('프리미엄 광고 예시','Premium ad examples')}</strong><span>{t('구성 시연','Illustrative demos')}</span></div>
  <div className="campaign-tabs" role="tablist" aria-label={t('광고 예시 분야','Ad example category')}>
   {(['product','service'] as const).map(kind=><div className="campaign-category-group" key={kind}><span className="campaign-group-label" aria-hidden="true">{kind==='product'?t('상품','Products'):t('서비스','Services')}</span><div>{campaigns.map((item,index)=>item.kind===kind&&<button type="button" key={item.key} id={`${id}-tab-${index}`} role="tab" aria-selected={active===index} aria-controls={`${id}-panel`} tabIndex={active===index?0:-1} onClick={()=>select(index)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(active+(e.key==='ArrowRight'?1:-1),true);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();select(e.key==='Home'?0:campaigns.length-1,true);}}}>{item.label}</button>)}</div></div>)}
  </div>
  <div className="showcase-treatments" role="group" aria-label={t('사진 활용 예시 선택','Choose a photo treatment example')}>
   <button type="button" aria-pressed={treatment==='creative'} onClick={()=>{setPlaying(false);setTreatment('creative');}}>{t('AI 연출','AI art direction')}</button>
   <button type="button" aria-pressed={treatment==='original'} onClick={()=>{setPlaying(false);setTreatment('original');}}>{t('원본 사진 활용','Original photo layout')}</button>
   <button type="button" aria-pressed={treatment==='dimensions'} onClick={()=>{select(campaigns.findIndex(c=>c.key==='luxury'));setTreatment('dimensions');}}>{t('사진 규격 예시','Photo dimensions')}</button>
  </div>
  <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} tabIndex={0} onTouchStart={e=>{setTouching(true);if(e.touches.length===1)touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};else touch.current=null;}} onTouchCancel={()=>{setTouching(false);touch.current=null;}} onTouchEnd={e=>{setTouching(false);const start=touch.current;touch.current=null;const end=e.changedTouches[0];if(!start||!end)return;const dx=end.clientX-start.x,dy=end.clientY;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy-start.y)*1.5)select(active+(dx<0?1:-1));}}>
   <div className="campaign-preview">{artwork()}<button className="campaign-enlarge" type="button" aria-label={t(`${campaign.label} 광고 확대 보기`,`Enlarge ${campaign.label} advertisement`)} onClick={()=>{setPlaying(false);setEnlarged(true);}}><span className="campaign-expand-icon"><Maximize2 size={18}/></span></button></div>
  </div>
  <div className="campaign-paging"><div className="campaign-navigation"><button type="button" aria-label={t('이전 광고','Previous ad')} onClick={()=>select(active-1)}><ChevronLeft size={20}/></button><span aria-live={rotating?'off':'polite'}>{campaign.label} · {active+1} / {campaigns.length}</span><button type="button" aria-label={t('다음 광고','Next ad')} onClick={()=>select(active+1)}><ChevronRight size={20}/></button></div><button type="button" className="campaign-rotation" aria-label={playing?t('자동 넘김 일시정지','Pause automatic slideshow'):t('자동 넘김 시작','Start automatic slideshow')} onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={14}/>:<Play size={14}/>} {playing?t('자동 · 5초','Auto · 5 sec'):t('자동 넘김','Slideshow')}</button></div>
  <p className="showcase-demo-note">{t('AI 제작 샘플로 직접 구성한 예시입니다. 고객 실적·자동 분석 결과가 아닙니다.','Manually composed with AI-created samples. Not customer results or automatic analysis.')}</p>
  <div className="showcase-media-examples" aria-label={t('매체별 배치 예시','Example media layouts')}>
   {(['story','square','wide'] as const).map((ratio,index)=><div className={'showcase-media-example '+ratio} key={ratio}><div className="media-sample-art"><span>{campaign.label}<b>{campaign.title[0]}</b></span><img src={campaign.image} alt={t(`${campaign.label} ${['9:16','1:1','16:9'][index]} 배치 시연`,`${campaign.label} ${['9:16','1:1','16:9'][index]} illustrative layout`)}/></div><small>{[t('스토리 · 9:16','Story · 9:16'),t('피드 · 1:1','Feed · 1:1'),t('유튜브 · 16:9','YouTube · 16:9')][index]}</small></div>)}
  </div>
  <div className="showcase-uses"><h3>{t('다양한 매체에 활용하세요','Create for every channel')}</h3><ul className="showcase-channels">{[t('인스타그램','Instagram'),t('유튜브','YouTube'),t('홈페이지','Website'),t('상세페이지','Product detail page'),t('블로그','Blog'),t('포스터','Poster')].map(channel=><li key={channel}>{channel}</li>)}</ul><div className="showcase-ratios"><span>{t('이미지 비율','Image ratios')}</span><ul>{imageFormats.map(format=><li key={format.id}>{format.id}</li>)}</ul></div></div>
  {enlarged&&<ImageReview label={t(`${campaign.label} 광고`,`Advertisement · ${campaign.label}`)} onClose={()=>setEnlarged(false)}>{artwork()}</ImageReview>}
 </section>;
}

