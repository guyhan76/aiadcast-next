import {saveCloudSnapshot} from './membership-client';
import {useEffect,useState} from 'react';
import {apiRequest,ApiRequestFailure} from './generation-client';
import {betaSession,setBetaSession,storageNamespace} from './beta-session';
import {offlineDemo} from './demo-mode';
import {importProject,type Project} from './model';
import {useUiLanguage} from './ui-language';

type Policy={plan:'free'|'standard';usedBytes:number;limitBytes:number};
type CloudProject={id:string;name:string;expiresAt:string;revision:number};
const changed='aiadcast-cloud-project-change';
function usePolicy(enabled:boolean){
 const [value,setValue]=useState<Policy|null>(null);
 useEffect(()=>{if(!enabled||offlineDemo()||!betaSession())return;let live=true;
  const refresh=()=>{void apiRequest<Policy>('/api/membership').then(v=>{if(live)setValue(v);}).catch(()=>{if(live)setValue(null);});};
  refresh();window.addEventListener(changed,refresh);return()=>{live=false;window.removeEventListener(changed,refresh);};
 },[enabled]);return value;
}
export function SaveCloudProject({project}:{project:Project}){
 const {t}=useUiLanguage(),policy=usePolicy(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(!policy)return null;
 if(policy.plan==='free')return <p>{t('무료회원 · 나중에 보려면 이 기기에 저장하세요.','Free plan · Save a copy on this device for later.')}</p>;
 async function save(){
  setBusy(true);setMessage('');
  try{await saveCloudSnapshot(project);setMessage(t('내 프로젝트에 저장했습니다.','Saved to My projects.'));
  }catch(e){setMessage(e instanceof ApiRequestFailure&&e.code==='PROJECT_CONFLICT'?t('다른 기기에 저장된 버전이 있습니다. 내 프로젝트에서 서버 보관본을 먼저 열어주세요.','Open the latest server copy from My projects first.'):t('서버에 저장하지 못했습니다. 보관 용량을 확인하거나 기기에 저장하세요.','Could not save to the server. Check storage or save to your device.'));}
  finally{setBusy(false);}
 }
 return <div><button type="button" disabled={busy} onClick={()=>void save()}>{t('내 프로젝트에 저장','Save to My projects')}</button>{message&&<p role="status">{message}</p>}</div>;
}
export function CloudLibrary({onOpen}:{onOpen:(p:Project)=>Promise<boolean>}){
 const {t}=useUiLanguage(),policy=usePolicy(true),[items,setItems]=useState<CloudProject[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!policy)return;let live=true;apiRequest<{projects:CloudProject[]}>('/api/projects').then(v=>{if(live){setItems(v.projects);setError('');}}).catch(()=>{if(live)setError(t('서버 목록을 불러오지 못했습니다.','Could not load server projects.'));});return()=>{live=false;};},[policy]);
 if(!policy&&!error)return null;
 async function open(item:CloudProject){
  setBusy(true);setError('');
  try{const data=await apiRequest<{project:Project;revision:number}>('/api/projects/'+item.id);
   const p={...await importProject(data.project),id:item.id};if(await onOpen(p))sessionStorage.setItem('aiadcast.cloud-revision:'+storageNamespace()+':'+p.id,String(data.revision));
  }catch{setError(t('보관본을 열지 못했습니다. 목록을 다시 확인해주세요.','Could not open this copy. Check the list again.'));}finally{setBusy(false);}
 }
 async function remove(item:CloudProject){
  if(!window.confirm(t('이 서버 보관본을 삭제할까요?','Delete this server copy?')))return;
  setBusy(true);try{await apiRequest('/api/membership/remove-project',{id:item.id});sessionStorage.removeItem('aiadcast.cloud-revision:'+storageNamespace()+':'+item.id);window.dispatchEvent(new Event(changed));}
  catch{setError(t('삭제하지 못했습니다. 다시 시도해주세요.','Deletion failed. Try again.'));}finally{setBusy(false);}
 }
 return <section className="membership-panel"><h2>{t('서버 보관함','Server storage')}</h2>
 <p>{policy?.plan==='standard'?t('일반회원 · 최초 저장일부터 30일','Standard · 30 days from first save')+' · '+(Number(policy.usedBytes)/1e6).toFixed(1)+' / 500 MB':t('무료회원 · 새 광고는 기기에 저장하고 공유할 수 있습니다.','Free plan · Save and share new ads on your device.')}</p>
 {items.map(item=><div key={item.id} className="membership-row"><button disabled={busy} onClick={()=>void open(item)}>{item.name} · {new Date(item.expiresAt).toLocaleDateString()} {t('삭제 예정','expires')}</button><button disabled={busy} onClick={()=>void remove(item)}>{t('삭제','Delete')}</button></div>)}{error&&<p role="alert">{error}</p>}</section>;
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
 return <details className="admin-card" onToggle={e=>{if(e.currentTarget.open)void refresh();}}><summary>{t('가입·탈퇴 이력 및 보관 등급','Membership history and storage plans')}</summary>
 {data?.members.map(m=><div key={m.id} className="membership-row"><span>{labels.find(l=>l.id===m.id)?.label} · {m.joined_at?new Date(m.joined_at).toLocaleString():t('기존 회원 · 가입일 미기록','Existing member · join date unavailable')}</span>{m.role==='admin'?t('관리자','Admin'):<select aria-label={t('보관 등급','Storage plan')} value={m.storage_plan} disabled={busy} onChange={e=>void plan(m.id,e.target.value)}><option value="free">{t('무료회원','Free')}</option><option value="standard">{t('일반회원','Standard')}</option></select>}</div>)}
 <button onClick={()=>void refresh()}>{t('새로고침','Refresh')}</button><ul>{data?.events.map(e=><li key={e.receipt+e.kind}>{new Date(e.happened_at).toLocaleString()} · {names[e.kind]} · {e.receipt}</li>)}</ul>{error&&<p role="alert">{error}</p>}</details>;
}
