import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,Check,Copy,Send} from 'lucide-react';
import type {Project} from './model';
import type {ImageFormat} from './formats';
import {getImageFormat} from './formats';
import {channelInfo,currentDraft,hashtagText,publicationText,publishingBasis,publishingChannels,recommendedChannels,savePublishingDraft,suggestedDraft} from './publishing';
import type {PublishingChannel,PublishingDraft} from './publishing';
import {useUiLanguage} from './ui-language';
import './publishing.css';
export type PublishingImageTarget={format:ImageFormat;filename:string;label:string};
type Props={project:Project;change:(fn:(p:Project)=>Project)=>void;onExportBrief:()=>void;onExportImage:(target:PublishingImageTarget)=>Promise<string|null>;imageDisabled:boolean;direction:{target:string;intent:string}};
export function PublishingPanel({project,change,onExportBrief,onExportImage,imageDisabled,direction}:Props){
 const {t,language}=useUiLanguage();
 const [channel,setChannel]=useState<PublishingChannel>(()=>recommendedChannels(project)[0]);
 const [exportMessage,setExportMessage]=useState('');
 const [more,setMore]=useState(false),[notice,setNotice]=useState(''),[manual,setManual]=useState<string|null>(null);
 const manualField=useRef<HTMLTextAreaElement>(null),sequence=useRef(0);
 useEffect(()=>{setChannel(recommendedChannels(project)[0]);setMore(false);},[project.id]);
 useEffect(()=>{sequence.current++;setNotice('');setManual(null);setExportMessage('');},[project,channel,language]);
 useEffect(()=>{if(manual!==null){manualField.current?.focus();manualField.current?.select();}},[manual]);
 const recommended=recommendedChannels(project),info=channelInfo(channel,language),size=getImageFormat(info.format);
 const {draft,edited,stale}=currentDraft(project,channel);
 const displayed=more?publishingChannels:Array.from(new Set([...recommended,channel]));
 const contentReady=!!project.productName.trim();
 const missingContact=!project.copy[project.locale].contact.trim()&&!project.copy[project.locale].website.trim();
 function edit(patch:Partial<Pick<PublishingDraft,'title'|'body'|'keywords'>>){change(p=>savePublishingDraft(p,{...currentDraft(p,channel).draft,...patch}));}
 async function copy(value:string){
  const active=++sequence.current;
  try{await navigator.clipboard.writeText(value);if(active===sequence.current){setManual(null);setNotice(t('복사했습니다. 게시할 앱에 붙여넣으세요.','Copied. Paste it into the app where you will post.'));}}
  catch{if(active===sequence.current){setManual(value);setNotice(t('아래 글을 길게 누르거나 선택해 복사해주세요.','Select the text below and copy it manually.'));}}
 }
 async function exportImage(){
  const active=++sequence.current;
  const error=await onExportImage({format:info.format,filename:`${channel}-image`,label:info.name});
  if(active===sequence.current)setExportMessage(error??t('이미지 저장을 요청했습니다. 다운로드 또는 파일 선택 창을 확인하세요.','Image export requested. Check your download or file picker.'));
 }
 const label=t('게시글 내용','Post body');
 return <section id="publishing-guide" className="publication-panel" aria-label={t('광고 활용 가이드','Ad publishing guide')}>
  <div className="publication-heading"><div><span className="publication-eyebrow"><Send size={15}/> READY TO POST</span><h2>{t('이미지 다음은, 고객에게 전하기.','Your ad is ready for its next step.')}</h2><p>{t('매체를 고르고, 글을 복사하고, 이미지를 저장하세요.','Choose a channel, copy your text and save the image.')}</p></div><button type="button" className="publication-brief" onClick={onExportBrief}>{t('광고 기획 저장','Save campaign brief')}</button></div>
  {!contentReady?<p className="publication-empty">{t('광고 정보에서 상품·서비스명을 입력하면 게시글과 검색어를 준비해드려요.','Enter the product or service name in Ad content to prepare your post and search phrases.')}</p>:<>
   <div className="publication-step"><b>01</b><h3>{t('먼저 사용할 매체','Where to start')}</h3><button type="button" onClick={()=>setMore(!more)} aria-expanded={more}>{more?t('추천 매체만 보기','Show recommendations'):t('모든 매체 보기','Show all channels')}</button></div>
   <div className="publication-channels" role="group" aria-label={t('게시할 매체','Publishing channel')}>{displayed.map(id=>{const item=channelInfo(id,language);return <button type="button" key={id} aria-pressed={channel===id} onClick={()=>setChannel(id)}><span>{item.name}{recommended.includes(id)&&<small>{t('추천','Suggested')}</small>}</span><p>{item.reason}</p></button>;})}</div>
   <p className="publication-note">{t('업종과 광고 목적을 기준으로 추천합니다. 처음에는 한 매체부터 시작하세요.','Suggestions use your industry and ad goal. Start with one channel.')}</p>
   <details className="publication-intent"><summary>{t('이 광고가 전할 메시지','The message behind this ad')}</summary><p>{direction.intent}</p><p>{t('먼저 떠올릴 고객: ','Suggested audience: ')}{direction.target}</p></details>
   <div className="publication-content">
    <div className="publication-writing"><div className="publication-step"><b>02</b><h3>{channel==='blog'?t('검색 제목과 본문 초안','Search title and article draft'):t('함께 올릴 글','Text to post with your image')}</h3><small>{project.locale==='ko'?'한국어':'English'}</small></div>
     <p className="publication-note">{t('입력한 문구·사업 정보로 준비한 초안입니다. 고객에게 전할 내용으로 다듬어주세요. 앱 언어를 바꿔도 게시글 언어는 유지됩니다.','A draft assembled from your copy and business details. Refine it for your customers. Changing the app language keeps the ad text in its original language.')}</p>
     {stale&&<div className="publication-stale" role="alert"><strong>{t('광고 정보가 바뀌었습니다. 저장한 글을 다시 확인하세요.','Ad details changed. Review your saved post.')}</strong><p>{t('이전에 수정한 글은 보관 중입니다. 가격·기간·연락처를 현재 광고와 맞춘 뒤 복사하세요.','Your edits are retained. Match prices, dates and contact details to the current ad before copying.')}</p><details><summary>{t('현재 정보로 만든 초안 보기','See a draft using current details')}</summary><pre>{publicationText(suggestedDraft(project,channel))}</pre></details><div><button type="button" onClick={()=>change(p=>savePublishingDraft(p,suggestedDraft(p,channel)))}>{t('최신 정보로 다시 구성','Replace with current draft')}</button><button type="button" onClick={()=>change(p=>savePublishingDraft(p,{...currentDraft(p,channel).draft,basis:publishingBasis(p)}))}>{t('수정한 글 확인 완료','I reviewed my edited post')}</button></div></div>}
     <label className="publication-field">{t('게시글 제목','Post title')}<textarea rows={2} maxLength={400} value={draft.title} onChange={e=>edit({title:e.target.value})}/></label>
     <label className="publication-field">{label}<textarea rows={8} maxLength={6000} value={draft.body} onChange={e=>edit({body:e.target.value})}/></label>
     <div className="publication-copy-row"><span>{t(`${draft.title.length+draft.body.length}자 · ${edited?'직접 수정한 글':'입력 정보 기반 초안'}`,`${draft.title.length+draft.body.length} characters · ${edited?'Your edited post':'Draft from your details'}`)}</span><button type="button" disabled={stale||!draft.title.trim()&&!draft.body.trim()} onClick={()=>void copy(publicationText(draft))}><Copy size={16}/>{t('게시글 복사','Copy post')}</button></div>
     {missingContact&&<p className="publication-note">{t('광고 정보에 연락처 또는 웹사이트를 추가하면 고객의 다음 행동을 안내하기 쉬워요.','Add a contact or website in your ad details to give customers a next step.')}</p>}
     <details className="publication-search"><summary>{channel==='instagram'||channel==='shortform'?t('검색어·해시태그 다듬기','Refine search phrases and hashtags'):t('검색어 다듬기 (SEO)','Refine search phrases (SEO)')}</summary><label className="publication-field">{t('검색어 후보','Search phrase candidates')}<textarea rows={2} maxLength={500} value={draft.keywords} onChange={e=>edit({keywords:e.target.value})}/></label><p>{t('쉼표로 구분하세요. 실제 상품명·지역·업종을 중심으로 제목과 본문에 자연스럽게 쓰세요. 검색량을 조회한 결과나 상위 노출 보장은 아닙니다.','Separate phrases with commas. Use actual names, places and categories naturally in the title and body. These are not search-volume research or ranking guarantees.')}</p><p className="publication-tags">{hashtagText(draft.keywords)}</p><button type="button" disabled={stale||!draft.keywords.trim()} onClick={()=>void copy(draft.keywords)}>{t('검색어 복사','Copy search phrases')}</button><p>{t('인스타그램·숏폼 게시글 복사에는 해시태그가 함께 포함됩니다. 다른 매체에는 검색어를 따로 붙여넣을 필요가 없습니다.','Copying an Instagram or short-video post includes hashtags. Other channels do not need a separate keyword list pasted into the post.')}</p></details>
    </div>
    <aside className="publication-how"><div className="publication-step"><b>03</b><h3>{t('이렇게 게시하세요','How to use it')}</h3></div><ol>{info.steps.map(step=><li key={step}>{step}</li>)}</ol><button type="button" className="publication-export" disabled={imageDisabled} onClick={()=>void exportImage()}><ArrowDownToLine size={17}/>{t('이 매체용 이미지 저장','Save image for this channel')}<small>{info.format} · {size.width} × {size.height} PNG</small></button>
     {exportMessage&&<p role="status" className="publication-notice">{exportMessage}</p>}
     {channel==='shortform'&&<p className="publication-note">{t('저장되는 파일은 영상 편집용 정지 이미지입니다. 위 장면 구성은 촬영·편집 가이드이며 동영상은 생성되지 않습니다.','The file is a still image for video editing. The scene sequence is a filming guide; it does not generate a video.')}</p>}
     {channel==='lookbook'&&<p className="publication-note">{t('현재 광고 1장을 저장합니다. 여러 페이지 룩북이나 PDF를 자동 제작하지는 않습니다.','Saves one current ad image. It does not automatically assemble a multi-page lookbook or PDF.')}</p>}
     <p className="publication-note">{t('게시 화면에 따라 잘림과 배치를 확인하세요. 홈페이지 배너 등 다른 비율은 편집기에서 선택할 수 있어요.','Check placement and cropping in the posting preview. Choose other ratios, such as web banners, in the editor.')}</p>
     <div className="publication-next"><Check size={18}/><div><strong>{t('게시 후, 한 가지만 확인하세요','After posting, check one thing')}</strong><p>{info.measure}</p><small>{t('반응이 약하면 첫 문장이나 대표 이미지 중 하나만 바꿔 비교해보세요.','If response is weak, change just the opening line or main image and compare.')}</small></div></div>
    </aside>
   </div>
   {notice&&<p className="publication-notice" role="status">{notice}</p>}
   {manual!==null&&<label className="publication-field">{t('직접 복사할 게시글','Text for manual copying')}<textarea ref={manualField} readOnly rows={6} value={manual}/></label>}
   <p className="publication-footnote">{t('수정한 글은 프로젝트와 함께 저장·백업할 수 있습니다. 문구 편집·복사·비율별 저장에는 추가 AI 호출이 없습니다. 실제 게시는 각 매체에서 진행해주세요.','Save or back up your edited posts with the project. Editing, copying and exporting other ratios make no additional AI calls. Publish using each platform.')}</p>
  </>}
 </section>;
}
