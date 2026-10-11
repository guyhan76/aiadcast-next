import {EmailAccountPage,CheckoutPage} from './AccountPages';
import {ProjectLibrary,UsageGuide} from './LibraryGuide';
import './simple-pages.css';
import {HomeShowcase} from './HomeShowcase';
import {BetaAccount} from './BetaAccount';
import {useUiLanguage,LanguageSwitcher} from './ui-language';
import {useEffect,useState} from 'react';
import {ArrowUpRight,BookOpen,FolderOpen,Home,Plus,ShieldCheck} from 'lucide-react';
import Editor from './App';
import {CreateCampaign} from './CreateCampaign';
import {PricingDialog} from './PricingDialog';
import {newProject} from './model';
import type {Project} from './model';
import {projects,saveProject} from './storage';
import './studio.css';
import './premium.css';
import './campaign-cover.css';
type Page='home'|'create'|'projects'|'guide'|'studio'|'signup'|'login'|'checkout';
const navigation=[['home','홈',Home],['create','광고 만들기',Plus],['projects','내 프로젝트',FolderOpen],['guide','사용 안내',BookOpen]] as const;
function currentPage():Page {const route=location.hash.slice(1);return ['home','create','projects','guide','studio','signup','login','checkout'].includes(route)?route as Page:'home';}
function Brand(){return <span className="brand-lockup"><b>ai</b>adcast<i/></span>;}
export default function StudioApp(){
 const {language,text}=useUiLanguage();
 const [page,setPage]=useState<Page>(currentPage),[seed,setSeed]=useState<Project>(()=>({...newProject(),locale:language})),[current,setCurrent]=useState<Project>(seed),[editorKey,setEditorKey]=useState(0);
 const [wizardKey,setWizardKey]=useState(0),[items,setItems]=useState<Project[]>([]),[libraryError,setLibraryError]=useState('');
 const [switchError,setSwitchError]=useState('');
 useEffect(()=>{const onHash=()=>{setPage(currentPage());window.scrollTo(0,0);};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash);},[]);
 useEffect(()=>{if(page!=='projects')return;let alive=true;projects().then(p=>{if(alive){setItems(p);setLibraryError('');}}).catch(()=>{if(alive)setLibraryError(text('이 기기의 저장된 작업을 읽지 못했습니다.'));});return()=>{alive=false};},[page]);
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
 function begin(){setWizardKey(k=>k+1);go('create');}
 async function open(p:Project,preferIncoming=false){
  try{const changed=JSON.stringify(current)!==JSON.stringify(seed);const snapshot=changed?{...current,updatedAt:new Date().toISOString()}:current;if(changed)await saveProject(snapshot);if(preferIncoming&&p.id===current.id&&JSON.stringify(p)!==JSON.stringify(current))await saveProject({...snapshot,id:crypto.randomUUID(),name:(snapshot.name+' '+(language==='ko'?'기기 보관본':'local copy')).slice(0,80)});const next=changed&&p.id===current.id&&!preferIncoming?snapshot:p;setSeed(next);setCurrent(next);setEditorKey(k=>k+1);setSwitchError('');go('studio');return true;}
  catch{setSwitchError(text('현재 편집 내용을 저장하지 못해 작업 전환을 멈췄습니다. 편집기로 돌아가 프로젝트 파일을 백업해주세요.'));return false;}
 }
 async function ready(p:Project){await saveProject(p);if(!await open(p))throw Error(text('현재 작업 저장 실패'));}
 const libraryItems=JSON.stringify(current)!==JSON.stringify(seed)?[current,...items.filter(p=>p.id!==current.id)]:items;

 return <div className={`studio-shell ${page==='studio'?'editor-route':''}`}>
  <aside className="app-sidebar"><a href="#home" className="app-brand" aria-label={text("aiadcast 홈")}><Brand/><small>{language==='ko'?'내 브랜드의 광고 제작 파트너':'YOUR CREATIVE PARTNER'}</small></a><nav aria-label={text("주 메뉴")}>{navigation.map(([id,label,Icon])=><a href={'#'+id} key={id} aria-current={page===id?'page':undefined}><Icon size={19}/><span>{text(label)}</span>{id==='create'&&<span className="nav-plus">+</span>}</a>)}</nav><div className="sidebar-bottom"><div className="studio-mark"><ShieldCheck size={20}/><span>{text("당신의 상품.")}<br/><strong>{text("당신의 브랜드.")}</strong></span></div><span>aiadcast Studio<br/>by selluplabs</span></div></aside>
  <div className="app-content"><details className="account-drawer"><summary>{language==='ko'?'테스트 계정 · 서버 연결':'Test account & connection'}</summary><BetaAccount current={current} onOpen={p=>open(p,true)}/></details>
   {switchError&&<p className="wizard-error" role="alert">{switchError}</p>}
   {page!=='studio'&&<header className="app-header"><a href="#home" className="mobile-brand" aria-label={text("aiadcast 홈")}><Brand/></a><span className="workspace-label">{language==='ko'?'내 상품과 서비스를 위한 광고 작업실':'SELLUPLABS / CREATIVE WORKSPACE'}</span><div className="app-header-actions"><LanguageSwitcher/><PricingDialog/><a className="account-link" href="#login">{text("로그인")}</a></div></header>}
   <div hidden={page!=='home'} className="home-page app-page">
    <section className="premium-home"><h1>{language==='ko'?<><span>내 상품과 서비스를,</span><br/><em>프리미엄 광고로.</em></>:<>Your products and services.<br/><em>Premium ads.</em></>}</h1><p>{language==='ko'?'사진과 설명을 넣으면, AI가 광고 이미지와 문구를 만듭니다.':'Add photos and a description. AI creates your ad images and copy.'}</p><HomeShowcase enabled={page==='home'}/><button className="primary-action premium-start" onClick={()=>begin()}>{text('내 광고 만들기')}<ArrowUpRight size={21}/></button></section>
   </div>
   <div hidden={page!=='create'} className="app-page"><CreateCampaign key={wizardKey} onReady={ready}/></div>
   <div hidden={page!=='projects'} className="app-page projects-page"><ProjectLibrary items={libraryItems} error={libraryError} onNew={begin} onOpen={p=>void open(p)}/></div>
   <div hidden={page!=='guide'} className="app-page guide-page"><UsageGuide onNew={begin}/></div>
   {(page==='signup'||page==='login')&&<div className="app-page"><EmailAccountPage key={page} mode={page}/></div>}
   {page==='checkout'&&<div className="app-page"><CheckoutPage/></div>}
   <div hidden={page!=='studio'} className="editor-container"><Editor key={editorKey} initialProject={seed} onProjectChange={setCurrent}/></div>
   {page!=='studio'&&<footer className="app-footer"><div className="footer-brand"><Brand/><span className="footer-byline">by selluplabs</span></div></footer>}
  </div>
  <nav className="mobile-app-nav" aria-label={text("모바일 메뉴")}>{navigation.map(([id,label,Icon])=><a key={id} href={'#'+id} aria-current={page===id?'page':undefined}><Icon size={20}/><span>{text(label)}</span></a>)}</nav>
 </div>;
}
