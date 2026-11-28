import type {Delivery,CloudProject} from './library-cards';
import {useEffect,useState} from 'react';
import {apiRequest} from './generation-client';
import {betaSession,setBetaSession,storageNamespace} from './beta-session';
import {forgetLoginProvider} from './verified-login';
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
export function Withdrawal({onCancel}:{onCancel:()=>void}){
 const [requestRefund,setRequestRefund]=useState(false);
 const {t}=useUiLanguage(),[busy,setBusy]=useState(false),[error,setError]=useState('');

 async function withdraw(){
  setBusy(true);const scope=storageNamespace();
  try{const r=await apiRequest<{receipt:string;cases?:string[]}>('/api/membership/withdraw',{confirm:'delete-my-account',...(requestRefund?{requestRefund:true}:{})});
   if(storageNamespace()!==scope)return;
   forgetLoginProvider();
   setBetaSession(null,'login');
   const lines=[t('탈퇴 요청을 접수했습니다.','Account deletion requested.'),t('삭제 처리번호','Deletion receipt')+' '+r.receipt];
   if(r.cases?.length)lines.push(t('환불 접수번호','Refund receipt')+' '+r.cases.join(', '));
   window.alert(lines.join('\n'));
  }catch{setError(t('접수 상태를 확인하지 못했습니다. 다시 로그인하거나 삭제 안내 페이지에서 문의해주세요.','Could not confirm the request. Sign in again or contact support on the deletion page.'));}
  finally{setBusy(false);}
 }
 return <section className="membership-withdraw" aria-labelledby="workspace-menu-title">
  <p className="withdrawal-warning">{t('aiadcast 서버의 프로젝트, 첨부 원본, 이미지·영상 작업 정보가 삭제됩니다.','Your projects, uploads and image and video job data will be deleted from aiadcast servers.')}</p>
  <p>{t('남은 이용권은 재가입해도 이전되지 않습니다.','Unused credits will not transfer if you sign up again.')}</p>
  <label className="withdrawal-refund"><input type="checkbox" disabled={busy} checked={requestRefund} onChange={e=>setRequestRefund(e.target.checked)}/>{t('미사용 유료 이용권 환불 검토 요청','Request a refund review for unused paid credits')}</label>
  <details><summary>{t('탈퇴 전 확인사항','Before you leave')}</summary>
   <p>{t('필요한 파일과 결제 내역, 접수번호를 먼저 저장하세요. 기기에 저장하거나 공유한 파일은 유지됩니다.','Save any files, payment records and receipt numbers you need. Downloaded and shared copies remain available.')}</p>
   <p>{t('단순 변심 환불은 신청 기한 내 구매만 검토합니다. 결제 오류·생성 실패·법정 해지는 탈퇴 전 내 이용권에서 문의해 주세요.','Change-of-mind refunds are reviewed for purchases within the request period. For payment errors, failed generations or statutory cancellations, contact support in My Credits before leaving.')} <a href="#credits">{t('내 이용권','My Credits')}</a></p>
   <p>{t('TOPVIEW에 전송된 참조 이미지와 생성 영상의 보관 및 삭제 문의는 아래 안내에서 확인하세요.','See the details below for retention and deletion requests covering TOPVIEW references and videos.')}</p>
   <a href="/account-deletion.html" target="_blank" rel="noreferrer">{t('삭제 범위와 보관 기간','Deletion and retention details')}</a>
  </details>
  {error&&<p role="alert">{error}</p>}
  <div className="withdrawal-actions">
   <button type="button" disabled={busy} onClick={onCancel}>{t('취소','Cancel')}</button>
   <button type="button" disabled={busy} onClick={()=>void withdraw()}>{busy?t('접수 중…','Submitting…'):t('탈퇴하기','Delete account')}</button>
  </div>
 </section>;
}
