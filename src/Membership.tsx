import type {Delivery,CloudProject} from './library-cards';
import {useEffect,useState} from 'react';
import {apiRequest} from './generation-client';
import {betaSession,setBetaSession,storageNamespace} from './beta-session';
import {offlineDemo} from './demo-mode';
import {importProject,type Project} from './model';
import {useUiLanguage} from './ui-language';

const changed='aiadcast-cloud-project-change';
export function DownloadDeadline({value}:{value?:string}){
 const {t}=useUiLanguage();
 return value?<small>{t('서버 다운로드 기한','Server download deadline')} · <time dateTime={value}>{new Date(value).toLocaleString()}</time></small>:null;
}
export function useCloudAds(enabled:boolean){
 const {t}=useUiLanguage();
 const [backups,setBackups]=useState<CloudProject[]>([]),[downloads,setDownloads]=useState<Delivery[]>([]);
 const [error,setError]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(enabled);
 const token=enabled?betaSession()?.token:undefined;
 const retry=()=>setRefresh(n=>n+1);
 useEffect(()=>{
  if(!token)return;
  const controller=new AbortController(),signal=controller.signal;
  setLoading(true);setError('');
  void Promise.allSettled([
   apiRequest<{projects:CloudProject[]}>('/api/projects',undefined,signal).then(r=>{if(!signal.aborted)setBackups(r.projects);}),
   apiRequest<{downloads:Delivery[]}>('/api/membership/downloads',undefined,signal).then(r=>{if(!signal.aborted)setDownloads(r.downloads);})
  ]).then(results=>{
   if(signal.aborted)return;
   if(results.some(r=>r.status==='rejected'))setError(t('서버 목록 일부를 불러오지 못했습니다.','Some server projects could not be loaded.'));
   setLoading(false);
  });
  window.addEventListener(changed,retry);
  return ()=>{controller.abort();window.removeEventListener(changed,retry);};
 },[token,refresh]);
 async function remove(downloadIds:string[],backupIds:string[],signal:AbortSignal){
  for(let i=0;i<downloadIds.length;i+=15){
   const ids=downloadIds.slice(i,i+15);
   await apiRequest('/api/membership/remove-downloads',{ids},signal);
   if(!signal.aborted)setDownloads(list=>list.filter(item=>!ids.includes(item.id)));
  }
  for(const id of backupIds){
   await apiRequest('/api/membership/remove-project',{id},signal);
   if(!signal.aborted)setBackups(list=>list.filter(item=>item.id!==id));
  }
 }
 return {backups,downloads,error,retry,loading,remove};
}

export async function readCloudProject(id:string,signal:AbortSignal){
 const data=await apiRequest<{project:Project}>('/api/projects/'+encodeURIComponent(id),undefined,signal);
 return {...await importProject(data.project),id};
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
