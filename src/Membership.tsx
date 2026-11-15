import {DownloadList,type Delivery} from './DownloadList';
import {useEffect,useState} from 'react';
import {apiRequest} from './generation-client';
import {betaSession,setBetaSession,storageNamespace} from './beta-session';
import {offlineDemo} from './demo-mode';
import {importProject,type Project} from './model';
import {useUiLanguage} from './ui-language';

type CloudProject={id:string;name:string;expiresAt:string;revision:number};
const changed='aiadcast-cloud-project-change';
export function DownloadDeadline({value}:{value?:string}){
 const {t}=useUiLanguage();
 return value?<small>{t('서버 다운로드 기한','Server download deadline')} · <time dateTime={value}>{new Date(value).toLocaleString()}</time></small>:null;
}
function LibraryExpiry({value}:{value:string}){
 const {language,t}=useUiLanguage(),locale=language==='ko'?'ko-KR':'en-US';
 const date=new Date(value);
 return <time dateTime={value} title={date.toLocaleString(locale)}>{t('기한','Until')} {date.toLocaleString(locale,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>;
}
const downloadPageSize=5;
export function CloudLibrary({onOpen}:{onOpen:(p:Project)=>Promise<boolean>}){
 const {t}=useUiLanguage(),[items,setItems]=useState<CloudProject[]>([]),[downloads,setDownloads]=useState<Delivery[]>([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 const [loaded,setLoaded]=useState(false),[shownProjects,setShownProjects]=useState(downloadPageSize);
 const token=betaSession()?.token;
 useEffect(()=>{
  if(!token||offlineDemo())return;
  const controller=new AbortController();
  Promise.all([apiRequest<{projects:CloudProject[]}>('/api/projects',undefined,controller.signal),
   apiRequest<{downloads:Delivery[]}>('/api/membership/downloads',undefined,controller.signal)]).then(([legacy,current])=>{
    if(!controller.signal.aborted){setItems(legacy.projects);setDownloads(current.downloads);setError('');}
   }).catch(()=>{if(!controller.signal.aborted)setError(t('다운로드 목록을 불러오지 못했습니다.','Could not load downloads.'));}).finally(()=>{if(!controller.signal.aborted)setLoaded(true);});
  const update=()=>setRefresh(n=>n+1);window.addEventListener(changed,update);
  return ()=>{controller.abort();window.removeEventListener(changed,update);};
 },[token,refresh]);
 if(!token||offlineDemo())return null;
 async function open(item:CloudProject){
  setBusy(true);setError('');
  try{const data=await apiRequest<{project:Project;revision:number}>('/api/projects/'+item.id);
   const p={...await importProject(data.project),id:item.id};await onOpen(p);
  }catch{setError(t('보관본을 열지 못했습니다. 목록을 다시 확인해주세요.','Could not open this copy. Check the list again.'));}finally{setBusy(false);}
 }
 async function remove(item:CloudProject){
  if(!window.confirm(t('이 서버 보관본을 삭제할까요?','Delete this server copy?')))return;
  setBusy(true);try{await apiRequest('/api/membership/remove-project',{id:item.id});window.dispatchEvent(new Event(changed));}
  catch{setError(t('삭제하지 못했습니다. 다시 시도해주세요.','Deletion failed. Try again.'));}finally{setBusy(false);}
 }
 return <section className="download-library" aria-label={t('다운로드 목록','Available downloads')}>
  {!loaded&&<p role="status">{t('불러오는 중…','Loading…')}</p>}
  {loaded&&!error&&!downloads.length&&!items.length&&<p className="download-empty">{t('다운로드할 파일이 없습니다.','No files to download.')}</p>}
  {downloads.length>0&&<DownloadList key={token} items={downloads} onRemoved={ids=>setDownloads(prev=>prev.filter(item=>!ids.includes(item.id)))}/>}
  {items.length>0&&<>
   <h2>{t('이전 보관본','Previously saved projects')}</h2>
   <ul className="download-list">{items.slice(0,shownProjects).map(item=><li key={item.id}>
    <div><button type="button" className="legacy-open" disabled={busy} onClick={()=>void open(item)}>{item.name||t('이름 없는 광고','Untitled ad')}</button><LibraryExpiry value={item.expiresAt}/></div>
    <button type="button" disabled={busy} onClick={()=>void remove(item)}>{t('삭제','Delete')}</button>
   </li>)}</ul>
   {shownProjects<items.length&&<button type="button" className="library-more" onClick={()=>setShownProjects(n=>n+downloadPageSize)}>{t('보관본 더 보기','Show more saved projects')}</button>}
  </>}
  {error&&<p role="alert">{error} <button type="button" className="library-more" onClick={()=>setRefresh(n=>n+1)}>{t('다시 확인','Retry')}</button></p>}
 </section>;
}
export function Withdrawal(){
 const {t}=useUiLanguage(),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(offlineDemo()||!betaSession())return null;
 async function withdraw(){
  setBusy(true);const scope=storageNamespace();
  try{const r=await apiRequest<{receipt:string}>('/api/membership/withdraw',{confirm:'delete-my-account'});
   if(storageNamespace()!==scope)return;
   setBetaSession(null,'login');window.alert(t('탈퇴 요청을 접수했습니다. 모든 기기의 계정 접근이 해제되었습니다. 삭제 처리번호 ','Deletion requested. Access is revoked on all devices. Receipt ')+r.receipt);
  }catch{setError(t('접수 상태를 확인하지 못했습니다. 다시 로그인하거나 삭제 안내 페이지에서 문의해주세요.','Could not confirm the request. Sign in again or contact support on the deletion page.'));}
  finally{setBusy(false);}
 }
 return <div className="membership-withdraw">{!confirm?<button onClick={()=>setConfirm(true)}>{t('회원탈퇴','Delete account')}</button>:<>
  <strong>{t('탈퇴하면 내 프로젝트를 복구할 수 없습니다.','Your server projects cannot be recovered after withdrawal.')}</strong>
  <p>{t('서버의 프로젝트, 첨부 원본, 생성 이미지와 영상이 삭제됩니다. 필요한 파일은 먼저 내려받으세요. 기기에 저장하거나 공유한 파일은 유지됩니다.','Server projects, originals, generated images and videos will be deleted. Download anything you want to keep. Device and shared copies remain.')}</p>
  <a href="/account-deletion.html" target="_blank" rel="noreferrer">{t('삭제 범위와 보관 기간','Deletion and retention details')}</a>
  <div><button disabled={busy} onClick={()=>setConfirm(false)}>{t('취소','Cancel')}</button><button disabled={busy} onClick={()=>void withdraw()}>{t('모든 프로젝트 삭제 및 탈퇴','Delete all projects and my account')}</button></div></>}{error&&<p role="alert">{error}</p>}</div>;
}
type Audit={events:{receipt:string;kind:'joined'|'requested'|'completed'|'retry';happened_at:string}[];members:{id:string;joined_at:string|null;role:string;storage_plan:'free'|'standard'}[]};
export function MemberHistory({labels}:{labels:{id:string;label:string}[]}){
 const {t}=useUiLanguage(),[data,setData]=useState<Audit|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const names={joined:t('가입 완료','Joined'),requested:t('탈퇴 접수','Withdrawal requested'),completed:t('삭제 완료','Deleted'),retry:t('삭제 재시도 중','Retrying deletion')};
 async function refresh(){try{setData(await apiRequest<Audit>('/api/membership/admin'));setError('');}catch{setError(t('이력을 불러오지 못했습니다.','Could not load membership history.'));}}
 async function plan(id:string,value:string){setBusy(true);try{await apiRequest('/api/membership/plan',{userId:id,plan:value});await refresh();}catch{setError(t('등급을 변경하지 못했습니다.','Could not update membership.'));}finally{setBusy(false);}}
 return <details className="admin-card" onToggle={e=>{if(e.currentTarget.open)void refresh();}}><summary>{t('가입·탈퇴 이력 및 회원 등급','Membership history and plans')}</summary>
 {data?.members.map(m=><div key={m.id} className="membership-row"><span>{labels.find(l=>l.id===m.id)?.label} · {m.joined_at?new Date(m.joined_at).toLocaleString():t('기존 회원 · 가입일 미기록','Existing member · join date unavailable')}</span>{m.role==='admin'?t('관리자','Admin'):<select aria-label={t('회원 등급','Membership plan')} value={m.storage_plan} disabled={busy} onChange={e=>void plan(m.id,e.target.value)}><option value="free">{t('무료회원','Free')}</option><option value="standard">{t('일반회원','Standard')}</option></select>}</div>)}
 <button onClick={()=>void refresh()}>{t('새로고침','Refresh')}</button><ul>{data?.events.map(e=><li key={e.receipt+e.kind}>{new Date(e.happened_at).toLocaleString()} · {names[e.kind]} · {e.receipt}</li>)}</ul>{error&&<p role="alert">{error}</p>}</details>;
}
