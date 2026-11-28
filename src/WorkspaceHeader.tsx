import {Withdrawal} from './Membership';
import {offlineDemo} from './demo-mode';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Menu,X} from 'lucide-react';
import {BrandLogo} from './BrandLogo';
import {AccountBar} from './AccountBar';
import {LanguageSwitcher,useUiLanguage} from './ui-language';
import {PricingDialog} from './PricingDialog';
import {betaSession} from './beta-session';
import './workspace-header.css';
type Props={onHome:React.MouseEventHandler<HTMLAnchorElement>;preserve:()=>Promise<void>;history:{canBack:boolean;canForward:boolean;back:()=>void;forward:()=>void}};
export function WorkspaceHeader({onHome,preserve,history}:Props){
 const {t}=useUiLanguage(),[open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [withdrawal,setWithdrawal]=useState(false);
 const withdrawalTrigger=useRef<HTMLButtonElement>(null),title=useRef<HTMLHeadingElement>(null);
 function close(){dialog.current?.close();setOpen(false);}
 function backToMenu(){setWithdrawal(false);requestAnimationFrame(()=>withdrawalTrigger.current?.focus());}
 useEffect(()=>{if(withdrawal)title.current?.focus();},[withdrawal]);
 useEffect(()=>{
  if(!open)return;
  const d=dialog.current!;d.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const leave=()=>close();window.addEventListener('hashchange',leave);window.addEventListener('aiadcast-session-change',leave);
  return()=>{window.removeEventListener('hashchange',leave);window.removeEventListener('aiadcast-session-change',leave);document.body.style.overflow=overflow;if(d.open)d.close();trigger.current?.focus({preventScroll:true});};
 },[open]);
 return <header className="app-header compact-workspace-header">
  <a href="#home" onClick={onHome} className="mobile-brand" aria-label={t('aiadcast 홈','aiadcast home')}><BrandLogo/></a>
  <div className="compact-header-controls"><nav className="screen-history" aria-label={t('화면 이동','Screen history')}><button type="button" title={t('뒤로','Back')} aria-label={t('뒤로','Back')} disabled={!history.canBack} onClick={history.back}><ArrowLeft size={19} aria-hidden="true"/></button><button type="button" title={t('앞으로','Forward')} aria-label={t('앞으로','Forward')} disabled={!history.canForward} onClick={history.forward}><ArrowRight size={19} aria-hidden="true"/></button></nav>
  <button ref={trigger} className="workspace-menu-trigger" type="button" aria-label={t('메뉴 열기','Open menu')} aria-expanded={open} aria-haspopup="dialog" aria-controls="workspace-menu" onClick={()=>{setWithdrawal(false);setOpen(true);}}><Menu size={23} aria-hidden="true"/></button></div>
  <dialog ref={dialog} id="workspace-menu" className="workspace-menu" aria-labelledby="workspace-menu-title" onKeyDown={e=>{if(e.key!=='Tab'||(e.target as Element).closest('dialog')!==e.currentTarget)return;const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),select:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')).filter(el=>el.getClientRects().length>0);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}} onCancel={e=>{if(e.target!==e.currentTarget)return;if(withdrawal){e.preventDefault();backToMenu();}else setOpen(false);}} onClose={e=>{if(e.target===e.currentTarget)setOpen(false);}} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}}>
   <div className="workspace-menu-heading"><h2 id="workspace-menu-title" ref={title} tabIndex={-1}>{withdrawal?t('회원 탈퇴','Delete account'):t('메뉴','Menu')}</h2><button type="button" aria-label={t('메뉴 닫기','Close menu')} onClick={close}><X size={22} aria-hidden="true"/></button></div>
   {withdrawal&&open?<Withdrawal onCancel={backToMenu}/>:<>
   <AccountBar preserve={preserve}/>
   <div className="workspace-menu-options"><LanguageSwitcher/><PricingDialog/>{betaSession()?.user.role==='admin'&&<a href="#admin" onClick={close}>{t('관리자','Admin')}</a>}<a href={betaSession()?'#credits':'#login'} onClick={close}>{betaSession()?t('내 이용권','My Credits'):t('로그인','Sign in')}</a></div>
   <div className="workspace-menu-policy">
    <details>
     <summary>{t('사업자정보','Business information')}</summary>
     <p>셀업랩스 주식회사<br/>{t('통신판매업 신고번호','Mail-order business registration number')} <span>제2026-서울마포-2946호</span></p>
    </details>
    <a href="https://www.selluplabs.com/privacy/" target="_blank" rel="noreferrer">{t('개인정보처리방침','Privacy policy')}</a>
    <a href="/account-deletion.html" target="_blank" rel="noreferrer">{t('자료 보관 안내','Data retention')}</a>
    {open&&!offlineDemo()&&betaSession()&&<button className="withdrawal-trigger" type="button" ref={withdrawalTrigger} onClick={()=>setWithdrawal(true)}>{t('회원탈퇴','Delete account')}</button>}
   </div></>}
  </dialog>
 </header>;
}
