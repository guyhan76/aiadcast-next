import {exportBatch} from './batch-export';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {SelectiveComparison} from './SelectiveComparison';
import {verifiedPreservation,type SelectivePreservation} from './selective-preservation';
import {apiRequest,ApiRequestFailure,verifiedArtifact,verifiedOriginalBlob,type GenerationJob,type CreditQuote} from './generation-client';
import {storageNamespace} from './beta-session';
import type {Asset,Project} from './model';
import {saveProjectCopy} from './storage';
import {generatedCompatibilityKey} from './generated';
import {generationSourceHash} from './generation-input';
import {completeAdKey} from './complete-ad';
import {useUiLanguage} from './ui-language';
import './selective-image-editor.css';
type Pending={requestId:string;projectId:string;sourceHash:string;maskHash?:string;jobId?:string};
export function SelectiveImageEditor({source,project,quote,onClose,uploaded,reduced}:{source:Pick<GenerationJob,'id'|'artifactId'|'artifact'|'projectId'>;project:Project;quote:CreditQuote;onClose:()=>void;uploaded?:Asset;reduced?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [preservation,setPreservation]=useState<SelectivePreservation|null>(null),inspection=useRef(0);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 const {t}=useUiLanguage(),lock=useRef(false),alive=useRef(true),owner=useRef(storageNamespace()),snapshot=useRef(project),controller=useRef(new AbortController());
 const latest=useRef(project);latest.current=project;const initialSource=useRef(source.id+source.artifactId),latestSource=useRef(source.id+source.artifactId);latestSource.current=source.id+source.artifactId;
 const key=owner.current+':selective-edit:'+source.id;
 const pending=useRef<Pending|null>(null),[job,setJob]=useState<GenerationJob|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[prompt,setPrompt]=useState(''),[ready,setReady]=useState(false),[original,setOriginal]=useState(''),[result,setResult]=useState(''),[saved,setSaved]=useState(false);
 const valid=()=>alive.current&&owner.current===storageNamespace()&&snapshot.current===latest.current&&initialSource.current===latestSource.current;
 const remember=(v:Pending|null)=>{pending.current=v;if(v)localStorage.setItem(key,JSON.stringify(v));else localStorage.removeItem(key);};
 useEffect(()=>{alive.current=true;controller.current=new AbortController();let cancelled=false;void verifiedArtifact(source).then(a=>{if(!cancelled){setOriginal(a.data);setReady(true);}}).catch(()=>setMessage(t('원본을 확인하지 못했습니다.','Cannot verify original.')));try{const p=JSON.parse(localStorage.getItem(key)??'null');if(p?.sourceHash===source.artifactId&&typeof p.requestId==='string'&&typeof p.projectId==='string'){pending.current=p;void recover();}}catch{}const exit=()=>{alive.current=false;controller.current.abort();onClose();};window.addEventListener('aiadcast-session-change',exit);window.addEventListener('hashchange',exit);return()=>{cancelled=true;alive.current=false;controller.current.abort();window.removeEventListener('aiadcast-session-change',exit);window.removeEventListener('hashchange',exit);};},[]);
 function matches(next:GenerationJob){return !!pending.current&&next.projectId===pending.current.projectId&&(!pending.current.jobId||next.id===pending.current.jobId)&&(next.requestId===pending.current.requestId||next.requestIds?.includes(pending.current.requestId))&&next.selectiveEdit?.sourceProjectId===source.projectId&&next.selectiveEdit?.sourceJobId===source.id&&next.selectiveEdit?.sourceHash===source.artifactId&&(!pending.current.maskHash||pending.current.maskHash===next.selectiveEdit?.maskHash);}
 function inspect(next:GenerationJob){return next.artifact&&next.selectiveEdit?verifiedPreservation(next.preservation,{sourceHash:source.artifactId!,maskHash:next.selectiveEdit.maskHash,resultHash:next.artifactId!,width:source.artifact!.width,height:source.artifact!.height}):null;}
 async function show(next:GenerationJob){if(!valid()||!matches(next)||next.projectId!==pending.current?.projectId||next.selectiveEdit?.sourceJobId!==source.id||next.selectiveEdit?.sourceHash!==source.artifactId)return;const epoch=++inspection.current;setJob(next);setMessage('');setPreservation(null);setResult('');if(['failed','rejected','expired','refunded'].includes(next.state)){remember(null);setMessage(next.errorCode==='EDIT_NO_CHANGE'?t('수정된 픽셀이 없어 시안을 제공하지 않았습니다. 원본은 유지되며 이용권은 차감하지 않습니다.','No pixels changed, so no edited visual was delivered. Original preserved; no customer credits charged.'):t('이 수정 요청은 종료됐습니다. 원본은 유지됩니다.','This edit request ended. Original preserved.'));return;}if(next.artifact){const a=await verifiedArtifact(next);if(valid()&&inspection.current===epoch){setResult(a.data);const proof=a.width===source.artifact?.width&&a.height===source.artifact?.height?inspect(next):null;setPreservation(proof);}}}
 async function recover(){if(lock.current||!pending.current)return;lock.current=true;setBusy(true);try{let id=pending.current.jobId;if(!id){const found=await apiRequest<{jobId:string|null;projectId:string}>(`/api/selective-edits/requests/${encodeURIComponent(pending.current.requestId)}?sourceJobId=${encodeURIComponent(source.id)}`,undefined,controller.current.signal);if(!valid()||!pending.current)return;if(!found.jobId){setMessage(t('아직 접수 기록이 없습니다. 잠시 후 다시 확인해주세요.','No submission record yet. Check again shortly.'));return;}id=found.jobId;remember({...pending.current,projectId:found.projectId,jobId:id});}const r=await apiRequest<{job:GenerationJob}>(`/api/generations/${encodeURIComponent(id)}`,undefined,controller.current.signal);await show(r.job);}catch{if(valid())setMessage(t('결과를 아직 확인하지 못했습니다. 새로 요청하지 않고 조회만 합니다.','Result unknown. Only checking the same request.'));}finally{lock.current=false;if(valid())setBusy(false);}}
 useEffect(()=>{
  if(!job||!['running','uncertain'].includes(job.state))return;
  const interval=window.setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)void recover();},3000);
  const timeout=window.setTimeout(()=>{window.clearInterval(interval);if(valid())setMessage(t('자동 확인이 지연되고 있습니다. 같은 요청 결과 확인으로 다시 조회해주세요.','Automatic checking is delayed. Check the same request again.'));},120000);
  return()=>{window.clearInterval(interval);window.clearTimeout(timeout);};
 },[job?.id,job?.state]);
 async function submit(){
  if(saved||lock.current||pending.current||localStorage.getItem(key)||!ready||!prompt.trim())return;
  if(!window.confirm(chargeConfirmation))return;
  lock.current=true;setBusy(true);setMessage('');
  try{
   if(!valid()||document.visibilityState!=='visible')return;
   const mask={mode:'instruction'};
   const p={requestId:crypto.randomUUID(),projectId:crypto.randomUUID(),sourceHash:source.artifactId!};
   remember(p);const r=await apiRequest<{job:GenerationJob}>(uploaded?'/api/selective-edits/upload':'/api/selective-edits',{...(uploaded?{original:{width:uploaded.width,height:uploaded.height,sha256:uploaded.sha256,dataUrl:uploaded.data}}:{}),requestId:p.requestId,projectId:p.projectId,sourceHash:p.sourceHash,sourceJobId:source.id,prompt:prompt.trim(),mask,creditQuote:quote},controller.current.signal);if(valid()){if(r.job.selectiveEdit?.sourceJobId!==source.id||r.job.selectiveEdit?.sourceHash!==source.artifactId)throw Error('SOURCE_MISMATCH');remember({...p,projectId:r.job.projectId,jobId:r.job.id});await show(r.job);}}catch(error){if(valid()&&error instanceof ApiRequestFailure&&['UNSUPPORTED_EDIT_SIZE','UNSUPPORTED_EDIT_MODEL','REGION_EDIT_NOT_AVAILABLE','INVALID_EDIT_REQUEST','INVALID_EDIT_SOURCE','INVALID_IMAGE','GENERATION_ALREADY_RUNNING','STORAGE_LIMIT','CREDIT_RESERVATION_FAILED','INVALID_EDIT_MASK','EMPTY_EDIT_MASK','BUDGET_NOT_AVAILABLE','NO_TEST_CREDITS','CREDIT_QUOTE_CHANGED'].includes(error.code))remember(null);if(valid())setMessage(error instanceof ApiRequestFailure&&error.code==='UNSUPPORTED_EDIT_SIZE'?t('이 이미지의 크기를 처리할 수 없습니다.','This image size could not be processed.'):pending.current?t('접수 결과를 확인해주세요. 자동으로 다시 요청하지 않습니다.','Check submission status. No automatic resubmission.'):error instanceof ApiRequestFailure&&error.code==='CREDIT_QUOTE_CHANGED'?t('차감액이 변경됐습니다. 편집을 다시 열어 금액을 확인해 주세요.','The price changed. Reopen the editor for a new quote.'):t('요청을 보내지 못했습니다. 다시 시도해 주세요.','Could not send the request. Please retry.'));}finally{lock.current=false;if(valid())setBusy(false);}}
 async function download(){
  const signal=controller.current.signal;
  const blob=await verifiedOriginalBlob(job!);
  if(!valid())return;
  await exportBatch([new File([blob],`aiadcast-${job!.artifactId!.slice(0,8)}-01.png`,{type:'image/png'})],'save',signal);
 }
 async function save(){if(saved){try{await download();}catch{if(valid())setMessage(t("PNG 저장을 다시 시도해주세요.","Please retry the PNG download."));}return;}if(lock.current||!job?.artifact||!result||!pending.current||!preservation||preservation.changedSelectedPixels===0)return;lock.current=true;setBusy(true);try{const r=job.state==='accepted'?{job}:await apiRequest<{job:GenerationJob}>(`/api/generations/${job.id}/accept`,{artifactId:job.artifactId},controller.current.signal);if(!valid()||!matches(r.job)||r.job.state!=='accepted'||r.job.artifactId!==job.artifactId||!inspect(r.job))throw Error('RESULT_MISMATCH');setJob(r.job);const a=await verifiedArtifact(r.job);if(!valid())return;const copy:Project={...structuredClone(project),id:pending.current.projectId,adBatch:undefined,resultSet:undefined,requestedImageCount:1,name:project.name.slice(0,60)+t(' · 수정 사본',' · Edited copy'),updatedAt:new Date().toISOString(),generated:{editParent:{jobId:source.id,projectId:source.projectId,artifactId:source.artifactId!},jobId:r.job.id,sourceHash:generationSourceHash(project),mode:'creative',role:'creative',asset:a,model:r.job.model,createdAt:r.job.createdAt,acceptedAt:new Date().toISOString(),specificationKey:generatedCompatibilityKey(project),composition:'complete-ad',compositionKey:completeAdKey(project)}};const inserted=await saveProjectCopy(copy,owner.current,controller.current.signal);if(!valid())return;remember(null);setSaved(true);window.dispatchEvent(new Event("aiadcast-project-copy-saved"));await download();setMessage(inserted?t('새 프로젝트와 PNG 사본을 저장했습니다. 원본은 유지됩니다.','Saved a new project and PNG copy. Original preserved.'):t('기존 수정 사본을 덮어쓰지 않고 PNG를 저장했습니다.','Existing edited project preserved; PNG downloaded.'));}catch{if(valid())setMessage(t('저장을 완료하지 못했습니다. 같은 결과를 다시 확인해주세요.','Save incomplete. Check the same result again.'));}finally{lock.current=false;if(valid())setBusy(false);}}
 async function reject(){if(lock.current||!job||job.state!=='ready')return;lock.current=true;setBusy(true);try{const r=await apiRequest<{job:GenerationJob}>(`/api/generations/${job.id}/reject`,{},controller.current.signal);if(valid()){if(!matches(r.job)||r.job.state!=='rejected')throw Error('RESULT_MISMATCH');setJob(r.job);setResult('');remember(null);setMessage(t('수정 시안을 반려했습니다. 원본은 유지됩니다.','Edit rejected. Original preserved.'));}}catch{if(valid())setMessage(t('반려 결과를 확인해주세요.','Check rejection status.'));}finally{lock.current=false;if(valid())setBusy(false);}}
 const jobStatus:Record<GenerationJob['state'],string>={running:t('수정 시안 생성 중','Generating edit'),uncertain:t('요청 상태 확인 중','Checking request status'),ready:t('수정 결과 검토','Review edited result'),accepted:t('사용 확정','Accepted'),rejected:t('반려됨','Rejected'),failed:t('실패','Failed'),expired:t('만료됨','Expired'),refunded:t('환급됨','Refunded')};
 const charge=quote.amount===0?t('0 크레딧','0 credits'):quote.unit==='credit-v2'?t(quote.amount+' 크레딧',quote.amount+' credits'):t('이용권 '+quote.amount+'장',quote.amount+' ticket');
 const chargeConfirmation=quote.amount===0?t('차감 0 크레딧으로 수정을 시작할까요?','Start the edit at no charge (0 credits)?'):
  quote.unit==='credit-v2'?t('수정본이 제공되면 '+charge+'이 차감됩니다. 수정을 시작할까요?','Start editing? '+charge+' will be charged on delivery.'):
  t('사용 확정 시 이용권 '+quote.amount+'장이 차감됩니다. 수정을 시작할까요?','Start editing? '+charge+' will be charged on acceptance.');
 const working=!!pending.current&&!result;
 return createPortal(<dialog ref={dialog} className="selective-editor" onCancel={e=>{e.preventDefault();onClose();}} aria-label={t('정밀 편집','Precision edit')}>
  <header><h2>{t('정밀 편집','Precision edit')}</h2><button type="button" aria-label={t('닫기','Close')} onClick={onClose}>×</button></header>
  {result?<SelectiveComparison original={original} result={result} width={source.artifact!.width} height={source.artifact!.height}/>:
   original&&<img className="edit-original" src={original} alt={t('원본 광고','Original ad')}/>}
  {!result&&!working&&<>
   {reduced&&<p>{t('편집용 이미지','Working image')} · {source.artifact?.width} × {source.artifact?.height}</p>}
   <label>{t('무엇을 바꿀까요?','What would you like to change?')}<textarea maxLength={2000} value={prompt} disabled={busy} onChange={e=>setPrompt(e.target.value)} placeholder={t('예: 가격을 599,000원으로 바꾸고 하늘을 화창하게 해주세요.','For example, change the price to $599 and make the sky sunny.')}/></label>
   <button className="primary-action" disabled={!ready||busy||!prompt.trim()} onClick={()=>void submit()}>{t('수정하기','Edit')} · {charge}</button>
  </>}
  {working&&<div role="status"><p>{job?jobStatus[job.state]:t('수정 요청 확인 중…','Checking your edit…')}</p>{!busy&&<button onClick={()=>void recover()}>{t('결과 확인','Check result')}</button>}</div>}
  {result&&<div className="edit-decisions">
   <button className="primary-action" disabled={busy||!preservation?.changedSelectedPixels} onClick={()=>void save()}>{saved?t('이미지 다시 저장','Download again'):t('수정본 사용 · 저장','Accept and save edit')}</button>
   {job?.state==='ready'&&<button disabled={busy} onClick={()=>void reject()}>{t('원본 유지','Keep original')}</button>}
   {!preservation?.changedSelectedPixels&&<p role="alert">{t('수정 결과를 확인하지 못했습니다.','Could not verify the edit.')} <button onClick={()=>void recover()}>{t('다시 확인','Retry')}</button></p>}
  </div>}
  {message&&<p role="status">{message}</p>}
 </dialog>,document.body);
}
