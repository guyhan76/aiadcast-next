import {useState,type ReactNode,useEffect} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {betaSession,setBetaSession,storageNamespace,type BetaSession} from './beta-session';
import {useUiLanguage} from './ui-language';
import {importProject,type Project} from './model';
import {saveProject} from './storage';
import './beta-account.css';
import {signOut} from './sign-out';
export function SessionBoundary({children}:{children:ReactNode}){
 const [scope,setScope]=useState(storageNamespace);
 useEffect(()=>{const update=(event:Event)=>{const route=(event as CustomEvent).detail?.returnPage;location.hash=['home','create','projects','studio','editor','credits','checkout','checkout-return','login','signup'].includes(route)?route:'home';setScope(storageNamespace());};window.addEventListener('aiadcast-session-change',update);return()=>window.removeEventListener('aiadcast-session-change',update);},[]);
 return <div key={scope}>{children}</div>;
}
function revisionKey(id:string){return `aiadcast.cloud-revision:${storageNamespace()}:${id}`;}
export function BetaAccount({current,onOpen}:{current:Project;onOpen:(p:Project)=>Promise<boolean>}){
 const {language}=useUiLanguage(),ko=language==='ko',t=(k:string,e:string)=>ko?k:e;
 const [opened,setOpened]=useState(false),[invite,setInvite]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [remote,setRemote]=useState<{id:string;revision:number;name:string;updated:string}[]>([]);
 const session=betaSession();
 const error=(e:unknown)=>{const code=e instanceof ApiRequestFailure?e.code:'';setMessage(code==='PROJECT_CONFLICT'?t('다른 기기에서 변경한 작업이 있습니다. 서버 작업을 열어 확인하거나 별도 프로젝트로 저장해주세요.','This project changed on another device. Open the server copy or save a separate project.'):code==='AUTH_REQUIRED'||code==='INVALID_INVITE'?t('초대코드가 만료되었거나 사용할 수 없습니다. 새 초대코드를 받아 로그인해주세요.','Your code or session has expired. Sign in with a new invitation.'):t('서버에 연결하거나 저장하지 못했습니다. 기기의 작업은 유지됩니다.','Could not connect or save. Your local work is unchanged.'));};
 async function run(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(e){error(e);}finally{setBusy(false);}}
 async function list(){const result=await apiRequest<{projects:typeof remote}>('/api/projects');setRemote(result.projects);}
 async function login(){await saveProject(current);const result=await apiRequest<BetaSession>('/api/auth/login',{invite:invite.trim()});setBetaSession(result);}
 async function logout(){await signOut(()=>saveProject(current),'home');}
 async function save(){await saveProject(current);const key=revisionKey(current.id),revision=Number(sessionStorage.getItem(key)??0);const result=await apiRequest<{revision:number}>('/api/projects/'+current.id,{project:current,revision});sessionStorage.setItem(key,String(result.revision));await list();setMessage(t('서버에 저장했습니다. 다른 기기에서도 이어서 열 수 있습니다.','Saved to the server. You can open it on another device.'));}
 async function open(id:string){const result=await apiRequest<{project:Project;revision:number}>('/api/projects/'+id);const parsed=await importProject(result.project);const p={...parsed,id,updatedAt:new Date().toISOString()};if(!await onOpen(p))throw Error('LOCAL_SAVE_FAILED');await saveProject(p);sessionStorage.setItem(revisionKey(id),String(result.revision));setOpened(false);}
 return <div className="beta-account"><button className="beta-account-trigger" onClick={()=>{setOpened(!opened);if(!opened&&session)void run(list);}}>{session?t('내 계정','My account'):t('테스트 로그인','Test sign-in')}</button>{opened&&<section className="beta-account-panel" aria-label={t('테스트 계정','Test account')}><div className="beta-account-heading"><strong>{session?session.user.label:t('초대받은 사용자로 시작','Join with an invitation')}</strong><button aria-label={t('계정 닫기','Close account')} onClick={()=>setOpened(false)}>×</button></div>{!session?<form onSubmit={e=>{e.preventDefault();void run(login);}}><p>{t('초대코드로 로그인하면 광고를 서버에 보관할 수 있습니다. 현재는 비공개 테스트입니다.','Sign in with an invitation to keep your ads on the server. This is a private test.')}</p><label>{t('초대코드','Invitation code')}<input type="password" autoComplete="off" value={invite} onChange={e=>setInvite(e.target.value)} maxLength={43}/></label><button disabled={busy||invite.trim().length!==43}>{t('로그인','Sign in')}</button></form>:<><p>{t('기기 저장과 서버 저장은 별도입니다. 수정한 작업은 아래 버튼으로 서버에 저장하세요.','Local and server saves are separate. Save your edits to the server below.')}</p><div className="beta-account-actions"><button disabled={busy} onClick={()=>void run(save)}>{t('현재 작업 서버 저장','Save current project to server')}</button><button disabled={busy} onClick={()=>void run(list)}>{t('목록 새로고침','Refresh list')}</button></div><ul>{remote.map(p=><li key={p.id}><button disabled={busy} onClick={()=>void run(()=>open(p.id))}>{p.name||t('이름 없는 광고','Untitled ad')}<small>{t('서버 작업 열기','Open server copy')} · v{p.revision}</small></button></li>)}</ul>{remote.length===0&&<p>{t('서버에 저장한 광고가 없습니다.','No ads saved on the server yet.')}</p>}<button disabled={busy} onClick={()=>void run(logout)}>{t('로그아웃','Sign out')}</button></>}{message&&<p role="status">{message}</p>}</section>}</div>;
}

