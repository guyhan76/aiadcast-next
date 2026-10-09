import {useEffect,useState} from 'react';
import {ArrowRight,ArrowUpRight,Box,BookOpen,FolderOpen,Home,Plus,ShieldCheck,Sparkles,Store,GraduationCap,Car,SlidersHorizontal} from 'lucide-react';
import Editor from './App';
import {CreateCampaign} from './CreateCampaign';
import {PricingDialog} from './PricingDialog';
import {newProject} from './model';
import type {Project} from './model';
import type {ProductCategory} from './product';
import {productCategories} from './product';
import {projects,saveProject} from './storage';
import perfume from './assets/container-1.webp?inline';
import clock from './assets/other-2.webp?inline';
import './studio.css';
type Page='home'|'create'|'projects'|'guide'|'studio';
const navigation=[['home','홈',Home],['create','광고 만들기',Plus],['projects','내 프로젝트',FolderOpen],['guide','사용 안내',BookOpen]] as const;
function currentPage():Page {const route=location.hash.slice(1);return ['home','create','projects','guide','studio'].includes(route)?route as Page:'home';}
function Brand(){return <span className="brand-lockup"><b>ai</b>adcast<i/></span>;}
export default function StudioApp(){
 const [page,setPage]=useState<Page>(currentPage),[seed,setSeed]=useState<Project>(newProject),[current,setCurrent]=useState<Project>(seed),[editorKey,setEditorKey]=useState(0);
 const [category,setCategory]=useState<ProductCategory>('other'),[wizardKey,setWizardKey]=useState(0),[items,setItems]=useState<Project[]>([]),[libraryError,setLibraryError]=useState(''),[filter,setFilter]=useState('');
 const [switchError,setSwitchError]=useState('');
 useEffect(()=>{const onHash=()=>{setPage(currentPage());window.scrollTo(0,0);};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash);},[]);
 useEffect(()=>{if(page!=='projects'&&page!=='home')return;let alive=true;projects().then(p=>{if(alive){setItems(p);setLibraryError('');}}).catch(()=>{if(alive)setLibraryError('이 기기의 저장된 작업을 읽지 못했습니다.');});return()=>{alive=false};},[page]);
 function go(next:Page){location.hash=next;setPage(next);window.scrollTo(0,0);}
 function begin(next:ProductCategory='other'){setCategory(next);setWizardKey(k=>k+1);go('create');}
 async function open(p:Project){
  try{const changed=JSON.stringify(current)!==JSON.stringify(seed);const snapshot=changed?{...current,updatedAt:new Date().toISOString()}:current;if(changed)await saveProject(snapshot);const next=changed&&p.id===current.id?snapshot:p;setSeed(next);setCurrent(next);setEditorKey(k=>k+1);setSwitchError('');go('studio');return true;}
  catch{setSwitchError('현재 편집 내용을 저장하지 못해 작업 전환을 멈췄습니다. 편집기로 돌아가 프로젝트 파일을 백업해주세요.');return false;}
 }
 async function ready(p:Project){await saveProject(p);if(!await open(p))throw Error('현재 작업 저장 실패');}
 const filtered=items.filter(p=>(p.name+' '+p.productName).toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
 return <div className={`studio-shell ${page==='studio'?'editor-route':''}`}>
  <aside className="app-sidebar"><a href="#home" className="app-brand" aria-label="aiadcast 홈"><Brand/><small>YOUR CREATIVE PARTNER</small></a><nav aria-label="주 메뉴">{navigation.map(([id,label,Icon])=><a href={'#'+id} key={id} aria-current={page===id?'page':undefined}><Icon size={19}/><span>{label}</span>{id==='create'&&<span className="nav-plus">+</span>}</a>)}</nav><div className="sidebar-bottom"><div className="studio-mark"><ShieldCheck size={20}/><span>당신의 상품.<br/><strong>당신의 브랜드.</strong></span></div><span>aiadcast Studio<br/>by selluplabs</span></div></aside>
  <div className="app-content">
   {switchError&&<p className="wizard-error" role="alert">{switchError}</p>}
   {page!=='studio'&&<header className="app-header"><a href="#home" className="mobile-brand" aria-label="aiadcast 홈"><Brand/></a><span className="workspace-label">SELLUPLABS <i>/</i> CREATIVE WORKSPACE</span><div className="app-header-actions"><PricingDialog/><span className="preview-label">개발 검증판</span></div></header>}
   <div hidden={page!=='home'} className="home-page app-page">
    <div className="home-welcome"><span>MAKE YOUR NEXT MOVE.</span><span>상품 · 브랜드 · 서비스</span></div>
    <section className="home-hero"><div className="hero-copy"><span className="hero-kicker"><i/>CREATIVITY, WITH PURPOSE</span><h1>당신의 비즈니스,<br/>광고가 되는 순간<span>.</span></h1><p>상품의 형태부터 서비스의 가치까지.<br/>만들고, 다듬고, 알리는 일을 한곳에서.</p><button className="primary-action" onClick={()=>begin()}>나의 광고 만들기<ArrowUpRight size={19}/></button><a className="hero-secondary" href="#studio">편집기 둘러보기 <ArrowRight size={14}/></a><div className="hero-capabilities"><span>원본 사진 사용</span><span>규격 선택</span><span>7가지 비율</span></div></div><div className="hero-gallery" aria-label="이전 aiadcast 생성 사례"><div className="hero-grid"/><figure className="hero-poster poster-back"><img src={clock} alt="이전 앱에서 생성한 클래식 시계 광고 참고 사례"/></figure><figure className="hero-poster poster-front"><img src={perfume} alt="이전 앱에서 생성한 유리 향수 용기 광고 참고 사례"/></figure><div className="hero-floating"><span className="mini-spark"><Sparkles size={17}/></span><span>YOUR PRODUCT.<br/><strong>A NEW PERSPECTIVE.</strong></span></div><p className="gallery-caption">이전 aiadcast 생성 사례 · 새 앱의 생성 결과가 아닙니다.</p></div></section>
    <section className="start-section"><div className="section-label"><span>START WITH YOUR BUSINESS</span><span>무엇을 알리고 싶으세요?</span></div><div className="business-options">{([{category:'other',title:'상품·브랜드',desc:'뷰티부터 생활용품까지',Icon:Box},{category:'services',title:'서비스·매장',desc:'이용 방법과 가치를 전하세요',Icon:Store},{category:'education',title:'교육·클래스',desc:'배움의 기회를 소개하세요',Icon:GraduationCap},{category:'automotive',title:'자동차·모빌리티',desc:'실제 차량의 매력을 그대로',Icon:Car}] as const).map(({category,title,desc,Icon})=><button key={category} onClick={()=>begin(category)}><Icon size={23} strokeWidth={1.4}/><strong>{title}</strong><small>{desc}</small><ArrowUpRight className="option-arrow" size={17}/></button>)}</div></section>
    <section className="home-work"><div><div className="section-label"><span>MADE TO KEEP EVOLVING</span></div><h2>한 번 만든 광고,<br/>계속 새롭게.</h2><p>사진·문구·배경·규격을 따로 편집하세요.<br/>저장한 프로젝트에서 다음 캠페인을 이어갈 수 있습니다.</p><a href="#projects">내 프로젝트 보기<ArrowRight size={17}/></a></div><div className="work-features"><article><span>01</span><div><h3>상품이 기준입니다.</h3><p>실제 사진과 입력한 규격을 함께 보관합니다.</p></div></article><article><span>02</span><div><h3>서비스도, 규격 없이.</h3><p>교육·보험·매장·전문 서비스 광고를 구성합니다.</p></div></article><article><span>03</span><div><h3>원하는 곳에 어울리게.</h3><p>피드·스토리·웹 배너에 맞춰 비율을 바꿉니다.</p></div></article></div></section>
    {!!items.length&&<div className="continue-work"><FolderOpen size={23}/><div><strong>이 기기에 저장한 프로젝트 {items.length}개</strong><span>마지막 작업을 이어서 완성하세요.</span></div><button onClick={()=>open(items[0])}>최근 작업 열기<ArrowRight size={17}/></button></div>}
    <p className="home-scope">현재 사진·문구 직접 편집과 기기 저장을 사용할 수 있습니다. AI 생성·자동 번역·결제는 연결 전입니다.</p>
   </div>
   <div hidden={page!=='create'} className="app-page"><CreateCampaign key={wizardKey} category={category} onReady={ready}/></div>
   <div hidden={page!=='projects'} className="app-page projects-page"><div className="section-label"><span>YOUR WORK, ALL TOGETHER</span><span>이 기기에 저장한 작업</span></div><div className="projects-heading"><div><h1>내 프로젝트<span>.</span></h1><p>다음 아이디어는 여기서 시작됩니다.</p></div><button className="primary-action" onClick={()=>begin()}><Plus size={17}/>새 광고</button></div><label className="project-search"><SlidersHorizontal size={17}/><input aria-label="프로젝트 검색" placeholder="이름으로 프로젝트 찾기" value={filter} onChange={e=>setFilter(e.target.value)}/><span>{filtered.length} PROJECTS</span></label>{libraryError&&<p role="alert">{libraryError}</p>}{!filtered.length?<div className="project-empty"><FolderOpen size={34}/><h2>{filter?'검색 결과가 없습니다.':'첫 광고를 만들어보세요.'}</h2><p>{filter?'다른 검색어로 찾아보세요.':'완성된 이미지와 편집 정보를 함께 보관할 수 있습니다.'}</p><button onClick={()=>filter?setFilter(''):begin()}>{filter?'검색 초기화':'광고 만들기'}<ArrowRight size={16}/></button></div>:<div className="project-grid">{filtered.map(p=><button key={p.id} className="project-tile" onClick={()=>open(p)}><div className="project-thumb" style={{background:p.background.color,color:p.ink==='dark'?'#252525':'#fff'}}>{p.product?<img src={p.product.data} alt="저장한 원본 사진"/>:<strong>{p.copy[p.locale].title}</strong>}<span>{p.format}</span></div><div className="project-tile-caption"><strong>{p.name||p.productName||'이름 없는 광고'}</strong><ArrowUpRight size={18}/><small>{productCategories.find(([id])=>id===p.productProfile.category)?.[1]} · {new Date(p.updatedAt).toLocaleDateString('ko-KR')}</small></div></button>)}</div>}<p className="home-scope">기기 저장은 로그인·클라우드 동기화가 아닙니다. 편집기에서 프로젝트 파일을 백업해주세요.</p></div>
   <div hidden={page!=='guide'} className="app-page guide-page"><div className="section-label"><span>DESIGNED TO BE SIMPLE</span><span>사용 안내</span></div><h1>좋은 광고의 시작은,<br/>정확한 정보입니다<span>.</span></h1><div className="guide-page-grid">{[['01','광고할 대상을 고르세요.','실물 상품과 서비스 모두 가능합니다. 규격은 필요한 광고에만 입력하세요.'],['02','실제 사진과 정보를 준비하세요.','원본 사진과 소재·색상·수량 등의 정보를 함께 보관합니다. 배경이 투명한 PNG는 상품만 합성하기에 좋습니다.'],['03','문구와 비율을 다듬으세요.','한국어·영어 문구를 직접 편집하고 목적에 맞는 비율로 내보내세요. 언어 선택이 자동 번역을 실행하지는 않습니다.'],['04','프로젝트를 함께 저장하세요.','PNG는 게시용, 프로젝트 JSON은 다시 편집할 때 사용합니다. 저장 데이터는 이 기기의 브라우저에 보관됩니다.']].map(([n,title,desc])=><article key={n}><span>{n}</span><h2>{title}</h2><p>{desc}</p></article>)}</div><section className="service-status"><ShieldCheck size={24}/><div><h2>현재 사용할 수 있는 기능</h2><p>원본 사진 합성 · 문구/배경/규격 편집 · 비율 변경 · 기기 저장 · PNG/프로젝트 내보내기</p><h3>연결과 검증이 필요한 기능</h3><p>실제 AI 생성 · 자동 배경 제거/번역 · 모델 자동 업데이트 운영 · 로그인/결제 · Android 앱 등록</p><p>규격 숫자 표시나 정면 두 변의 비례 검사는 실물의 3D 형상 재구성을 의미하지 않습니다.</p></div></section><button className="primary-action" onClick={()=>begin()}>첫 광고 시작하기<ArrowUpRight size={18}/></button></div>
   <div hidden={page!=='studio'} className="editor-container"><Editor key={editorKey} initialProject={seed} onProjectChange={setCurrent}/></div>
   {page!=='studio'&&<footer className="app-footer"><span>aiadcast<span>by selluplabs</span></span><a href="#studio">{current.product||current.productName?'편집 중인 작업으로 돌아가기':'직접 편집기 열기'}<ArrowUpRight size={14}/></a></footer>}
  </div>
  <nav className="mobile-app-nav" aria-label="모바일 메뉴">{navigation.map(([id,label,Icon])=><a key={id} href={'#'+id} aria-current={page===id?'page':undefined}><Icon size={20}/><span>{label}</span></a>)}</nav>
 </div>;
}
