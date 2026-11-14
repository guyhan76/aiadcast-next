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

type Preview={file:File;url:string;artifact:string};
type Summary={id:string;jobs:GenerationJob[]};
export function BatchResults({project,batch,onEdit,renderDetail}:{project:Project;batch:AdBatch;onEdit:()=>void;renderDetail:(item:Project,back:()=>void)=>React.ReactNode}){
 const {t}=useUiLanguage(),[jobs,setJobs]=useState<GenerationJob[]>([]),[images,setImages]=useState<Record<string,Preview>>({});
 const [selected,setSelected]=useState<string[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0);
 const [detail,setDetail]=useState<Project>(),[busy,setBusy]=useState(false),lock=useRef(false),lifetime=useRef(new AbortController());
 const source=useRef(project),cache=useRef<Record<string,Preview>>({}),exported=useRef(new Set<string>());
 const [zoom,setZoom]=useState<string>(),zoomDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(zoom)zoomDialog.current?.showModal();},[zoom]);
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
     if(!['accepted','ready'].includes(summary.state)||cache.current[summary.id]?.artifact===summary.artifactId)continue;
     const {job}=await apiRequest<{job:GenerationJob}>('/api/generations/'+summary.id,undefined,signal);
     if(job.id!==summary.id||job.projectId!==summary.projectId||job.requestFingerprint!==fingerprint||job.composition!=='complete-ad'||job.compositionKey!==completeAdKey(p)||job.sourceHash!==generationSourceHash(p)||!job.artifact)throw Error('INVALID_ARTIFACT');
     const asset=await verifiedArtifact(job),display=await parseAiDimensionDisplay(job.dimensionDisplay);
     if(aiDimensionRequested(p)?display?.inputKey!==projectAiDimensionKey(p):!!display)throw Error('INVALID_ARTIFACT');
     const composed=projectWithGenerated({...p,id:job.projectId},{jobId:job.id,mode:job.mode,sourceHash:job.sourceHash,asset,role:job.artifact.role,model:job.model,createdAt:job.createdAt,specificationKey:generatedCompatibilityKey(p),composition:job.composition,compositionKey:job.compositionKey,...(display?{dimensionDisplay:display}:{}),...(job.dimensionReview?{dimensionReview:job.dimensionReview}:{})});
     const canvas=document.createElement('canvas'),issues=await render(canvas,composed,undefined,manualBaseExport(composed));
     if(issues.length)throw Error('RENDER_FAILED');
     const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG')),'image/png'));
     if(!live())return;
     const file=new File([png],`aiadcast-${batch.id.slice(4,12)}-${String(index+1).padStart(2,'0')}.png`,{type:'image/png'});
     cache.current[job.id]={file,url:URL.createObjectURL(file),artifact:asset.sha256};setImages({...cache.current});
    }
    if(live()&&result.jobs.some(j=>j.state==='running'))timer=setTimeout(()=>void poll(),2500);
   }catch{if(live())setError(t('결과를 불러오지 못했습니다. 다시 확인해주세요.','Could not load the results. Check again.'));}
  }
  void poll();return()=>{controller.abort();clearTimeout(timer);};
 },[batch.id,batch.count,retry,detail]);
 const eligible=jobs.filter(j=>images[j.id]&&['accepted','ready'].includes(j.state)&&(!j.dimensionDisplay||validAiDimensionReview(j.dimensionReview,j.dimensionDisplay,j.artifactId!)));
 const chosen=eligible.filter(j=>selected.includes(j.id));
 async function deliver(mode:'save'|'share'){
  if(lock.current||!chosen.length)return;lock.current=true;setBusy(true);setError('');setNotice('');
  const signal=lifetime.current.signal;
  try{
   for(const j of chosen){
    if(j.creditUnit==='legacy-ticket'&&j.creditCost&&j.state==='ready'&&!exported.current.has(j.id)){
     await apiRequest('/api/generations/'+j.id+'/accept',{artifactId:j.artifactId,...(j.dimensionReview?{dimensionReview:j.dimensionReview}:{})},signal);
     exported.current.add(j.id);
    }
   }
   await exportBatch(chosen.map(j=>images[j.id].file),mode,signal);
   if(!signal.aborted)setNotice(mode==='save'?t('선택한 이미지 저장을 요청했습니다.','Selected images sent to downloads.'):t('공유할 앱에서 전송을 완료해주세요.','Finish sharing in the selected app.'));
  }catch(e){if(!signal.aborted&&!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error&&e.message==='SHARE_UNAVAILABLE'?t('이 브라우저는 파일 공유를 지원하지 않습니다. 선택 저장을 이용해주세요.','This browser cannot share files. Use Save selected.'):t('선택한 이미지를 내보내지 못했습니다. 다시 눌러주세요.','Could not export the selected images. Please try again.'));}
  finally{lock.current=false;if(!signal.aborted)setBusy(false);}
 }
 function back(){setDetail(undefined);setRetry(n=>n+1);}
 if(detail)return <>{renderDetail(detail,back)}</>;
 const count=jobs.filter(j=>['ready','accepted'].includes(j.state)).length;
 return <section className="batch-results"><h2>{t('생성된 광고 이미지','Generated ad images')}</h2>
  <p role="status">{t(`${batch.count}장 중 ${count}장 완료`,`${count} of ${batch.count} images ready`)}</p>
  <label><input type="checkbox" disabled={busy||!eligible.length} checked={!!eligible.length&&chosen.length===eligible.length} onChange={e=>setSelected(e.target.checked?eligible.map(j=>j.id):[])}/> {t('전체 선택','Select all')}</label>
  <ol className="batch-grid">{jobs.map((j,i)=><li key={j.id}>
   {images[j.id]&&['ready','accepted'].includes(j.state)&&<button type="button" aria-label={t(`${i+1}번 이미지 확대`,`Enlarge image ${i+1}`)} onClick={()=>setZoom(images[j.id].url)}><img src={images[j.id].url} alt=""/></button>}
   <label><input type="checkbox" checked={chosen.some(x=>x.id===j.id)} disabled={busy||!eligible.some(x=>x.id===j.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,j.id]:ids.filter(x=>x!==j.id))}/>{t(`광고 ${i+1}`,`Ad ${i+1}`)}</label>
   {['ready','accepted'].includes(j.state)?<button onClick={()=>setDetail({...project,id:j.projectId,adBatch:undefined,generated:undefined})}>{t('검수 · 수정','Review · edit')}</button>:<small>{j.state==='running'?t('생성 중','Generating'):j.state==='rejected'?t('반려됨','Rejected'):t('생성 종료 · 결과 없음','Finished without an image')}</small>}
  </li>)}</ol>
  {jobs.some(j=>j.dimensionDisplay&&!j.dimensionReview&&j.state==='ready')&&<p>{t('규격을 표시한 이미지는 검수 후 선택할 수 있습니다.','Review the dimensions to select these images.')}</p>}
  {chosen.some(j=>j.creditUnit==='legacy-ticket'&&j.creditCost&&j.state==='ready')&&<p>{t('저장하거나 공유하면 선택한 광고의 사용이 확정됩니다.','Saving or sharing confirms use of the selected ads.')}</p>}
  <div className="batch-actions"><button disabled={busy||!chosen.length} onClick={()=>void deliver('save')}>{t(`선택 저장 (${chosen.length})`,`Save selected (${chosen.length})`)}</button><button disabled={busy||!chosen.length} onClick={()=>void deliver('share')}>{t(`선택 공유 (${chosen.length})`,`Share selected (${chosen.length})`)}</button></div>
  {error&&<p role="alert">{error} <button onClick={()=>{setError('');setRetry(n=>n+1);}}>{t('다시 확인','Check again')}</button></p>}{notice&&<p role="status">{notice}</p>}
  <button type="button" onClick={onEdit}>{t('입력 내용 수정','Edit details')}</button>
  {zoom&&<dialog ref={zoomDialog} onClose={()=>setZoom(undefined)}><img style={{maxWidth:'80vw',maxHeight:'70vh'}} src={zoom} alt={t('광고 미리보기','Ad preview')}/><button onClick={()=>zoomDialog.current?.close()}>{t('닫기','Close')}</button></dialog>}
 </section>;
}
