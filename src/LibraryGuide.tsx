import {libraryBatch,visibleLibraryProjects} from './library-batches';
import {useLibraryBatch} from './use-library-batch';
import {useLibrarySelection} from './LibrarySelection';
import {CloudLibrary} from './Membership';
import {PrecisionEditAction} from './PrecisionEditAction';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,FolderOpen,Plus,Search} from 'lucide-react';
import type {Project} from './model';
import {render} from './render';
import {hasUsableCreative,hasSavedAcceptedAd} from './generated';
import {useUiLanguage} from './ui-language';
function ProjectPreview({project}:{project:Project}){
 const canvas=useRef<HTMLCanvasElement>(null),[ready,setReady]=useState(false);
 const {t}=useUiLanguage();
 useEffect(()=>{let active=true;setReady(false);
  if(project.generation.mode==='creative'&&!hasUsableCreative(project))return;
  const scratch=document.createElement('canvas');
  void render(scratch,project).then(()=>{if(!active||!canvas.current)return;canvas.current.width=scratch.width;canvas.current.height=scratch.height;canvas.current.getContext('2d')?.drawImage(scratch,0,0);setReady(true);}).catch(()=>{});
  return()=>{active=false;};
 },[project]);
 return <div className="project-thumb"><canvas ref={canvas} hidden={!ready} aria-label={t('저장한 광고 미리보기','Saved ad preview')}/>{!ready&&(project.generated?.composition==='complete-ad'&&project.generated.asset?.data?<img src={project.generated.asset.data} alt={t('과거 광고 원본','Previous ad original')}/>:project.product?<img src={project.product.data} alt={t('참조사진','Reference photo')}/>:<strong>{project.productName||project.copy[project.locale].title}</strong>)}<span>{project.format}</span></div>;
}
function ProjectTile({project,editing,selected,busy,onClick,connected}:{project:Project;editing:boolean;selected:boolean;busy:boolean;onClick:()=>void;connected:boolean}){
 const {language,t}=useUiLanguage(),batch=libraryBatch(project),saved=!batch&&hasSavedAcceptedAd(project);
 const {ref,status,image}=useLibraryBatch(connected?batch:undefined);
 const labels={checking:t('결과 확인','Check results'),running:t('제작 중','In progress'),ready:t('생성 완료','Generation complete'),partial:t('일부 생성 완료','Partially complete'),unknown:t('결과 확인','Check results'),unavailable:t('결과 없음','No result')};
 const label=saved?'':batch?labels[status]:t('초안','Draft');
 return <button ref={ref} className={'project-tile'+(editing&&selected?' is-selected':'')} disabled={busy} aria-pressed={editing?selected:undefined} onClick={onClick}>
  {batch?<div className="project-thumb">{image?<img src={image} alt={t('생성된 광고 미리보기','Generated ad preview')}/>:<FolderOpen size={24} aria-hidden="true"/>}<span>{project.format}</span></div>:<ProjectPreview project={project}/>}
  <div className="project-tile-caption"><strong>{project.name||project.productName||t('이름 없는 광고','Untitled ad')}</strong>
   {editing?<span aria-hidden="true" className="selection-dot">{selected?'✓':''}</span>:<ArrowUpRight size={18}/>}
   <small>{label&&label+' · '}{new Date(project.updatedAt).toLocaleDateString(language==='ko'?'ko-KR':'en-US')}</small>
  </div></button>;
}
type LibraryProps={onRemove:(ids:string[])=>Promise<void>;items:Project[];error:string;onNew:()=>void;onOpen:(p:Project)=>void;
 onOpenServer:(p:Project)=>Promise<boolean>;showDownloads:boolean};
