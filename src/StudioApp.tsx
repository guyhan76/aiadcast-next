import {PreviewLeaveGuard,requestPreviewLeave} from './PreviewLeaveGuard';
import {clearLoginDestination} from './login-navigation';
import {CreditsPage} from './CreditsPage';
import {apiIdentity} from './api-origin';
import {readSession} from './account-client';
import {CheckoutReturnPage} from './CheckoutReturnPage';
import {creativeCampaignDraft} from './consumer-campaign';
import {MaterialStudio} from './MaterialStudio';
import {DemoNotice,OfflineDemoControls} from './OfflineDemoControls';
import {AppFooter} from './AppFooter';
import {AdminPage} from './AdminPage';
import {BrandLogo as Brand} from './BrandLogo';
import {offlineDemo} from './demo-mode';
import {loadWorkspace,saveWorkspace,type WorkspaceDraft,type WizardDraft} from './workspace-draft';
import {betaSession} from './beta-session';
import {EmailAccountPage,CheckoutPage,VerifyEmailPage,PaymentBrowserPage} from './AccountPages';
import {ProjectLibrary,UsageGuide} from './LibraryGuide';
import './simple-pages.css';
import {HomeShowcase} from './HomeShowcase';
import {PortfolioPage} from './PortfolioPage';
import {BetaAccount} from './BetaAccount';
import {AccountBar} from './AccountBar';
import {TestConnection} from './TestConnection';
import {useUiLanguage,LanguageSwitcher} from './ui-language';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowUpRight,BookOpen,FolderOpen,Home,Plus,ShieldCheck} from 'lucide-react';
import Editor from './App';
import {SimpleAdResult} from './SimpleAdResult';
import {CreateCampaign} from './CreateCampaign';
import {PricingDialog} from './PricingDialog';
import {newProject} from './model';
import type {Project} from './model';
import {projects,saveProject} from './storage';
import './studio.css';
import './premium.css';
import './campaign-cover.css';
type Page='portfolio'|'home'|'create'|'projects'|'guide'|'studio'|'signup'|'login'|'credits'|'checkout'|'verify'|'pay'|'payment-return'|'checkout-return'|'admin'|'editor';
const navigation=[['home','홈',Home],['create','광고 만들기',Plus],['projects','내 프로젝트',FolderOpen],['guide','사용 안내',BookOpen]] as const;
function currentPage():Page {if(new URLSearchParams(location.search).get('checkout')==='return')return 'payment-return';const route=location.hash.slice(1).split('?')[0];return ['portfolio','home','create','projects','guide','studio','signup','login','credits','checkout','verify','pay','payment-return','checkout-return','admin','editor'].includes(route)?route as Page:'home';}
export default function StudioApp(){
 const [route,setRoute]=useState(currentPage);
 useEffect(()=>{if(route!=='login'&&route!=='signup')clearLoginDestination();},[route]);
 useEffect(()=>{const update=()=>setRoute(currentPage());window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 useEffect(()=>{const resume=()=>{location.hash='checkout-return';};window.addEventListener('aiadcast-checkout-return',resume);return()=>window.removeEventListener('aiadcast-checkout-return',resume);},[]);
 if(['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('materialStudio')==='1')return <MaterialStudio/>;
 if(route==='verify'||route==='pay'||route==='payment-return'||route==='checkout-return')return <div className="studio-shell account-standalone"><AccountBar preserve={async()=>{await loadWorkspace();}}/><div className="app-page"><a className="account-brand" href="#home"><Brand/></a>{route==='checkout-return'?<CheckoutReturnPage/>:route==='verify'?<VerifyEmailPage/>:<PaymentBrowserPage returning={route==='payment-return'}/>}</div></div>;
 return <><PreviewLeaveGuard/><WorkspaceLoader/></>;
}
function WorkspaceLoader(){
 const [loaded,setLoaded]=useState<{draft?:WorkspaceDraft}|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let alive=true;loadWorkspace().then(draft=>{if(alive)setLoaded({draft});}).catch(()=>{if(alive){setError(true);setLoaded({});}});return()=>{alive=false};},[]);
 if(!loaded)return <p role="status">aiadcast…</p>;
 return <>{error&&<p role="alert">이 기기의 임시 작업을 읽지 못했습니다. / Could not restore the local draft.</p>}<StudioWorkspace restored={loaded.draft}/></>;
}
function StudioWorkspace({restored}:{restored?:WorkspaceDraft}){
 const {language,text}=useUiLanguage();
 const priorPage=useRef<Page>(currentPage()),adminBack=useRef('#home'),creditsBack=useRef<Page>('home');
 const [page,setPage]=useState<Page>(currentPage),[seed,setSeed]=useState<Project>(()=>restored?.editor??({...newProject(),locale:language})),[current,setCurrent]=useState<Project>(seed),[editorKey,setEditorKey]=useState(0);
 const submittedWizard=useRef<string|undefined>(restored?.returnPage==='studio'?restored?.wizard?.project.id:undefined);
 const [wizardKey,setWizardKey]=useState(0),[items,setItems]=useState<Project[]>([]),[libraryError,setLibraryError]=useState('');
 const [draftSaving,setDraftSaving]=useState(false),[draftError,setDraftError]=useState(false);
 const [paymentNotice,setPaymentNotice]=useState(()=>{const v=readSession<{userId:string;origin:string;credits:number;balance:number;confirmedAt:number}>('aiadcast.checkout-confirmed');return v?.userId===betaSession()?.user.id&&v?.origin===apiIdentity()&&Number.isFinite(v.confirmedAt)&&Date.now()-v.confirmedAt>=0&&Date.now()-v.confirmedAt<60000?v:undefined;});
 useEffect(()=>{
  if(!paymentNotice)return;
  const clear=()=>{sessionStorage.removeItem('aiadcast.checkout-confirmed');setPaymentNotice(undefined);};
  if(!['create','studio','editor'].includes(page)){clear();return;}
  const timer=setTimeout(clear,Math.max(0,60000-(Date.now()-paymentNotice.confirmedAt)));return()=>clearTimeout(timer);
 },[page,paymentNotice]);
 const [switchError,setSwitchError]=useState('');const [generationIntent,setGenerationIntent]=useState<string|undefined>();
 const [wizard,setWizard]=useState<WizardDraft|undefined>(restored?.wizard),[wizardSeed,setWizardSeed]=useState(restored?.wizard);
 const [returnPage,setReturnPage]=useState<WorkspaceDraft['returnPage']>(restored?.returnPage??'home');
 useEffect(()=>{if(page==='create'||page==='studio'||page==='editor')setReturnPage(page);},[page]);
 const snapshot:WorkspaceDraft={wizard,editor:current,returnPage};
 async function preserve(){await saveWorkspace(snapshot);}
 // Persist every committed edit immediately: a debounce discarded photos on quick reloads.
 useLayoutEffect(()=>{let active=true;setDraftSaving(true);void saveWorkspace({wizard,editor:current,returnPage}).then(()=>{if(active){setDraftSaving(false);setDraftError(false);}}).catch(()=>{if(active){setDraftSaving(false);setDraftError(true);}});return()=>{active=false;};},[wizard,current,returnPage]);
 useEffect(()=>{const onHash=()=>{const next=currentPage();if(next==='credits'&&priorPage.current!=='credits')creditsBack.current=priorPage.current;if(next==='admin'&&priorPage.current!=='admin')adminBack.current='#'+priorPage.current;priorPage.current=next;setPage(next);window.scrollTo(0,0);};window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash);},[]);
 useEffect(()=>{if(page!=='projects')return;let alive=true;projects().then(p=>{if(alive){setItems(p);setLibraryError('');}}).catch(()=>{if(alive)setLibraryError(text('이 기기의 저장된 작업을 읽지 못했습니다.'));});return()=>{alive=false};},[page]);
 function go(next:Page){location.hash=next;setPage(next);window.scrollTo(0,0);}
 useEffect(()=>{
  const back=(event:Event)=>{
   if(event.defaultPrevented)return;
   // Window-targeted native events run in registration order. Close the active
   // dialog before navigating, using the same cancellable path as Escape.
   const modal=(document.activeElement?.closest('dialog[open]')??Array.from(document.querySelectorAll('dialog[open]')).at(-1)) as HTMLDialogElement|undefined;
   if(modal){event.preventDefault();event.stopImmediatePropagation();if(modal.dispatchEvent(new Event('cancel',{cancelable:true})))modal.close();return;}
   // A native back event can arrive before React handles the new hash.
   if(currentPage()==='credits'){event.preventDefault();go(page==='credits'?creditsBack.current:page);return;}
   if(page==='home')return;
   event.preventDefault();
   if(page!=='studio'&&page!=='editor'){go('home');return;}
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
 async function begin(){try{if(current.presentation==='campaign'||current.generated||JSON.stringify(current)!==JSON.stringify(seed))await saveProject({...current,updatedAt:new Date().toISOString()});setGenerationIntent(undefined);submittedWizard.current=undefined;setWizardSeed(undefined);setWizard(undefined);setWizardKey(k=>k+1);setSwitchError('');go('create');}catch{setSwitchError(text('현재 광고를 보관하지 못해 전환하지 않았습니다. 다시 시도해주세요.'));}}
 function createNavigation(event:React.MouseEvent){if(page!=='create'&&(page==='studio'||page==='editor'||wizard?.project.id===current.id||!!wizard&&wizard.project.id===submittedWizard.current)){event.preventDefault();requestPreviewLeave(()=>void begin());}}
 async function open(p:Project,preferIncoming=false){
  try{const changed=JSON.stringify(current)!==JSON.stringify(seed);const snapshot=changed?{...current,updatedAt:new Date().toISOString()}:current;if(changed)await saveProject(snapshot);if(preferIncoming&&p.id===current.id&&JSON.stringify(p)!==JSON.stringify(current))await saveProject({...snapshot,id:crypto.randomUUID(),name:(snapshot.name+' '+(language==='ko'?'기기 보관본':'local copy')).slice(0,80)});const next=changed&&p.id===current.id&&!preferIncoming?snapshot:p;setSeed(next);setCurrent(next);setEditorKey(k=>k+1);setSwitchError('');go('studio');return true;}
  catch{setSwitchError(text('현재 편집 내용을 저장하지 못해 작업 전환을 멈췄습니다. 편집기로 돌아가 프로젝트 파일을 백업해주세요.'));return false;}
 }
 async function ready(p:Project){const submittedId=p.id;if(p.id===current.id&&current.generated)p=creativeCampaignDraft(p);await saveProject(p);if(!await open(p,true))throw Error(text('현재 작업 저장 실패'));submittedWizard.current=submittedId;setGenerationIntent(crypto.randomUUID());}
 function editDetails(){submittedWizard.current=undefined;setWizardSeed({project:current,step:0});setWizard({project:current,step:0});setWizardKey(k=>k+1);setGenerationIntent(undefined);go('create');}
 async function createCreativeDraft(){
  const next=creativeCampaignDraft(current);submittedWizard.current=undefined;
  await saveProject({...current,updatedAt:new Date().toISOString()});
  setWizardSeed({project:next,step:0});setWizard({project:next,step:0});setWizardKey(k=>k+1);setGenerationIntent(undefined);go('create');
 }
 const simpleStudio=page==='studio'&&current.presentation==='campaign';
 const libraryItems=JSON.stringify(current)!==JSON.stringify(seed)?[current,...items.filter(p=>p.id!==current.id)]:items;

 return <div className={`studio-shell ${(page==='editor'||page==='studio'&&!simpleStudio)?'editor-route':''}`}>
  <aside className="app-sidebar"><a href="#home" className="app-brand" aria-label={text("aiadcast 홈")}><Brand/><small>{language==='ko'?'내 브랜드의 광고 제작 파트너':'YOUR CREATIVE PARTNER'}</small></a><nav aria-label={text("주 메뉴")}>{navigation.map(([id,label,Icon])=><a href={'#'+id} onClick={id==='create'?createNavigation:undefined} key={id} aria-current={page===id?'page':undefined}><Icon size={19}/><span>{text(label)}</span>{id==='create'&&<span className="nav-plus">+</span>}</a>)}</nav><div className="sidebar-bottom"><div className="studio-mark"><ShieldCheck size={20}/><span>{text("당신의 상품.")}<br/><strong>{text("당신의 브랜드.")}</strong></span></div><span>aiadcast Studio<br/>by selluplabs</span></div></aside>
  <div className="app-content"><AccountBar preserve={async()=>{await preserve();await saveProject(current);}}/><DemoNotice/>{page==='guide'&&new URLSearchParams(location.search).get('support')==='1'&&<details className="account-drawer"><summary>{language==='ko'?'테스트 계정 · 서버 연결':'Test account & connection'}</summary><OfflineDemoControls preserve={preserve} beforeChange={async()=>{await preserve();await saveWorkspace(snapshot,'guest');}}/>{!offlineDemo()&&<TestConnection preserve={preserve} beforeChange={async()=>{await preserve();await saveWorkspace(snapshot,'guest');}}/>}{!offlineDemo()&&<BetaAccount current={current} onOpen={p=>open(p,true)}/>}</details>}
   {page==='create'&&<p className="workspace-save-state" aria-live="polite">{draftSaving?(language==='ko'?'입력 내용 저장 중…':'Saving your draft…'):draftError?(language==='ko'?'입력 내용 저장 실패':'Draft could not be saved'):(language==='ko'?'입력 내용이 기기에 저장되었습니다.':'Draft saved on this device.')}</p>}
   {draftError&&<p className="wizard-error" role="alert">{text('입력 내용을 기기에 보관하지 못했습니다. 저장 공간을 확인해주세요.')}</p>}
   {switchError&&<p className="wizard-error" role="alert">{switchError}</p>}
   {paymentNotice&&['create','studio','editor'].includes(page)&&<div className="connection-notice" role="status">{language==='ko'?`이용권 ${paymentNotice.credits}개 지급 확인 · 현재 잔액 ${paymentNotice.balance}개.`:`${paymentNotice.credits} credits confirmed · Balance ${paymentNotice.balance}.`}<button type="button" onClick={()=>{sessionStorage.removeItem('aiadcast.checkout-confirmed');setPaymentNotice(undefined);}}>{language==='ko'?'확인':'Dismiss'}</button></div>}
   {(page!=='studio'||simpleStudio)&&page!=='editor'&&<header className="app-header"><a href="#home" className="mobile-brand" aria-label={text("aiadcast 홈")}><Brand/></a><span className="workspace-label">{language==='ko'?'내 상품과 서비스를 위한 광고 작업실':'SELLUPLABS / CREATIVE WORKSPACE'}</span><div className="app-header-actions"><LanguageSwitcher/><PricingDialog/>{betaSession()?.user.role==='admin'&&<a className="account-link" href="#admin">{language==='ko'?'관리자':'Admin'}</a>}<a className="account-link" href={betaSession()?"#credits":"#login"}>{betaSession()?(language==='ko'?'내 이용권':'My Credits'):(language==='ko'?'로그인':'Sign in')}</a></div></header>}

   <div hidden={page!=='home'} className="home-page app-page">
    <section className="premium-home"><h1>{language==='ko'?<><span>내 상품과 서비스를,</span><br/><em>프리미엄 광고로.</em></>:<>Your products and services.<br/><em>Premium ads.</em></>}</h1><p>{language==='ko'?<>사진과 설명을 넣으면,<br/>AI광고가 광고이미지와 문구를 만듭니다.</>:'Add photos and a description. AI creates your ad images and copy.'}</p><HomeShowcase enabled={page==='home'}/><button className="primary-action premium-start" onClick={()=>begin()}>{text('내 광고 만들기')}<ArrowUpRight size={21}/></button></section>
   </div>
   {page==='portfolio'&&<div className="app-page"><PortfolioPage/></div>}
   <div hidden={page!=='create'} className="app-page"><CreateCampaign active={page==='create'} key={wizardKey} onReady={ready} draft={wizardSeed} onDraft={setWizard}/></div>
   <div hidden={page!=='projects'} className="app-page projects-page"><ProjectLibrary items={libraryItems} error={libraryError} onNew={begin} onOpen={p=>void open(p)}/></div>
   <div hidden={page!=='guide'} className="app-page guide-page"><UsageGuide onNew={begin}/></div>
   {(page==='signup'||page==='login')&&<div className="app-page"><EmailAccountPage key={page} mode={page} preserve={preserve} returnPage={returnPage}/></div>}
   {page==='admin'&&<div className="app-page"><AdminPage backHref={adminBack.current}/></div>}
   {page==='credits'&&<div className="app-page"><CreditsPage returnPage={creditsBack.current}/></div>}
   {page==='checkout'&&<div className="app-page"><CheckoutPage preserve={preserve} returnPage={returnPage}/></div>}
   {simpleStudio?<div className="app-page"><SimpleAdResult project={current} change={fn=>setCurrent(p=>fn(p))} onEdit={()=>requestPreviewLeave(editDetails)} onCreativeDraft={createCreativeDraft} autoRequest={generationIntent} onAutoHandled={()=>setGenerationIntent(undefined)}/></div>:(page==='studio'||page==='editor')&&<div className="editor-container"><Editor key={editorKey} initialProject={current} onProjectChange={setCurrent}/></div>}

   {(page!=='studio'||simpleStudio)&&page!=='editor'&&<AppFooter/>}
  </div>
  <nav className="mobile-app-nav" aria-label={text("모바일 메뉴")}>{navigation.map(([id,label,Icon])=><a key={id} href={'#'+id} onClick={id==='create'?createNavigation:undefined} aria-current={page===id?'page':undefined}><Icon size={20}/><span>{text(label)}</span></a>)}</nav>
 </div>;
}

