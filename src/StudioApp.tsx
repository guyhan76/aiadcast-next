import {BetaAccount} from './BetaAccount';
import {useUiLanguage,LanguageSwitcher} from './ui-language';
import {useEffect,useState} from 'react';
import {ArrowRight,ArrowUpRight,BookOpen,FolderOpen,Home,Plus,ShieldCheck,Sparkles,SlidersHorizontal} from 'lucide-react';
import Editor from './App';
import {CreateCampaign} from './CreateCampaign';
import {PricingDialog} from './PricingDialog';
import {newProject} from './model';
import type {Project} from './model';
import {productCategories} from './product';
import {industryKinds} from './industry';
import type {IndustryKind} from './industry';
import {IndustryIcon} from './IndustryPicker';
import {projects,saveProject} from './storage';
import perfume from './assets/container-1.webp?inline';
import clock from './assets/other-2.webp?inline';
import './studio.css';
type Page='home'|'create'|'projects'|'guide'|'studio';
const navigation=[['home','홈',Home],['create','광고 만들기',Plus],['projects','내 프로젝트',FolderOpen],['guide','사용 안내',BookOpen]] as const;
function currentPage():Page {const route=location.hash.slice(1);return ['home','create','projects','guide','studio'].includes(route)?route as Page:'home';}
function Brand(){return <span className="brand-lockup"><b>ai</b>adcast<i/></span>;}
export default function StudioApp(){
 const {language,text}=useUiLanguage();
 const [page,setPage]=useState<Page>(currentPage),[seed,setSeed]=useState<Project>(()=>({...newProject(),locale:language})),[current,setCurrent]=useState<Project>(seed),[editorKey,setEditorKey]=useState(0);
 const [initialKind,setInitialKind]=useState<IndustryKind>(),[wizardKey,setWizardKey]=useState(0),[items,setItems]=useState<Project[]>([]),[libraryError,setLibraryError]=useState(''),[filter,setFilter]=useState('');
 const [switchError,setSwitchError]=useState('');
 useEffect(()=>{const onHash=()=>{setPage(currentPage());window.scrollTo(0,0);};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash);},[]);
 useEffect(()=>{if(page!=='projects'&&page!=='home')return;let alive=true;projects().then(p=>{if(alive){setItems(p);setLibraryError('');}}).catch(()=>{if(alive)setLibraryError(text('이 기기의 저장된 작업을 읽지 못했습니다.'));});return()=>{alive=false};},[page]);
 function go(next:Page){location.hash=next;setPage(next);window.scrollTo(0,0);}
 useEffect(()=>{
  const back=(event:Event)=>{
   if(page==='home')return;
   event.preventDefault();
   if(page!=='studio'){go('home');return;}
   void (async()=>{
    try{
     if(JSON.stringify(current)!==JSON.stringify(seed)){
      const snapshot={...current,updatedAt:new Date().toISOString()};
      await saveProject(snapshot);setSeed(snapshot);setCurrent(snapshot);
     }
     setSwitchError('');go('projects');
    }catch{setSwitchError(text('현재 편집 내용을 저장하지 못해 작업 전환을 멈췄습니다. 편집기로 돌아가 프로젝트 파일을 백업해주세요.'));}
   })();
  };
  window.addEventListener('aiadcast-native-back',back);
  return()=>window.removeEventListener('aiadcast-native-back',back);
 },[page,current,seed,language]);
 function begin(kind?:IndustryKind){setInitialKind(kind);setWizardKey(k=>k+1);go('create');}
 async function open(p:Project,preferIncoming=false){
  try{const changed=JSON.stringify(current)!==JSON.stringify(seed);const snapshot=changed?{...current,updatedAt:new Date().toISOString()}:current;if(changed)await saveProject(snapshot);if(preferIncoming&&p.id===current.id&&JSON.stringify(p)!==JSON.stringify(current))await saveProject({...snapshot,id:crypto.randomUUID(),name:(snapshot.name+' '+(language==='ko'?'기기 보관본':'local copy')).slice(0,80)});const next=changed&&p.id===current.id&&!preferIncoming?snapshot:p;setSeed(next);setCurrent(next);setEditorKey(k=>k+1);setSwitchError('');go('studio');return true;}
  catch{setSwitchError(text('현재 편집 내용을 저장하지 못해 작업 전환을 멈췄습니다. 편집기로 돌아가 프로젝트 파일을 백업해주세요.'));return false;}
 }
 async function ready(p:Project){await saveProject(p);if(!await open(p))throw Error(text('현재 작업 저장 실패'));}
 const filtered=items.filter(p=>(p.name+' '+p.productName).toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
 return <div className={`studio-shell ${page==='studio'?'editor-route':''}`}>
  <aside className="app-sidebar"><a href="#home" className="app-brand" aria-label={text("aiadcast 홈")}><Brand/><small>YOUR CREATIVE PARTNER</small></a><nav aria-label={text("주 메뉴")}>{navigation.map(([id,label,Icon])=><a href={'#'+id} key={id} aria-current={page===id?'page':undefined}><Icon size={19}/><span>{text(label)}</span>{id==='create'&&<span className="nav-plus">+</span>}</a>)}</nav><div className="sidebar-bottom"><div className="studio-mark"><ShieldCheck size={20}/><span>{text("당신의 상품.")}<br/><strong>{text("당신의 브랜드.")}</strong></span></div><span>aiadcast Studio<br/>by selluplabs</span></div></aside>
  <div className="app-content"><BetaAccount current={current} onOpen={p=>open(p,true)}/>
   {switchError&&<p className="wizard-error" role="alert">{switchError}</p>}
   {page!=='studio'&&<header className="app-header"><a href="#home" className="mobile-brand" aria-label={text("aiadcast 홈")}><Brand/></a><span className="workspace-label">SELLUPLABS <i>/</i> CREATIVE WORKSPACE</span><div className="app-header-actions"><LanguageSwitcher/><PricingDialog/><span className="preview-label">{text("개발 테스트 버전")}</span></div></header>}
   <div hidden={page!=='home'} className="home-page app-page">
    <div className="home-welcome"><span>MAKE YOUR NEXT MOVE.</span><span>{text("상품 · 브랜드 · 서비스")}</span></div>
    <section className="home-hero"><div className="hero-copy"><span className="hero-kicker"><i/>CREATIVITY, WITH PURPOSE</span><h1>{text("내 상품과 서비스로,")}<br/>{text("바로 사용할 광고를")}<span>.</span></h1><p>{text("사진과 사업 정보를 등록하고 홍보 목적을 선택하세요.")}<br/>{text("필요한 부분만 다듬어, 다음 광고에도 이어서 쓰세요.")}</p><button className="primary-action" onClick={()=>begin()}>{text("나의 광고 만들기")}<ArrowUpRight size={19}/></button><a className="hero-secondary" href="#projects">{text("이전 광고 수정하기 ")}<ArrowRight size={14}/></a><p className="hero-promise">{text("어려운 요청문 없이 · 내 상품을 유지하며 · 다음 광고에도 이어서")}</p><p className="hero-preview-note">{text("내 상품을 지키는 편집 · AI 제작은 테스트 서버 연결 후")}</p></div><div className="hero-gallery" aria-label={text("이전 aiadcast 생성 사례")}><div className="hero-grid"/><figure className="hero-poster poster-back"><img src={clock} alt={text("이전 앱에서 생성한 클래식 시계 광고 참고 사례")}/></figure><figure className="hero-poster poster-front"><img src={perfume} alt={text("이전 앱에서 생성한 유리 향수 용기 광고 참고 사례")}/></figure><div className="hero-floating"><span className="mini-spark"><Sparkles size={17}/></span><span>YOUR PRODUCT.<br/><strong>A NEW PERSPECTIVE.</strong></span></div><p className="gallery-caption">{text("이전 aiadcast 생성 사례 · 새 앱의 생성 결과가 아닙니다.")}</p></div></section>
    <section className="start-section"><div className="section-label"><span>START WITH YOUR BUSINESS</span><span>{text("광고할 대상을 먼저 골라주세요.")}</span></div><div className="business-options subject-home-options">{industryKinds.map(kind=><button key={kind.id} aria-label={language==='ko'?kind.label+' 광고 만들기':'Create a '+(kind.id==='product'?'product':'service')+' ad'} onClick={()=>begin(kind.id)}><IndustryIcon groupId={kind.id==='product'?'products':'business'} size={27}/><strong>{text(kind.label)}</strong><small>{text(kind.description)}</small><ArrowUpRight className="option-arrow" size={19}/></button>)}</div></section>
    <section className="home-work"><div><div className="section-label"><span>MADE TO KEEP EVOLVING</span></div><h2>{text("한 번 만든 광고,")}<br/>{text("계속 새롭게.")}</h2><p>{text("가격 한 줄, 행사 기간 하나도 바로 수정하세요.")}<br/>{text("저장한 프로젝트에서 다음 광고를 이어갈 수 있습니다.")}</p><a href="#projects">{text("이전 광고 수정하기")}<ArrowRight size={17}/></a></div><div className="work-features"><article><span>01</span><div><h3>{text("내 상품과 정보를 지킵니다.")}</h3><p>{text("원본 사진을 사용하고, 문구·규격을 별도로 편집합니다. 서비스 광고는 규격 없이 시작하세요.")}</p></div></article><article><span>02</span><div><h3>{text("필요한 부분만 다시 고칩니다.")}</h3><p>{text("저장한 프로젝트를 열어 가격·기간·연락처를 수정하고, 다음 광고에도 활용하세요.")}</p></div></article><article><span>03</span><div><h3>{text("인스타그램에 맞는 크기로.")}</h3><p>{text("피드 4:5 · 스토리 9:16로 저장하세요. 릴스용 PNG는 영상 제작에 사용할 정지 이미지입니다.")}</p></div></article></div></section>
    {!!items.length&&<div className="continue-work"><FolderOpen size={23}/><div><strong>{text("이 기기에 저장한 프로젝트 ")}{items.length}{text("개")}</strong><span>{text("마지막 작업을 이어서 완성하세요.")}</span></div><button onClick={()=>open(items[0])}>{text("최근 작업 열기")}<ArrowRight size={17}/></button></div>}
    <p className="home-scope">{text("직접 편집과 기기 저장을 사용할 수 있습니다. AI 제작은 테스트 서버·비용 한도 설정 후 사용하며, 실제 결제는 연결 전입니다.")}</p>
   </div>
   <div hidden={page!=='create'} className="app-page"><CreateCampaign key={wizardKey} initialKind={initialKind} onReady={ready}/></div>
   <div hidden={page!=='projects'} className="app-page projects-page"><div className="section-label"><span>YOUR WORK, ALL TOGETHER</span><span>{text("이 기기에 저장한 작업")}</span></div><div className="projects-heading"><div><h1>{text("내 프로젝트")}<span>.</span></h1><p>{text("이전에 만든 광고를 열고, 필요한 부분만 수정하세요.")}</p></div><button className="primary-action" onClick={()=>begin()}><Plus size={17}/>{text("새 광고")}</button></div><div className="project-reuse-note"><strong>{text("다시 편집하려면 프로젝트가 필요해요.")}</strong><p>{text("저장된 작업을 열거나 편집기의 ‘파일 불러오기’에서 프로젝트 JSON을 불러오세요. PNG·JPG만으로는 합쳐진 문구와 사진을 자동으로 나눠 수정할 수 없습니다.")}</p><a href="#studio">{text("프로젝트 파일 불러오러 가기")}<ArrowRight size={15}/></a></div><label className="project-search"><SlidersHorizontal size={17}/><input aria-label={text("프로젝트 검색")} placeholder={text("이름으로 프로젝트 찾기")} value={filter} onChange={e=>setFilter(e.target.value)}/><span>{filtered.length} PROJECTS</span></label>{libraryError&&<p role="alert">{libraryError}</p>}{!filtered.length?<div className="project-empty"><FolderOpen size={34}/><h2>{filter?text('검색 결과가 없습니다.'):text('첫 광고를 만들어보세요.')}</h2><p>{filter?text('다른 검색어로 찾아보세요.'):text('완성된 이미지와 편집 정보를 함께 보관할 수 있습니다.')}</p><button onClick={()=>filter?setFilter(''):begin()}>{filter?text('검색 초기화'):text('광고 만들기')}<ArrowRight size={16}/></button></div>:<div className="project-grid">{filtered.map(p=><button key={p.id} className="project-tile" onClick={()=>open(p)}><div className="project-thumb" style={{background:p.background.color,color:p.ink==='dark'?'#252525':'#fff'}}>{p.product?<img src={p.product.data} alt={text("저장한 원본 사진")}/>:<strong>{p.copy[p.locale].title}</strong>}<span>{p.format}</span></div><div className="project-tile-caption"><strong>{p.name||p.productName||text('이름 없는 광고')}</strong><ArrowUpRight size={18}/><small>{text(productCategories.find(([id])=>id===p.productProfile.category)?.[1]??'')} · {new Date(p.updatedAt).toLocaleDateString(language==='ko'?'ko-KR':'en-US')}</small></div></button>)}</div>}<p className="home-scope">{text("기기 저장은 로그인·클라우드 동기화가 아닙니다. 편집기에서 프로젝트 파일을 백업해주세요.")}</p></div>
   <div hidden={page!=='guide'} className="app-page guide-page"><div className="section-label"><span>DESIGNED TO BE SIMPLE</span><span>{text("사용 안내")}</span></div><h1>{text("좋은 광고의 시작은,")}<br/>{text("정확한 정보입니다")}<span>.</span></h1><div className="guide-page-grid">{[['01',text('광고할 대상을 고르세요.'),text('실물 상품과 서비스 모두 가능합니다. 규격은 필요한 광고에만 입력하세요.')],['02',text('실제 사진과 정보를 준비하세요.'),text('원본 사진과 소재·색상·수량 등의 정보를 함께 보관합니다. 배경이 투명한 PNG는 상품만 합성하기에 좋습니다.')],['03',text('인스타그램에 맞춰 저장하세요.'),text('피드는 4:5, 스토리는 9:16을 선택하세요. 릴스용 PNG는 영상 제작용 정지 이미지이며 동영상 파일이 아닙니다. 한국어·영어 문구는 직접 편집하며 자동 번역은 연결 전입니다.')],['04',text('다음 광고에도 이어서 쓰세요.'),text('이 기기에 저장한 프로젝트나 백업한 JSON을 열면 문구·사진·배경을 따로 수정할 수 있습니다. PNG·JPG만 다시 올리면 합쳐진 요소를 자동으로 분리할 수 없으므로 프로젝트도 함께 백업하세요.')]].map(([n,title,desc])=><article key={n}><span>{n}</span><h2>{title}</h2><p>{desc}</p></article>)}</div><section className="service-status"><ShieldCheck size={24}/><div><h2>{text("현재 사용할 수 있는 기능")}</h2><p>{text("원본 사진 합성 · 문구/배경/규격 편집 · 비율 변경 · 기기 저장 · PNG/프로젝트 내보내기")}</p><h3>{text("연결과 검증이 필요한 기능")}</h3><p>{text("자동 배경 제거 · 선택 영역 AI 수정 · 로그인·실제 결제 · 클라우드 동기화 · Android 공개 등록")}</p><p>{text("규격 숫자 표시나 정면 두 변의 비례 검사는 실물의 3D 형상 재구성을 의미하지 않습니다.")}</p></div></section><button className="primary-action" onClick={()=>begin()}>{text("첫 광고 시작하기")}<ArrowUpRight size={18}/></button></div>
   <div hidden={page!=='studio'} className="editor-container"><Editor key={editorKey} initialProject={seed} onProjectChange={setCurrent}/></div>
   {page!=='studio'&&<footer className="app-footer"><span>aiadcast<span>by selluplabs</span></span><a href="#studio">{current.product||current.productName?text('편집 중인 작업으로 돌아가기'):text('직접 편집기 열기')}<ArrowUpRight size={14}/></a></footer>}
  </div>
  <nav className="mobile-app-nav" aria-label={text("모바일 메뉴")}>{navigation.map(([id,label,Icon])=><a key={id} href={'#'+id} aria-current={page===id?'page':undefined}><Icon size={20}/><span>{text(label)}</span></a>)}</nav>
 </div>;
}
