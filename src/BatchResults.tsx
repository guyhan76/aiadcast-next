import {Check, Download, Share2} from 'lucide-react';
import {saveProjectSet} from './storage';
import {PrecisionEditAction} from './PrecisionEditAction';
import {useEffect,useRef,useState} from 'react';
import type {Project} from './model';
import type {AdBatch} from './batch-price';
import {apiRequest,verifiedArtifact,type GenerationJob} from './generation-client';
import {dimensionInputHash,projectAiDimensionKey,aiDimensionRequested,parseAiDimensionDisplay,validAiDimensionReview} from './ai-dimension-display';
import {buildGenerationRequest} from './generation';
import {generationMatchKey} from './generation-match';
import {completeAdKey} from './complete-ad';
import {generatedCompatibilityKey,projectWithGenerated} from './generated';
import {generationSourceHash} from './generation-input';
import {render} from './render';
import {manualBaseExport} from './dimension-annotation';
import {exportBatch} from './batch-export';
import {storageNamespace} from './beta-session';
import {useUiLanguage} from './ui-language';
import './ad-batch.css';

type Preview={file:File;url:string;artifact:string;item:Project;accepted:boolean};
type Summary={id:string;jobs:GenerationJob[]};
export function BatchResults({project,batch,onEdit,renderDetail}:{project:Project;batch:AdBatch;onEdit:()=>void;renderDetail:(item:Project,back:()=>void)=>React.ReactNode}){
 const {t}=useUiLanguage(),[jobs,setJobs]=useState<GenerationJob[]>([]),[images,setImages]=useState<Record<string,Preview>>({});
 const [selected,setSelected]=useState<string[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0);
 const [detail,setDetail]=useState<Project>(),[busy,setBusy]=useState(false),lock=useRef(false),lifetime=useRef(new AbortController());
 const source=useRef(project),cache=useRef<Record<string,Preview>>({}),confirmed=useRef(new Map<string,GenerationJob>()),autoSelected=useRef(false),owner=useRef(storageNamespace());
 const [reviews,setReviews]=useState<Record<string,NonNullable<GenerationJob['dimensionReview']>>>({});
 const [reviewItem,setReviewItem]=useState<string>();
 const [zoom,setZoom]=useState<string>(),zoomDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(zoom||reviewItem)zoomDialog.current?.showModal();},[zoom,reviewItem]);
 useEffect(()=>{
  const session=new AbortController();lifetime.current=session;
  const cancel=()=>session.abort();window.addEventListener('aiadcast-session-change',cancel);window.addEventListener('hashchange',cancel);
  return()=>{cancel();window.removeEventListener('aiadcast-session-change',cancel);window.removeEventListener('hashchange',cancel);Object.values(cache.current).forEach(im=>URL.revokeObjectURL(im.url));cache.current={};};
 },[]);
 useEffect(()=>{
  const controller=new AbortController(),owner=storageNamespace();let timer:ReturnType<typeof setTimeout>;
  const live=()=>!controller.signal.aborted&&!lifetime.current.signal.aborted&&owner===storageNamespace();
  async function poll(){
   try{
    const p=source.current,signal=controller.signal;
    const result=await apiRequest<Summary>('/api/ad-batches/'+batch.id,undefined,signal);
    if(!live())return;
    if(result.id!==batch.id||result.jobs.length!==batch.count||result.jobs.some((j,i)=>j.projectId!==batch.id+'-'+(i+1)))throw Error('INVALID_BATCH');
    setJobs(result.jobs);
    const fingerprint=await dimensionInputHash(generationMatchKey(buildGenerationRequest(p)));
    for(const [index,summary] of result.jobs.entries()){
     if(!live())return;
     const cached=cache.current[summary.id];
     if(!['accepted','ready'].includes(summary.state)||cached?.artifact===summary.artifactId&&(summary.state!=='accepted'||cached?.accepted))continue;
     const {job}=await apiRequest<{job:GenerationJob}>('/api/generations/'+summary.id,undefined,signal);
     if(job.id!==summary.id||job.projectId!==summary.projectId||job.requestFingerprint!==fingerprint||job.composition!=='complete-ad'||job.compositionKey!==completeAdKey(p)||job.sourceHash!==generationSourceHash(p)||!job.artifact)throw Error('INVALID_ARTIFACT');
     const asset=await verifiedArtifact(job),display=await parseAiDimensionDisplay(job.dimensionDisplay);
     if(aiDimensionRequested(p)?display?.inputKey!==projectAiDimensionKey(p):!!display)throw Error('INVALID_ARTIFACT');
     const composed=projectWithGenerated({...p,id:job.projectId},{...(job.inputMode?{inputMode:job.inputMode}:{}),downloadExpiresAt:job.downloadExpiresAt,jobId:job.id,mode:job.mode,sourceHash:job.sourceHash,asset,role:job.artifact.role,model:job.model,createdAt:job.createdAt,specificationKey:generatedCompatibilityKey(p),composition:job.composition,compositionKey:job.compositionKey,...(display?{dimensionDisplay:display}:{}),...(job.dimensionReview?{dimensionReview:job.dimensionReview}:{})});
     const canvas=document.createElement('canvas'),issues=await render(canvas,composed,undefined,manualBaseExport(composed));
     if(issues.length)throw Error('RENDER_FAILED');
     const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG')),'image/png'));
     if(!live())return;
     const file=new File([png],`aiadcast-${batch.id.slice(4,12)}-${String(index+1).padStart(2,'0')}.png`,{type:'image/png'});
     if(cached)URL.revokeObjectURL(cached.url);
     const item={...composed,name:batch.count>1?(composed.name||composed.productName)+' · '+(index+1):composed.name,adBatch:undefined,resultSet:undefined,requestedImageCount:1 as const};
     cache.current[job.id]={file,url:URL.createObjectURL(file),artifact:asset.sha256,item,accepted:job.state==='accepted'};setImages({...cache.current});
     if(batch.count===1&&!autoSelected.current){autoSelected.current=true;setSelected([job.id]);}
    }
    if(live()&&result.jobs.some(j=>j.state==='running'))timer=setTimeout(()=>void poll(),2500);
   }catch{if(live())setError(t('결과를 불러오지 못했습니다. 다시 확인해주세요.','Could not load the results. Check again.'));}
  }
  void poll();return()=>{controller.abort();clearTimeout(timer);};
 },[batch.id,batch.count,retry,detail]);
 const eligible=jobs.filter(j=>images[j.id]&&['accepted','ready'].includes(j.state)&&images[j.id].artifact===j.artifactId);
 const chosen=eligible.filter(j=>selected.includes(j.id));
 const displayed=eligible.find(j=>j.id===(reviewItem??zoom));
 async function deliver(mode:'save'|'share'){
  if(lock.current||!chosen.length)return;
  const unchecked=chosen.find(j=>j.dimensionDisplay&&!validAiDimensionReview(reviews[j.id]??j.dimensionReview,j.dimensionDisplay,j.artifactId!));
  if(unchecked){setReviewItem(unchecked.id);return;}
  const tickets=chosen.reduce((total,j)=>total+(j.creditUnit==='legacy-ticket'&&j.state==='ready'&&!confirmed.current.has(j.id)?j.creditCost??0:0),0);
  if(tickets&&!window.confirm(t(`선택한 광고에 이용권 ${tickets}장이 사용됩니다. 계속할까요?`,`Use ${tickets} tickets for the selected ads?`)))return;
  lock.current=true;setBusy(true);setError('');setNotice('');
  const signal=lifetime.current.signal;
  try{
   const copies:Project[]=[];
   for(const j of chosen){
    const image=images[j.id];
    let receipt=confirmed.current.get(j.id)??j;
    if(receipt.state==='ready'&&(mode==='save'||j.dimensionDisplay||j.creditUnit==='legacy-ticket'&&j.creditCost)){
     const review=reviews[j.id]??j.dimensionReview;
     const response=await apiRequest<{job:GenerationJob}>('/api/generations/'+j.id+'/accept',{artifactId:j.artifactId,...(review?{dimensionReview:review}:{})},signal);
     receipt=response.job;
     if(receipt?.id!==j.id||receipt.projectId!==j.projectId||receipt.artifactId!==image.artifact||receipt.state!=='accepted'||j.dimensionDisplay&&!validAiDimensionReview(receipt.dimensionReview,j.dimensionDisplay,image.artifact))throw Error('INVALID_RECEIPT');
     confirmed.current.set(j.id,receipt);
    }
    if(mode==='save'){
     const now=new Date().toISOString();
     copies.push({...image.item,updatedAt:now,generated:{...image.item.generated!,acceptedAt:now,...(receipt.dimensionReview?{dimensionReview:receipt.dimensionReview}:{})}});
    }
   }
   if(copies.length){await saveProjectSet(copies,owner.current,signal);window.dispatchEvent(new Event('aiadcast-project-copy-saved'));}
   await exportBatch(chosen.map(j=>images[j.id].file),mode,signal);
   if(!signal.aborted)setNotice(mode==='save'?t('저장한 광고에서 다시 열 수 있습니다.','Available in Saved ads.'):t('공유할 앱에서 전송을 완료해주세요.','Finish sharing in the selected app.'));
  }catch(e){if(!signal.aborted&&!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error&&e.message==='SHARE_UNAVAILABLE'?t('이 브라우저는 파일 공유를 지원하지 않습니다. 저장을 이용해주세요.','This browser cannot share files. Use Save.'):t('완료하지 못했습니다. 선택한 이미지로 다시 시도해주세요.','Could not finish. Retry with the selected images.'));}
  finally{lock.current=false;if(!signal.aborted)setBusy(false);}
 }
 function back(){setDetail(undefined);setRetry(n=>n+1);}
 if(detail)return <>{renderDetail(detail,back)}</>;
 const count=eligible.length;
 return <section className="batch-results"><header className="gallery-heading"><h2>{t('생성된 광고 이미지','Generated ad images')}</h2>
  {batch.count>1&&<label><input type="checkbox" disabled={busy||!count} checked={!!count&&chosen.length===count} onChange={e=>setSelected(e.target.checked?eligible.map(j=>j.id):[])}/>{t('전체 선택','Select all')}</label>}</header>
  {!jobs.length&&!error&&<p role="status">{t('이미지 불러오는 중…','Loading images…')}</p>}
  <ol className="batch-grid">{jobs.map((j,i)=>{const image=images[j.id],available=eligible.some(x=>x.id===j.id);return <li key={j.id}>
   {available?<><button className="gallery-image" type="button" aria-label={t(`${i+1}번 이미지 확대`,`Enlarge image ${i+1}`)} onClick={()=>setZoom(j.id)}><img src={image.url} alt={t(`광고 ${i+1} 미리보기`,`Ad ${i+1} preview`)} /></button>
   <label className="gallery-pick"><input type="checkbox" aria-label={t(`광고 ${i+1}`,`Ad ${i+1}`)} checked={selected.includes(j.id)} disabled={busy} onChange={e=>setSelected(ids=>e.target.checked?[...ids,j.id]:ids.filter(id=>id!==j.id))}/><span aria-hidden="true"><Check size={16}/></span></label></>:<p className="gallery-pending">{t(`광고 ${i+1}`,`Ad ${i+1}`)} · {['ready','accepted','running'].includes(j.state)?t('준비 중…','Preparing…'):t('결과 없음','No image')}</p>}
  </li>})}</ol>
  {error&&<p role="alert">{error} <button onClick={()=>{setError('');setRetry(n=>n+1);}}>{t('다시 확인','Retry')}</button></p>}{notice&&<p role="status">{notice}</p>}
  {jobs.length>0&&!count&&!jobs.some(j=>['running','ready','accepted'].includes(j.state))&&<button onClick={onEdit}>{t('입력 내용 수정','Edit details')}</button>}
  {!!count&&<div className="batch-actions gallery-actions"><span aria-live="polite">{t(`${chosen.length}장 선택`,`${chosen.length} selected`)}</span><button disabled={busy||!chosen.length} aria-label={t(`선택 저장 (${chosen.length})`,`Save selected (${chosen.length})`)} onClick={()=>void deliver('save')}><Download size={17}/>{t('저장','Save')}</button><button disabled={busy||!chosen.length} aria-label={t(`선택 공유 (${chosen.length})`,`Share selected (${chosen.length})`)} onClick={()=>void deliver('share')}><Share2 size={17}/>{t('공유','Share')}</button></div>}
  {displayed&&<dialog className="gallery-preview" ref={zoomDialog} onClose={()=>{setZoom(undefined);setReviewItem(undefined);}} aria-label={reviewItem?t('규격 확인','Check dimensions'):t('광고 미리보기','Ad preview')}>
   <button className="gallery-close" autoFocus onClick={()=>zoomDialog.current?.close()}>{t('닫기','Close')}</button>
   <img src={images[displayed.id].url} alt={t('광고 미리보기','Ad preview')}/>
   {reviewItem&&displayed.dimensionDisplay?<button onClick={()=>{
    setReviews(r=>({...r,[displayed.id]:{inputHash:displayed.dimensionDisplay!.inputHash,artifactHash:displayed.artifactId!,values:true,axes:true,complete:true}}));zoomDialog.current?.close();
   }}>{t('규격의 수치·단위·축·누락 확인 완료','Confirm values, units, axes and completeness')}</button>:<div className="gallery-options"><PrecisionEditAction getInput={()=>({file:images[displayed.id].file,name:project.name})}/><button onClick={()=>{setZoom(undefined);setDetail(confirmed.current.has(displayed.id)||images[displayed.id].accepted?{...images[displayed.id].item,generated:{...images[displayed.id].item.generated!,acceptedAt:displayed.createdAt}}:{...project,id:displayed.projectId,adBatch:undefined,generated:undefined});}}>{t('광고 상세','Ad details')}</button></div>}
  </dialog>}
 </section>;
}
