import {useState} from 'react';
import {ArrowLeft,Maximize2} from 'lucide-react';
import {CampaignArtwork,useShowcaseCampaigns} from './HomeShowcase';
import {ImageReview} from './ImageReview';
import {portfolioEntries,portfolioIndustries} from './portfolio-catalog';
import {useUiLanguage} from './ui-language';
import './portfolio.css';

export function PortfolioPage(){
 const {t}=useUiLanguage(),campaigns=useShowcaseCampaigns();
 const [industry,setIndustry]=useState('all'),[source,setSource]=useState('all'),[orientation,setOrientation]=useState('all'),[selected,setSelected]=useState<string|null>(null);
 const visible=portfolioEntries.filter(e=>(industry==='all'||industry===e.industry)&&(source==='all'||source===e.source)&&(orientation==='all'||orientation===e.orientation));
 const conceptCount=portfolioEntries.filter(e=>e.source==='concept').length,actualCount=portfolioEntries.length-conceptCount;
 const shape=(value:string)=>value==='square'?t('정사각형','Square'):value==='landscape'?t('가로형','Landscape'):t('세로형','Portrait');
 const chosen=portfolioEntries.find(e=>e.id===selected),art=campaigns.find(c=>c.key===chosen?.campaignKey);
 function reset(){setIndustry('all');setSource('all');setOrientation('all');}
 return <section className="portfolio-page">
  <a className="page-back" href="#home"><ArrowLeft size={18}/>{t('홈으로','Back to home')}</a>
  <h1>{t('산업별 포트폴리오','Portfolio by industry')}</h1>
  <p>{t('내 업종에 맞는 광고의 구성과 스타일을 살펴보세요.','Explore advertising compositions and styles for your industry.')}</p>
  <p className="portfolio-source-note">{t(`디자인 콘셉트 ${conceptCount}개 · 실제 앱 생성 ${actualCount}개`,`Design concepts: ${conceptCount} · App-generated: ${actualCount}`)}{actualCount===0&&<> · {t('검수된 실제 앱 생성 사례는 아직 없습니다.','No verified app-generated examples are available yet.')}</>}</p>
  <div className="portfolio-filters">
   <label>{t('업종','Industry')}<select aria-label={t('업종','Industry')} value={industry} onChange={e=>setIndustry(e.target.value)}><option value="all">{t('전체 업종','All industries')}</option>{portfolioIndustries.map(([id,ko,en])=><option key={id} value={id}>{t(ko,en)}</option>)}</select></label>
   <label>{t('사례 출처','Example source')}<select aria-label={t('사례 출처','Example source')} value={source} onChange={e=>setSource(e.target.value)}><option value="all">{t('전체 출처','All sources')}</option><option value="app-result">{t('실제 앱 생성','App-generated')}</option><option value="concept">{t('디자인 콘셉트','Design concept')}</option></select></label>
   <label>{t('이미지 형태','Image shape')}<select aria-label={t('이미지 형태','Image shape')} value={orientation} onChange={e=>setOrientation(e.target.value)}><option value="all">{t('전체 형태','All shapes')}</option><option value="square">{t('정사각형','Square')}</option><option value="portrait">{t('세로형','Portrait')}</option><option value="landscape">{t('가로형','Landscape')}</option></select></label>
  </div>
  <p role="status">{t(`${visible.length}개 사례`,`${visible.length} examples`)}</p>
  {visible.length===0?<div className="portfolio-empty"><h2>{t('조건에 맞는 공개 사례가 아직 없습니다','No published examples match yet')}</h2><p>{t('검수한 원본을 확보하면 추가하겠습니다. 다른 업종이나 출처를 살펴보세요.','Reviewed originals will be added when available. Explore another industry or source.')}</p><button onClick={reset}>{t('전체 사례 보기','Show all examples')}</button></div>:<div className="portfolio-grid">{visible.map(entry=>{
   const campaign=campaigns.find(c=>c.key===entry.campaignKey)!;const category=portfolioIndustries.find(([id])=>id===entry.industry)!;
   return <article className="portfolio-card" key={entry.id} data-portfolio-id={entry.id}>
    <div className="portfolio-artwork"><CampaignArtwork campaign={campaign} overlayCopy={entry.source==='concept'}/><button className="portfolio-enlarge" onClick={()=>setSelected(entry.id)} aria-label={t(`${campaign.label} 이미지 전체 보기`,`View full ${campaign.label} image`)}><Maximize2 size={18}/></button></div>
    <div className="portfolio-card-info"><h2>{campaign.label}</h2><p>{t(category[1],category[2])} · {t(entry.style[0],entry.style[1])}</p><p>{entry.ratio} · {shape(entry.orientation)}</p><strong>{entry.source==='concept'?t('디자인 콘셉트','Design concept'):t('실제 앱 생성','App-generated')}</strong>{['medical','insurance'].includes(entry.industry)&&<p>{t('가상 서비스 예시 · 실제 효능이나 보장 내용이 아닙니다.','Fictional service example, not actual efficacy or coverage.')}</p>}</div>
   </article>;
  })}</div>}
  {art&&chosen&&<ImageReview label={t(`${art.label} 이미지 전체 보기`,`View full ${art.label} image`)} onClose={()=>setSelected(null)}><p className="portfolio-review-note">{chosen.source==='concept'?t('디자인 콘셉트 · 실제 앱 생성 사례 아님','Design concept · Not an app-generated example'):t('실제 앱 생성','App-generated')} · {chosen.ratio}</p><CampaignArtwork campaign={art} overlayCopy={chosen.source==='concept'}/></ImageReview>}
 </section>;
}