export function ProjectLibrary({items,error,onRemove,onNew,onOpen,onOpenServer,showDownloads}:LibraryProps){
 const {t}=useUiLanguage();
 const [filter,setFilter]=useState(''),[view,setView]=useState<'saved'|'downloads'>('saved');
 const saved=visibleLibraryProjects(items);
 const filtered=saved.filter(p=>(p.name+' '+p.productName).toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
 const selection=useLibrarySelection(filtered.map(p=>p.id),onRemove,'device');
 return <>
  <div className="projects-heading"><h1>{t('내 프로젝트','My projects')}</h1><button className="primary-action" onClick={onNew}><Plus size={18}/>{t('새 광고','New ad')}</button></div>
  <div className="project-import"><PrecisionEditAction label={t('사진·백업 불러와 정밀 편집','Open a photo or backup to edit')}/></div>
  {showDownloads&&<div className="library-views" role="group" aria-label={t('프로젝트 보기','Project view')}>
   <button type="button" aria-pressed={view==='saved'} onClick={()=>setView('saved')}>{t('저장한 광고','Saved ads')}</button>
   <button type="button" aria-pressed={view==='downloads'} onClick={()=>setView('downloads')}>{t('다운로드','Downloads')}</button>
  </div>}
  {showDownloads&&view==='downloads'?<CloudLibrary onOpen={onOpenServer}/>:<>
   {saved.length>0&&<label className="project-search"><Search size={20}/><input aria-label={t('프로젝트 검색','Search projects')} placeholder={t('광고 이름 검색','Search ad names')} value={filter} onChange={e=>setFilter(e.target.value)}/></label>}
   {selection.tools}
   {error&&<p role="alert">{error}</p>}
   {filtered.length>0?<div className="project-grid">{filtered.map(p=><ProjectTile key={p.id} project={p} editing={selection.editing} selected={selection.selected.has(p.id)} busy={selection.busy} connected={showDownloads} onClick={()=>selection.editing?selection.toggle(p.id):onOpen(p)}/>)}</div>
    :!error&&<div className="project-empty"><FolderOpen size={30} aria-hidden="true"/><h2>{saved.length?t('검색 결과가 없습니다.','No matches.'):t('저장한 광고가 없습니다.','No saved ads yet.')}</h2>{saved.length>0&&<button onClick={()=>setFilter('')}>{t('검색 초기화','Clear search')}</button>}</div>}
  </>}
 </>;
}
export function UsageGuide({onNew}:{onNew:()=>void}){
 const {t}=useUiLanguage();
 const steps=[
  [t('사진과 설명 넣기','Add photos and details'),t('상품이나 서비스를 알려주세요.','Tell us about your product or service.')],
  [t('광고 확인하고 수정하기','Review and refine'),t('이미지와 문구를 확인하고 다듬으세요.','Review the image and fine-tune the copy.')],
  [t('저장하고 활용하기','Save and share'),t('필요한 크기로 저장해 홍보에 쓰세요.','Save the size you need for your promotion.')]
 ];
 const faqs=[
  [t('광고는 어떻게 만드나요?','How do I create an ad?'),t('업종을 고르고 상품·서비스 이름과 설명을 입력하세요. 상품은 사진을 첨부하고, 광고 문구는 AI에 맡기거나 직접 입력할 수 있습니다. 생성된 광고를 확인한 뒤 사용할 결과를 확정하세요.','Choose an industry and enter your product or service name and description. Add a photo for a product, then let AI write the copy or enter your own. Review the generated ad before accepting it.')],
  [t('사진과 규격은 꼭 필요한가요?','Do I need photos and dimensions?'),t('상품 광고에는 사진이 필요합니다. 사진은 최대 10장, 전체 합계 10MB까지 첨부할 수 있습니다. 서비스 광고는 사진 없이 시작할 수 있고, 상품 규격은 필요한 경우에만 입력하세요.','Product ads need a photo. You can attach up to 10 photos, 10MB combined. Service ads can start without a photo, and product dimensions are optional.')],
  [t('만든 광고를 다시 수정할 수 있나요?','Can I edit an ad later?'),t('내 프로젝트에서 저장한 광고를 열고 정밀 편집을 누르세요. 바꿀 가격이나 제품을 적으면 AI가 위치를 찾아 수정 사본을 만듭니다. 기기 사진이나 프로젝트 백업 파일은 내 프로젝트 상단의 ‘사진·백업 불러와 정밀 편집’에서 바로 여세요.','Open a saved ad in My projects and choose Precision edit. Describe the price or product to change. The app locates it and creates an edited copy. At the top of My projects, choose Open a photo or backup to edit a file from your device.')],
  [t('어떤 크기로 저장하나요?','Which image size should I use?'),t('피드에는 4:5 또는 1:1, 스토리에는 9:16 비율을 선택하세요. 완성 광고를 다른 비율로 저장하면 이미지 전체를 유지하도록 여백이 추가되며 자동으로 다시 배치되지는 않습니다. 저장 파일은 PNG 정지 이미지이며 동영상이 아닙니다.','Choose 4:5 or 1:1 for feeds and 9:16 for stories. Exporting a finished ad in another ratio adds margins to keep the whole image; it does not rearrange the layout. The saved PNG is a still image, not a video.')],
  [t('이미지를 저장할 때도 크레딧을 쓰나요?','Does saving an image use credits?'),t('완성한 이미지를 다시 저장하거나 공유하는 것은 새 AI 생성 요청이 아닙니다. 새 시안 생성이나 부분 수정처럼 AI가 새 이미지를 만드는 작업은 실행 전에 화면에 표시되는 크레딧과 차감 조건을 확인하세요.','Saving or sharing a finished image again does not request new AI generation. Before creating another visual or requesting an AI edit, review the credits and charge terms shown on screen.')]
 ];
 return <><h1>{t('사진과 설명으로,','Your photos. Your story.')}<br/>{t('내 광고를.','Your ad.')}</h1><ol className="simple-guide-steps">{steps.map(([title,desc],i)=><li key={title}><span>{i+1}</span><div><h2>{title}</h2><p>{desc}</p></div></li>)}</ol><button className="primary-action" onClick={onNew}>{t('광고 만들기','Create an ad')}<ArrowUpRight size={18}/></button><section className="guide-faq"><h2>{t('궁금한 점','Questions')}</h2>{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section></>;
}
