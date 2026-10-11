import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,FolderOpen,Plus,Search} from 'lucide-react';
import type {Project} from './model';
import {render} from './render';
import {hasUsableCreative} from './generated';
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
 return <div className="project-thumb"><canvas ref={canvas} hidden={!ready} aria-label={t('저장한 광고 미리보기','Saved ad preview')}/>{!ready&&(project.product?<img src={project.product.data} alt={t('참조사진 · 제작 중','Reference photo · in progress')}/>:<strong>{project.productName||project.copy[project.locale].title}</strong>)}<span>{project.format}</span></div>;
}
export function ProjectLibrary({items,error,onNew,onOpen}:{items:Project[];error:string;onNew:()=>void;onOpen:(p:Project)=>void}){
 const {language,t}=useUiLanguage(),[filter,setFilter]=useState('');
 const filtered=items.filter(p=>(p.name+' '+p.productName).toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
 return <>
  <div className="projects-heading"><h1>{t('내 프로젝트','My projects')}</h1><button className="primary-action" onClick={onNew}><Plus size={18}/>{t('새 광고','New ad')}</button></div>
  <label className="project-search"><Search size={20}/><input aria-label={t('프로젝트 검색','Search projects')} placeholder={t('광고 이름 검색','Search ad names')} value={filter} onChange={e=>setFilter(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  {!filtered.length?<div className="project-empty"><FolderOpen size={32}/><h2>{filter?t('검색 결과가 없습니다.','No matches.'):t('첫 광고를 만들어보세요.','Create your first ad.')}</h2>{filter&&<button onClick={()=>setFilter('')}>{t('검색 초기화','Clear search')}</button>}</div>:<div className="project-grid">{filtered.map(p=><button key={p.id} className="project-tile" onClick={()=>onOpen(p)}><ProjectPreview project={p}/><div className="project-tile-caption"><strong>{p.name||p.productName||t('이름 없는 광고','Untitled ad')}</strong><ArrowUpRight size={18}/><small>{new Date(p.updatedAt).toLocaleDateString(language==='ko'?'ko-KR':'en-US')}</small></div></button>)}</div>}
  <details className="library-backup"><summary><span>{t('이 기기에 저장됨','Saved on this device')}</span><strong>{t('백업·불러오기','Backup & import')}</strong></summary><p>{t('다른 기기에서 열려면 프로젝트 파일을 백업하세요.','Back up your project file to open it on another device.')}</p><p>{t('광고를 열고 ‘프로젝트 백업’을 누르세요. 가져온 파일은 ‘파일 불러오기’로 열 수 있습니다.','Open an ad and choose Project backup. Use Import file to restore a backup.')}</p><a href="#studio">{t('파일 불러오러 가기','Go to file import')} <ArrowUpRight size={16}/></a></details>
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
  [t('AI 제작은 언제 사용할 수 있나요?','When can I use AI generation?'),t('AI 제작 화면에서 연결 상태를 확인하세요. 테스트 서버가 연결된 계정에서 사용할 수 있습니다.','Check the connection status in AI creation. Generation is available to accounts connected to the test server.')],
  [t('사진과 규격은 꼭 필요한가요?','Do I need photos and dimensions?'),t('상품 사진은 최대 10장입니다. 서비스는 사진 없이 시작할 수 있고, 규격은 필요할 때만 입력하세요.','Add up to 10 product photos. Services can start without a photo. Dimensions are optional.')],
  [t('만든 광고를 다시 수정할 수 있나요?','Can I edit an ad later?'),t('내 프로젝트에서 광고를 열어 수정하세요. 다른 기기로 옮길 때는 프로젝트 파일을 백업하세요. PNG·JPG만으로는 글자와 사진을 따로 수정할 수 없습니다.','Open your ad in My projects. Back up the project file to move it to another device. A PNG or JPG alone does not preserve editable text and photos.')],
  [t('어떤 크기로 저장하나요?','Which image size should I use?'),t('피드는 4:5, 스토리는 9:16을 선택하세요. 블로그·홈페이지에도 사용할 수 있습니다. 저장되는 파일은 정지 이미지입니다.','Choose 4:5 for feeds or 9:16 for stories. You can also use images on blogs and websites. Exports are still images.')],
  [t('가입과 결제는 가능한가요?','Are sign-up and payments available?'),t('이메일 가입과 결제는 연결 준비 중입니다. 현재는 초대코드로 테스트할 수 있으며 실제 결제는 발생하지 않습니다.','Email sign-up and checkout are being prepared. Invitation testing is available; real payments are not enabled.')]
 ];
 return <><h1>{t('사진과 설명으로,','Your photos. Your story.')}<br/>{t('내 광고를.','Your ad.')}</h1><ol className="simple-guide-steps">{steps.map(([title,desc],i)=><li key={title}><span>{i+1}</span><div><h2>{title}</h2><p>{desc}</p></div></li>)}</ol><button className="primary-action" onClick={onNew}>{t('광고 만들기','Create an ad')}<ArrowUpRight size={18}/></button><section className="guide-faq"><h2>{t('궁금한 점','Questions')}</h2>{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section></>;
}
