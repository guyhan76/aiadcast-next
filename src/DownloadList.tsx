import {Image as ImageIcon} from 'lucide-react';
import type {AdCard,Delivery} from './library-cards';
import {useWebFileShare} from './WebFileShare';
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
 onShare:()=>void;
 saveLabel:string;
 saveDisabled:boolean;
 deleteDisabled:boolean;
 feedback:string;
};
function useDeliveryThumbnail(id:string){
 const [image,setImage]=useState(''),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),element=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  setImage('');setFailed(false);
  const ctrl=new AbortController();let started=false;
  const fetchPreview=()=>{if(started)return;started=true;
   void apiRequest<{preview:string}>('/api/membership/downloads/'+encodeURIComponent(id)+'/preview',undefined,ctrl.signal).then(r=>{
    if(!ctrl.signal.aborted&&typeof r.preview==='string'&&r.preview.startsWith('data:image/webp;base64,'))setImage(r.preview);else if(!ctrl.signal.aborted)setFailed(true);
   }).catch(()=>{if(!ctrl.signal.aborted)setFailed(true);});
  };
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();fetchPreview();}},{rootMargin:'140px'});
  if(element.current)observer.observe(element.current);
  return ()=>{observer.disconnect();ctrl.abort();};
 },[id,attempt]);
 return {image,failed,element,retry:()=>setAttempt(v=>v+1)};
}
export function DownloadPreview({item,onSave,onDelete,onShare,saveLabel,saveDisabled,deleteDisabled,feedback}:PreviewProps){
 const {t}=useUiLanguage(),dialog=useRef<HTMLDialogElement>(null);
 const {image,failed,element,retry}=useDeliveryThumbnail(item.id);
 return <><button type="button" ref={element} className="delivery-preview" aria-label={item.name+' '+(failed?t('미리보기 다시 불러오기','Retry preview'):t('미리보기','Preview'))} onClick={()=>{if(image)dialog.current?.showModal();else retry();}}>
  {image?<img alt="" src={image}/>:<ImageIcon size={24} aria-hidden="true"/>}</button>
  {image&&<dialog ref={dialog} className="delivery-lightbox" aria-label={item.name}>
   <button type="button" onClick={()=>dialog.current?.close()}>{t('닫기','Close')}</button>
   <img src={image} alt={item.name}/>
   <div className="preview-actions">
    <button type="button" disabled={saveDisabled} onClick={onSave}>{saveLabel}</button>
    <button type="button" disabled={saveDisabled} onClick={onShare}>{t('공유','Share')}</button>
    <button type="button" disabled={deleteDisabled} onClick={onDelete}>{t('삭제','Delete')}</button>
   </div>
   {feedback&&<p role="status">{feedback}</p>}
  </dialog>}</>;
}
export async function cardOriginalWithBrief(card:AdCard,signal:AbortSignal,consent:()=>boolean){
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
    if(card.delivery)return {file:await original(card.delivery,signal,consent),project:project??card.reviewProject};
    throw error;
   }
  }
  signal.throwIfAborted();
  return {file:originalFile(blob,project.generated!.jobId),project};
 }
 if(card.delivery)return {file:await original(card.delivery,signal,consent),project:project??card.reviewProject};
 throw Error(project?'NO_FINISHED_AD':'ORIGINAL_MISSING');
}
export async function cardOriginal(card:AdCard,signal:AbortSignal,consent:()=>boolean){
 return (await cardOriginalWithBrief(card,signal,consent)).file;
}
export function useOriginalExport(items:AdCard[],getSignal:()=>AbortSignal){
 const {t}=useUiLanguage();
 const [rows,setRows]=useState<Record<string,string>>({}),[summary,setSummary]=useState('');
 const webShare=useWebFileShare();
 async function exportOriginals(ids:string[],mode:'save'|'share'){
  const sharing=mode==='share';
  const signal=getSignal();
  if(!signal||signal.aborted)return ids;
  const selected=new Set(ids),targets=items.filter(item=>selected.has(item.id));
  const reviews=targets.filter(item=>item.delivery?.reviewRequired).length;
  const multiple=targets.length>1,native=hasNativeExport();
  if(sharing&&!native&&(typeof navigator.share!=='function'||typeof navigator.canShare!=='function')){
   const reason=t('이 브라우저에서는 원본 저장 후 사진 앱에서 공유해 주세요.','Save the original and share it from your photos app in this browser.');
   setSummary(reason);setRows(prev=>({...prev,...Object.fromEntries(ids.map(id=>[id,reason]))}));return ids;
  }
  const action=sharing?t('공유','share'):t('저장','save');
  if(multiple&&reviews&&!window.confirm(t('선택한 광고 중 미확정 '+reviews+'건을 사용 확정하고 '+action+'할까요? 예약된 이용권이 사용됩니다.','Confirm and '+action+' '+reviews+' unconfirmed ads in this selection? Their reserved tickets will be used.')))return ids;
  const singleConsent=()=>window.confirm(t('이 결과를 사용 확정하고 '+action+'할까요? 예약된 이용권이 사용됩니다.','Confirm and '+action+' this ad? Its reserved ticket will be used.'));
  const files:File[]=[],preparedIds:string[]=[],saved=new Set<string>();
  setSummary('');
  setRows(prev=>Object.fromEntries(Object.entries(prev).filter(([id])=>!selected.has(id))));
  function report(id:string,value:string){if(!signal?.aborted)setRows(prev=>({...prev,[id]:value}));}
  for(const [index,item] of targets.entries()){
   signal.throwIfAborted();
   try{
    const file=await cardOriginal(item,signal,multiple&&item.delivery?.reviewRequired?()=>true:singleConsent);
    if(!file){if(sharing){setSummary('');return ids;}continue;}
    if(native&&!sharing){
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
    if(sharing&&files.length<targets.length&&!window.confirm(t(targets.length+'장 중 원본을 준비한 '+files.length+'장만 공유할까요?','Share the '+files.length+' available originals out of '+targets.length+' selected?'))){setSummary('');return ids;}
    if(sharing&&!native){
     let opened=0;
     await webShare.share(files,signal,count=>{
      for(const id of preparedIds.slice(opened,opened+count))saved.add(id);
      opened+=count;
     });
    }else{
     await exportBatch(files,mode,signal,multiple);
     for(const id of preparedIds)saved.add(id);
    }
   }catch(error){
    signal.throwIfAborted();
    if(sharing){
     const cancelled=error instanceof Error&&error.name==='AbortError';
     const detail=cancelled?t('공유를 취소했습니다.','Sharing cancelled.'):
      error instanceof Error&&error.message==='SHARE_UNAVAILABLE'?t('이 원본은 브라우저에서 공유할 수 없습니다. 원본 저장 후 사진 앱에서 공유해 주세요.','This browser cannot share this image. Save it and share from your photos app.'):
      t('공유 창을 열지 못했습니다. 다시 시도하거나 원본을 저장해 주세요.','Could not open the share sheet. Retry or save the original.');
     setSummary(detail);
     for(const id of preparedIds)if(!saved.has(id))report(id,detail);
     return ids.filter(id=>!saved.has(id));
    }
    const reason=failure(error,t);
    setRows(prev=>({...prev,...Object.fromEntries(preparedIds.map(id=>[id,reason]))}));
   }
  }
  signal.throwIfAborted();
  const remaining=ids.filter(id=>!saved.has(id));
  if(sharing){
   const opened=t('공유 창에 원본 '+saved.size+'장을 전달했습니다.',saved.size+' originals passed to the share sheet.');
   if(saved.size&&!multiple)report(targets[0].id,opened);
   setSummary([saved.size?opened:'',remaining.length?t('미공유 '+remaining.length+'건',remaining.length+' not shared'):''].filter(Boolean).join(' · '));
   return remaining;
  }
  const success=native?t('갤러리 · aiadcast에 저장됨','saved to Pictures/aiadcast'):
   multiple?t('ZIP 다운로드 시작됨','in the ZIP download'):t('다운로드 시작됨','download started');
  if(!multiple&&saved.size)report(targets[0].id,success);
  setSummary([saved.size?t(saved.size+'건 '+success,saved.size+' '+success):'',remaining.length?t('미저장 '+remaining.length+'건',remaining.length+' not saved'):''].filter(Boolean).join(' · '));
  return remaining;
 }
 return {rows,summary,shareDialog:webShare.dialog,saveDownloads:(ids:string[])=>exportOriginals(ids,'save'),shareDownloads:(ids:string[])=>exportOriginals(ids,'share')};
}
