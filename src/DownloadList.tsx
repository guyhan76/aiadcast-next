import {Image as ImageIcon} from 'lucide-react';
import type {AdCard,Delivery} from './library-cards';
import {hasSavedAcceptedAd} from './generated';
import {readCloudProject} from './Membership';
import {projectEditInput} from './precision-edit-file';
import {useEffect,useRef,useState} from 'react';
import {validAiDimensionReview} from './ai-dimension-display';
import {exportBatch,hasNativeExport} from './batch-export';
import {apiRequest,ApiRequestFailure,verifiedOriginalBlob,type DeliveredArtifact,type GenerationJob} from './generation-client';
import {betaSession,storageNamespace} from './beta-session';
import {readDeviceProject} from './storage';
import {useUiLanguage} from './ui-language';

type Translate=(ko:string,en:string)=>string;

async function original(item:Delivery,lifetime:AbortSignal,consent:()=>boolean){
 lifetime.throwIfAborted();
 const request=new AbortController(),abort=()=>request.abort();
 lifetime.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,90000);
 try{return await readOriginal(item,request.signal,consent);}
 finally{clearTimeout(timer);lifetime.removeEventListener('abort',abort);}
}
async function readOriginal(item:Delivery,signal:AbortSignal,consent:()=>boolean){
 const session=betaSession()?.token,scope=storageNamespace();
 const check=()=>{
  signal.throwIfAborted();
  if(!session||session!==betaSession()?.token||scope!==storageNamespace())throw Error('SESSION_CHANGED');
 };
 check();
 const file=await apiRequest<{
  id:string;projectId:string;artifactId:string;artifact:DeliveredArtifact['artifact'];
  reviewRequired:boolean;dimensionDisplay?:GenerationJob['dimensionDisplay'];dimensionReview?:GenerationJob['dimensionReview'];
 }>('/api/membership/downloads/'+encodeURIComponent(item.id)+'/original',undefined,signal);
 if(file.id!==item.id||!/^[a-f0-9]{64}$/.test(file.artifactId)||typeof file.reviewRequired!=='boolean')throw Error('INVALID_ARTIFACT');
 if(file.dimensionDisplay&&!validAiDimensionReview(file.dimensionReview,file.dimensionDisplay,file.artifactId))throw Error('REVIEW_DIMENSIONS');
 let artifact=file.artifact;
 if(!artifact){
  const project=await readDeviceProject(file.projectId,scope);
  check();
  const generated=project?.generated,asset=generated?.asset;
  if(generated?.jobId!==item.id||!asset||asset.sha256!==file.artifactId)throw Error('ORIGINAL_MISSING');
  artifact={id:asset.sha256,sha256:asset.sha256,width:asset.width,height:asset.height,dataUrl:asset.data};
 }
 const blob=await verifiedOriginalBlob({...file,artifact});
 check();
 if(file.reviewRequired){
  if(!consent())return;
  await apiRequest('/api/generations/'+encodeURIComponent(item.id)+'/accept',
   {artifactId:file.artifactId,...(file.dimensionReview?{dimensionReview:file.dimensionReview}:{})},signal);
 }
 check();
 if(item.reviewRequired||file.reviewRequired)window.dispatchEvent(new Event('aiadcast-cloud-project-change'));
 return originalFile(blob,item.id);
}
function originalFile(blob:Blob,id:string){
 const extension=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
 const stem=hasNativeExport()?crypto.randomUUID().slice(0,8)+'-01':id;
 return new File([blob],'aiadcast-'+stem+'.'+extension,{type:blob.type});
}
function failure(error:unknown,t:Translate){
 const code=error instanceof Error?error.message:'';
 if(code==='PROJECT_EXPIRED'||error instanceof ApiRequestFailure&&error.status===410)return t('다운로드 기한이 지났습니다.','The download has expired.');
 if(code==='ORIGINAL_MISSING'||error instanceof ApiRequestFailure&&error.status===404)return t('서버에서 원본을 찾을 수 없습니다.','The original file could not be found.');
 if(code==='NO_FINISHED_AD')return t('이 보관본은 초안입니다. 광고를 열어 제작을 완료해 주세요.','This backup is a draft. Open it to finish the ad.');
 if(code==='REVIEW_DIMENSIONS'||code==='BACKUP_REVIEW')return t('광고 결과에서 규격 표시를 검수하고 사용을 확정해 주세요.','Review the dimensions and confirm use on the ad result screen.');
 if(['ARTIFACT_MISMATCH','INVALID_ARTIFACT','STORAGE_CONTENT_MISMATCH'].includes(code))return t('원본 파일을 검증하지 못했습니다.','The original file could not be verified.');
 if(code==='EXPORT_FAILED'||code==='EXPORT_TIMEOUT')return t('기기에 저장하지 못했습니다. 다시 시도해 주세요.','Could not save to this device. Please retry.');
 return t('원본을 내려받지 못했습니다. 다시 시도해 주세요.','Could not download the original. Please retry.');
}
type PreviewProps={
 item:Delivery;
 onSave:()=>void;
 onDelete:()=>void;
 saveLabel:string;
 saveDisabled:boolean;
 deleteDisabled:boolean;
 feedback:string;
};
export function DownloadPreview({item,onSave,onDelete,saveLabel,saveDisabled,deleteDisabled,feedback}:PreviewProps){
 const {t}=useUiLanguage(),[image,setImage]=useState(''),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),dialog=useRef<HTMLDialogElement>(null),element=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const ctrl=new AbortController();let started=false;setImage('');setFailed(false);
  const fetchPreview=()=>{if(started)return;started=true;
   void apiRequest<{preview:string}>('/api/membership/downloads/'+encodeURIComponent(item.id)+'/preview',undefined,ctrl.signal).then(r=>{
    if(!ctrl.signal.aborted&&typeof r.preview==='string'&&r.preview.startsWith('data:image/webp;base64,'))setImage(r.preview);else if(!ctrl.signal.aborted)setFailed(true);
   }).catch(()=>{if(!ctrl.signal.aborted)setFailed(true);});
  };
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();fetchPreview();}},{rootMargin:'140px'});
  if(element.current)observer.observe(element.current);
  return ()=>{observer.disconnect();ctrl.abort();};
 },[item.id,attempt]);
 return <><button type="button" ref={element} className="delivery-preview" aria-label={item.name+' '+(failed?t('미리보기 다시 불러오기','Retry preview'):t('미리보기','Preview'))} onClick={()=>{if(image)dialog.current?.showModal();else setAttempt(v=>v+1);}}>
  {image?<img alt="" src={image}/>:<ImageIcon size={24} aria-hidden="true"/>}</button>
  {image&&<dialog ref={dialog} className="delivery-lightbox" aria-label={item.name}>
   <button type="button" onClick={()=>dialog.current?.close()}>{t('닫기','Close')}</button>
   <img src={image} alt={item.name}/>
   <div className="preview-actions">
    <button type="button" disabled={saveDisabled} onClick={onSave}>{saveLabel}</button>
    <button type="button" disabled={deleteDisabled} onClick={onDelete}>{t('삭제','Delete')}</button>
   </div>
   {feedback&&<p role="status">{feedback}</p>}
  </dialog>}</>;
}
export async function cardOriginal(card:AdCard,signal:AbortSignal,consent:()=>boolean){
 signal.throwIfAborted();
 const project=card.project??(!card.delivery&&card.backups.length?await readCloudProject(card.backups[0].id,signal):undefined);
 if(project&&hasSavedAcceptedAd(project)&&!card.delivery?.reviewRequired){
  const input=await projectEditInput(project);
  let blob:Blob;
  if(input.file)blob=input.file;
  else{
   const a=input.asset;
   if(!a)throw Error('INVALID_ARTIFACT');
   try{
    blob=await verifiedOriginalBlob({id:project.generated!.jobId,artifactId:a.sha256,
     artifact:{id:a.sha256,sha256:a.sha256,width:a.width,height:a.height,dataUrl:a.data}});
   }catch(error){
    if(card.delivery)return original(card.delivery,signal,consent);
    throw error;
   }
  }
  signal.throwIfAborted();
  return originalFile(blob,project.generated!.jobId);
 }
 if(card.delivery)return original(card.delivery,signal,consent);
 throw Error(project?'NO_FINISHED_AD':'ORIGINAL_MISSING');
}
export function useOriginalExport(items:AdCard[],getSignal:()=>AbortSignal){
 const {t}=useUiLanguage();
 const [rows,setRows]=useState<Record<string,string>>({}),[summary,setSummary]=useState('');
 async function saveDownloads(ids:string[]){
  const signal=getSignal();
  if(!signal||signal.aborted)return ids;
  const selected=new Set(ids),targets=items.filter(item=>selected.has(item.id));
  const reviews=targets.filter(item=>item.delivery?.reviewRequired).length;
  const multiple=targets.length>1,native=hasNativeExport();
  if(multiple&&reviews&&!window.confirm(t('선택한 광고 중 미확정 '+reviews+'건을 사용 확정하고 저장할까요? 예약된 이용권이 사용됩니다.','Confirm and save '+reviews+' unconfirmed ads in this selection? Their reserved tickets will be used.')))return ids;
  const singleConsent=()=>window.confirm(t('이 결과를 사용 확정하고 저장할까요? 예약된 이용권이 사용됩니다.','Confirm and save this ad? Its reserved ticket will be used.'));
  const files:File[]=[],preparedIds:string[]=[],saved=new Set<string>();
  setSummary('');
  setRows(prev=>Object.fromEntries(Object.entries(prev).filter(([id])=>!selected.has(id))));
  function report(id:string,value:string){if(!signal?.aborted)setRows(prev=>({...prev,[id]:value}));}
  for(const [index,item] of targets.entries()){
   signal.throwIfAborted();
   try{
    const file=await cardOriginal(item,signal,multiple&&item.delivery?.reviewRequired?()=>true:singleConsent);
    if(!file)continue;
    if(native){
     await exportBatch([file],'save',signal);
     saved.add(item.id);
    }else{
     files.push(file);preparedIds.push(item.id);
    }
   }catch(error){signal.throwIfAborted();report(item.id,failure(error,t));}
   if(multiple&&!signal.aborted)setSummary(t('원본 준비 중 ','Preparing originals ')+(index+1)+' / '+targets.length);
  }
  if(files.length){
   try{
    await exportBatch(files,'save',signal,multiple);
    for(const id of preparedIds)saved.add(id);
   }catch(error){
    signal.throwIfAborted();
    const reason=failure(error,t);
    if(!signal.aborted)setRows(prev=>({...prev,...Object.fromEntries(preparedIds.map(id=>[id,reason]))}));
   }
  }
  signal.throwIfAborted();
  const remaining=ids.filter(id=>!saved.has(id));
  const success=native?t('갤러리 · aiadcast에 저장됨','saved to Pictures/aiadcast'):
   multiple?t('ZIP 다운로드 시작됨','in the ZIP download'):t('다운로드 시작됨','download started');
  if(!multiple&&saved.size)report(targets[0].id,success);
  setSummary([saved.size?t(saved.size+'건 '+success,saved.size+' '+success):'',remaining.length?t('미저장 '+remaining.length+'건',remaining.length+' not saved'):''].filter(Boolean).join(' · '));
  return remaining;
 }
 return {rows,summary,saveDownloads};
}
