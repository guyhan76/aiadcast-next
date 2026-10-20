import {useEffect,useRef,useState} from 'react';
import type {Asset,Project} from './model';
import {apiRequest,ApiRequestFailure,verifiedArtifact,type GenerationJob} from './generation-client';
import {useUiLanguage} from './ui-language';

// A historical image is immutable evidence of an earlier result, not a result
// compatible with today's inputs. Never apply it to the editor or accept a job.
export function HistoricalAdResult({project}:{project:Project}){
 const {t}=useUiLanguage();
 const [asset,setAsset]=useState<Asset|null>(null),[jobs,setJobs]=useState<GenerationJob[]>([]),[selected,setSelected]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const request=useRef<AbortController|null>(null);
 const local=project.generated?.composition==='complete-ad'?project.generated:undefined;
 async function loadJob(id:string,controller:AbortController){
  const {job}=await apiRequest<{job:GenerationJob}>(`/api/generations/${encodeURIComponent(id)}`,undefined,controller.signal);
  if(job.id!==id||job.projectId!==project.id||job.state!=='accepted'||job.composition!=='complete-ad')throw Error('INVALID_HISTORY');
  const image=await verifiedArtifact(job);
  if(!controller.signal.aborted){setAsset(image);setSelected(id);setMessage('');}
 }
 function failure(error:unknown){
  setMessage(error instanceof ApiRequestFailure&&[401,403].includes(error.status)?t('로그인 계정을 확인해주세요.','Check your sign-in account.'):t('저장된 이미지를 불러오지 못했습니다.','Could not load the saved image.'));
 }
 async function recover(id?:string){
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setMessage('');
  try{
   if(id){await loadJob(id,controller);return;}
   // Use the saved job ID when present, including results older than the API's
   // latest-30 list. The authenticated detail endpoint enforces ownership.
   if(local?.jobId){
    try{await loadJob(local.jobId,controller);return;}
    catch(e){if(controller.signal.aborted||e instanceof ApiRequestFailure&&[401,403].includes(e.status))throw e;}
   }
   const history=await apiRequest<{jobs:GenerationJob[]}>(`/api/generations?projectId=${encodeURIComponent(project.id)}`,undefined,controller.signal);
   if(!Array.isArray(history.jobs))throw Error('INVALID_HISTORY');
   const completed=history.jobs.filter(j=>j.projectId===project.id&&j.state==='accepted'&&j.composition==='complete-ad');
   if(controller.signal.aborted)return;setJobs(completed);
   if(!completed.length){setMessage(t('이 프로젝트에서 저장된 완료 이미지를 찾지 못했습니다.','No saved completed image was found for this project.'));return;}
   setSelected(completed[0].id);await loadJob(completed[0].id,controller);
  }catch(e){if(!controller.signal.aborted)failure(e);}
  finally{if(request.current===controller){setBusy(false);request.current=null;}}
 }
 useEffect(()=>{
  const controller=new AbortController();request.current=controller;setAsset(null);setJobs([]);setSelected('');setMessage('');setBusy(true);
  void (async()=>{
   if(local?.asset){
    try{
     const a=local.asset;
     const image=await verifiedArtifact({artifact:{...a,id:a.sha256,dataUrl:a.data,role:local.role},artifactId:a.sha256,id:local.jobId});
     if(controller.signal.aborted)return;setAsset(image);setBusy(false);setMessage('');return;
    }catch{/* Missing or damaged local bytes can be recovered from completed history. */}
   }
   if(!controller.signal.aborted)void recover();
  })();
  return()=>{controller.abort();request.current?.abort();};
 },[project.id,local?.asset?.data,local?.jobId]);
 async function download(){
  if(!asset)return;
  const blob=await (await fetch(asset.data)).blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='aiadcast-previous-original.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 return <section className="historical-ad" aria-label={t('과거 완료 결과','Previous completed result')}>
  {jobs.length>1&&<label>{t('완료 기록 선택','Choose completed result')}<select value={selected} disabled={busy} onChange={e=>{setAsset(null);setSelected(e.target.value);void recover(e.target.value);}}>{jobs.map(j=><option key={j.id} value={j.id}>{new Date(j.createdAt).toLocaleString()} · {j.id}</option>)}</select></label>}
  {asset&&<><img src={asset.data} alt={t('과거에 생성한 광고 원본','Previously generated ad original')} style={{display:'block',maxWidth:'100%',height:'auto'}}/><button onClick={()=>void download()}>{t('원본 저장 · 공유','Save / share original')}</button></>}
  {busy&&<p role="status">{t('과거 완료 결과 확인 중…','Checking completed history…')}</p>}
  {message&&<p role="status">{message}</p>}
  {!asset&&<button disabled={busy} onClick={()=>void recover(selected||undefined)}>{t('과거 결과 다시 확인','Retry previous result')}</button>}
 </section>;
}
