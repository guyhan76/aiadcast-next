import {Image as ImageIcon} from 'lucide-react';
import {useLibrarySelection} from './LibrarySelection';
import {useEffect,useRef,useState} from 'react';
import {validAiDimensionReview} from './ai-dimension-display';
import {exportBatch,hasNativeExport} from './batch-export';
import {apiRequest,ApiRequestFailure,verifiedOriginalBlob,type GenerationJob} from './generation-client';
import {useUiLanguage} from './ui-language';

export type Delivery={id:string;name:string;expiresAt:string;reviewRequired:boolean};
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
 const path='/api/generations/'+encodeURIComponent(item.id);
 const {job}=await apiRequest<{job:GenerationJob}>(path,undefined,signal);
 if(job.state==='expired')throw Error('PROJECT_EXPIRED');
 if(!['ready','accepted'].includes(job.state)||!job.artifact?.dataUrl)throw Error('ORIGINAL_MISSING');
 if(job.dimensionDisplay&&!validAiDimensionReview(job.dimensionReview,job.dimensionDisplay,job.artifactId!))throw Error('REVIEW_DIMENSIONS');
 const blob=await verifiedOriginalBlob(job);
 signal.throwIfAborted();
 if(item.reviewRequired&&job.state==='ready'&&!job.creditCaptured&&job.creditPolicy!=='admin-unlimited'){
  if(!consent())return;
  await apiRequest(path+'/accept',{artifactId:job.artifactId,...(job.dimensionReview?{dimensionReview:job.dimensionReview}:{})},signal);
 }
 signal.throwIfAborted();
 const extension=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
 const stem=hasNativeExport()?crypto.randomUUID().slice(0,8)+'-01':item.id;
 return new File([blob],'aiadcast-'+stem+'.'+extension,{type:blob.type});
}
function failure(error:unknown,t:Translate){
 const code=error instanceof Error?error.message:'';
 if(code==='PROJECT_EXPIRED'||error instanceof ApiRequestFailure&&error.status===410)return t('다운로드 기한이 지났습니다.','The download has expired.');
 if(code==='ORIGINAL_MISSING'||error instanceof ApiRequestFailure&&error.status===404)return t('서버에서 원본을 찾을 수 없습니다.','The original file could not be found.');
 if(code==='REVIEW_DIMENSIONS')return t('광고 결과에서 규격 표시를 검수하고 사용을 확정해 주세요.','Review the dimensions and confirm use on the ad result screen.');
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
function DownloadPreview({item,onSave,onDelete,saveLabel,saveDisabled,deleteDisabled,feedback}:PreviewProps){
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
export function DownloadList({items,onRemoved}:{items:Delivery[];onRemoved:(ids:string[])=>void}){
 const {language,t}=useUiLanguage();
 const [limit,setLimit]=useState(5),[rows,setRows]=useState<Record<string,string>>({}),[summary,setSummary]=useState('');
 const [busy,setBusy]=useState<Set<string>>(new Set()),[all,setAll]=useState(false);
 const singles=useRef(new Map<string,Promise<File|undefined>>()),batch=useRef(false),active=useRef<AbortController|null>(null);
 useEffect(()=>{const ctrl=new AbortController();active.current=ctrl;return ()=>ctrl.abort();},[]);
 function message(id:string,value:string){setRows(prev=>({...prev,[id]:value}));}
 const selection=useLibrarySelection(items.map(item=>item.id),async ids=>{
  const signal=active.current?.signal;
  if(!signal||signal.aborted||batch.current||singles.current.size)throw Error('BUSY');
  for(let i=0;i<ids.length;i+=15){
   const group=ids.slice(i,i+15);
   await apiRequest('/api/membership/remove-downloads',{ids:group},signal);
   if(!signal.aborted)onRemoved(group);
  }
 },'downloads');
 const saved=()=>hasNativeExport()?t('갤러리 · aiadcast에 저장됨','Saved to Pictures/aiadcast'):t('다운로드 시작됨','Download started');
 async function save(item:Delivery){
  const signal=active.current?.signal;
  if(!signal||signal.aborted||selection.busy||batch.current||singles.current.has(item.id))return;
  message(item.id,'');setSummary('');
  const work=(async()=>{
   try{
    const file=await original(item,signal,
     ()=>window.confirm(t('이 결과를 사용 확정하고 저장할까요? 예약된 이용권이 사용됩니다.','Confirm use and save the original? Your reserved ticket will be used.')));
    if(file){await exportBatch([file],'save',signal);if(!signal.aborted)message(item.id,saved());}
    return file;
   }catch(error){if(!signal.aborted)message(item.id,failure(error,t));}
  })();
  singles.current.set(item.id,work);setBusy(new Set(singles.current.keys()));
  try{await work;}finally{singles.current.delete(item.id);if(!signal.aborted)setBusy(new Set(singles.current.keys()));}
 }
 async function saveAll(){
  const signal=active.current?.signal;
  if(!signal||signal.aborted||selection.busy||batch.current||!items.length)return;
  const inFlight=new Map(singles.current);
  const reviews=items.filter(item=>item.reviewRequired&&!inFlight.has(item.id)).length;
  if(reviews&&!window.confirm(t('미확정 '+reviews+'건을 포함해 전체 저장할까요? 사용 확정 시 예약된 이용권이 사용됩니다.','Save all, including '+reviews+' unconfirmed results? Confirming use spends their reserved tickets.')))return;
  batch.current=true;setAll(true);setSummary('');
  const native=hasNativeExport(),files:File[]=[];
  let done=0;
  try{
   for(const [index,item] of items.entries()){
    signal.throwIfAborted();
    const existing=inFlight.get(item.id);
    try{
     const file=existing?await existing:await original(item,signal,()=>true);
     if(file){
      if(native){if(!existing)await exportBatch([file],'save',signal);done++;}
      else files.push(file);
      if(!signal.aborted)message(item.id,native?saved():'');
     }
    }catch(error){if(!signal.aborted)message(item.id,failure(error,t));}
    if(!signal.aborted)setSummary(t('원본 준비 중 ','Preparing originals ')+(index+1)+' / '+items.length);
   }
   if(!native&&files.length){
    await exportBatch(files,'save',signal,true);
    done=files.length;
   }
   if(!signal.aborted){
    const result=done?t(done+'건 '+(native?'갤러리에 저장됨':'ZIP 다운로드 시작됨'),done+(native?' saved to Pictures/aiadcast':' in the ZIP download')):'';
    const missed=items.length-done;
    setSummary([result,missed?t('미저장 '+missed+'건',missed+' not saved'):''].filter(Boolean).join(' · '));
   }
  }catch(error){if(!signal.aborted)setSummary(failure(error,t));}
  finally{batch.current=false;if(!signal.aborted)setAll(false);}
 }
 return <>
  <div className="download-actions"><p className="download-notice">{t('새 광고는 생성 후 24시간 동안 다운로드할 수 있습니다.','New ads are available to download for 24 hours after creation.')}</p>
   <button type="button" className="library-more" disabled={all||selection.editing||selection.busy} onClick={()=>void saveAll()}>{t('전체 저장','Save all')}</button></div>
  {!all&&!busy.size&&selection.tools}
  {summary&&<p role="status" className="download-feedback">{summary}</p>}
  <ul className="download-list delivery-list">{items.slice(0,limit).map(item=>{
   const saving=busy.has(item.id);
   const saveLabel=saving?t('저장 중…','Saving…'):item.reviewRequired?t('사용 확정 후 저장','Confirm and save'):t('원본 저장','Save original');
   return <li key={item.id}>
   <DownloadPreview item={item} onSave={()=>void save(item)} onDelete={()=>void selection.erase([item.id])}
    saveLabel={saveLabel} saveDisabled={all||saving||selection.busy||selection.editing}
    deleteDisabled={all||busy.size>0||selection.busy||selection.editing} feedback={selection.error||rows[item.id]||''}/><div><strong>{item.name||t('이름 없는 광고','Untitled ad')}</strong>
    <time dateTime={item.expiresAt}>{t('기한','Until')} {new Date(item.expiresAt).toLocaleString(language==='ko'?'ko-KR':'en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>
    {rows[item.id]&&<span role="status" className="download-feedback">{rows[item.id]}</span>}</div>
   {selection.editing?<input type="checkbox" aria-label={item.name+' '+t('선택','select')} checked={selection.selected.has(item.id)} disabled={selection.busy} onChange={()=>selection.toggle(item.id)}/>:<button type="button" disabled={all||busy.has(item.id)} onClick={()=>void save(item)}>{saveLabel}</button>}
  </li>;})}</ul>
  {limit<items.length&&<button type="button" className="library-more" onClick={()=>setLimit(n=>n+5)}>{t('다운로드 더 보기','Show more downloads')}</button>}
 </>;
}
