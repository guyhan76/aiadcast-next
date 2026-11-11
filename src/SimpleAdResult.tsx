import {HistoricalAdResult} from './HistoricalAdResult';
import {SelectiveImageEditor} from './SelectiveImageEditor';
import {apiRequest,type ApiStatus,type CreditQuote,type GenerationJob} from './generation-client';
import {aiDimensionRequested,aiDimensionReviewError} from './ai-dimension-display';
import {isTextExample} from './generation-input';
import {DimensionControlledResult} from './DimensionControlledResult';
import {annotationIncomplete,manualBaseExport} from './dimension-annotation';
import {PlanarResult} from './PlanarResult';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,Download} from 'lucide-react';
import type {Project} from './model';
import {exportErrors} from './model';
import {GenerationPanel} from './GenerationPanel';
import {hasUsableCreative,hasUsableOriginal} from './generated';
import {saveProject} from './storage';
import {storageNamespace} from './beta-session';
import {render} from './render';
import {useUiLanguage} from './ui-language';
import './simple-ad-result.css';
function GeneratedSimpleAdResult({project,change,onEdit,onCreativeDraft,onNewProduct,autoRequest,onAutoHandled}:{project:Project;change:(fn:(p:Project)=>Project)=>void;onEdit:()=>void;onCreativeDraft:()=>Promise<void>;onNewProduct?:()=>void;autoRequest?:string;onAutoHandled:()=>void}){
 const {t}=useUiLanguage(),canvas=useRef<HTMLCanvasElement>(null),latest=useRef(project);latest.current=project;
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[valid,setValid]=useState(false);
 const [editBusy,setEditBusy]=useState(false),[editSource,setEditSource]=useState<GenerationJob|null>(null),[editQuote,setEditQuote]=useState<CreditQuote|null>(null);
 const editRequest=useRef<AbortController|null>(null);
 useEffect(()=>()=>{editRequest.current?.abort();},[project.id,project.generated?.jobId]);
 const [reviewing,setReviewing]=useState(false);
 const [generationExpanded,setGenerationExpanded]=useState(!(hasUsableCreative(project)||hasUsableOriginal(project)));
 // An auto request is consumed before its network work finishes. Keep the
 // result view in generation mode until this project view is left. Unmounting
 // HistoricalAdResult clears its messages and aborts outstanding lookups.
 const [generationProject,setGenerationProject]=useState(autoRequest?project.id:'');
 const generationStarted=useCallback(()=>{setGenerationProject(project.id);setGenerationExpanded(true);},[project.id]);
 const showingGeneration=!!autoRequest||generationProject===project.id;
 useEffect(()=>{if(autoRequest)setGenerationExpanded(true);},[autoRequest]);
 const incomplete=annotationIncomplete(project),baseOnly=manualBaseExport(project);
 const usable=hasUsableCreative(project)||hasUsableOriginal(project);
 useEffect(()=>{let active=true;setValid(false);if(!usable)return;const scratch=document.createElement('canvas');void render(scratch,project,undefined,baseOnly).then(errors=>{if(!active||!canvas.current)return;if(errors.length){setError(errors.join(' '));if(incomplete){canvas.current.width=scratch.width;canvas.current.height=scratch.height;canvas.current.getContext('2d')!.drawImage(scratch,0,0);}return;}canvas.current.width=scratch.width;canvas.current.height=scratch.height;canvas.current.getContext('2d')!.drawImage(scratch,0,0);setValid(!aiDimensionReviewError(project));setError(aiDimensionReviewError(project)??'');}).catch(()=>{if(active)setError(t('광고를 불러오지 못했습니다.','Could not load the ad.'));});return()=>{active=false};},[project,usable]);
 useEffect(()=>{const exported=(e:Event)=>{const status=(e as CustomEvent).detail?.status;setMessage(status==='saved'?t('이미지를 저장했습니다.','Image saved.'):status==='requested'?t('저장 또는 공유를 선택해주세요.','Choose saving or sharing.'):status==='cancelled'?t('저장을 취소했습니다.','Save canceled.'):status==='error'?t('저장하지 못했습니다. 다시 시도해주세요.','Could not save. Please retry.'):t('공유할 앱을 열었습니다.','Sharing app opened.'));};window.addEventListener('aiadcast-native-export',exported);return()=>window.removeEventListener('aiadcast-native-export',exported);},[t]);
 // Keep the producer lifetime through rendering, IndexedDB and native bridge preparation.
 const exportLifetime=useRef(new AbortController()),exportPreparing=useRef(false);
 useLayoutEffect(()=>{
  const lifetime=new AbortController(),owner=storageNamespace();exportLifetime.current=lifetime;exportPreparing.current=false;setBusy(false);
  const cancel=()=>lifetime.abort(),sessionChanged=()=>{if(storageNamespace()!==owner)cancel();};
  window.addEventListener('hashchange',cancel);window.addEventListener('aiadcast-session-change',sessionChanged);
  return()=>{cancel();window.removeEventListener('hashchange',cancel);window.removeEventListener('aiadcast-session-change',sessionChanged);};
 },[project.id]);
 async function openSelectiveEdit(){
  if(busy||editBusy||editRequest.current&&!editRequest.current.signal.aborted||!valid||!hasUsableCreative(project)||project.generated?.composition!=='complete-ad')return;
  const p=latest.current,generated=p.generated!,controller=new AbortController();editRequest.current=controller;setEditBusy(true);setError('');
  try{
   const status=await apiRequest<ApiStatus>('/api/status',undefined,controller.signal);
   if(controller.signal.aborted||latest.current!==p)return;
   if(!status.generation.selectiveEdit||!status.generation.creditQuote)throw Error('EDIT_UNAVAILABLE');
   const {job}=await apiRequest<{job:GenerationJob}>(`/api/generations/${encodeURIComponent(generated.jobId)}`,undefined,controller.signal);
   if(controller.signal.aborted||latest.current!==p)return;
   if(job.id!==generated.jobId||job.projectId!==p.id||job.state!=='accepted'||job.mode!=='creative'||job.composition!=='complete-ad'||job.artifactId!==generated.asset.sha256||job.artifact?.role!=='creative')throw Error('EDIT_SOURCE_MISMATCH');
   setEditQuote(status.generation.creditQuote);setEditSource(job);
  }catch(e){if(!controller.signal.aborted&&latest.current===p)setError(e instanceof Error&&e.message==='EDIT_UNAVAILABLE'?t('현재 서버에서 부분 수정을 사용할 수 없습니다.','Selected-area editing is not available on this server.'):e instanceof Error&&e.message==='EDIT_SOURCE_MISMATCH'?t('저장된 광고와 서버 원본이 일치하지 않아 부분 수정을 열지 않았습니다.','The saved ad does not match the server original. Editing was not opened.'):t('부분 수정 가능 여부를 확인하지 못했습니다. 연결 상태를 확인해주세요.','Could not check selected-area editing. Check your connection.'));}
  finally{if(editRequest.current===controller){editRequest.current=null;if(!controller.signal.aborted)setEditBusy(false);}}
 }
 async function download(original=false){
  if(busy||exportPreparing.current||!project.generated||(!original&&(!usable||!valid)))return;
  const p=latest.current,owner=storageNamespace(),signal=exportLifetime.current.signal;if(signal.aborted)return;
  exportPreparing.current=true;setBusy(true);setError('');
  const current=()=>!signal.aborted&&owner===storageNamespace()&&latest.current===p;
  const check=()=>{if(!current())throw new DOMException('Export cancelled','AbortError');};
  try{
   let blob:Blob;
   // Edited copies retain their server PNG bytes on save/re-download.
   // A later explicit overlay edit is a separate rendered output, not byte preservation.
   const preserveEdited=!!p.generated!.editParent&&!p.textEdit&&!p.exactTextVersion&&(!p.dimensionAnnotation||p.dimensionAnnotation.mode==='none')&&!aiDimensionRequested(p);
   if(original||preserveEdited){
    const response=await fetch(p.generated!.asset.data,{signal});check();blob=await response.blob();check();
   }else{
    const errors=exportErrors(p,manualBaseExport(p));if(errors.length)throw Error(errors.join(' '));
    const output=document.createElement('canvas'),layoutErrors=await render(output,p,undefined,manualBaseExport(p));check();
    if(layoutErrors.length)throw Error(layoutErrors.join(' '));
    blob=await new Promise<Blob>((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(Error('PNG')),'image/png'));check();
   }
   // Never resolve the owner again after an asynchronous render or PNG conversion.
   await saveProject({...p,updatedAt:new Date().toISOString()},owner,signal);check();
   const url=URL.createObjectURL(blob),a=document.createElement('a') as HTMLAnchorElement&{aiadcastExportSignal?:AbortSignal};
   a.aiadcastExportSignal=signal;a.href=url;a.download=original?'aiadcast-original-unannotated.png':`aiadcast-${p.format.replace(':','x')}${manualBaseExport(p)?'-without-dimension-lines':''}.png`;
   try{check();a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
   if(current())setMessage(original?t('사진 규격 표시를 추가하지 않은 원본 광고입니다. 규격 표시 완성본이 아닙니다.','Original ad without added photo dimensions. This is not the completed annotated ad.'):t('이미지 저장을 요청했습니다.','Image download requested.'));
  }catch(e){if(current())setError(e instanceof Error?e.message:t('이미지를 저장하지 못했습니다.','Could not save the image.'));}
  finally{if(exportLifetime.current.signal===signal){exportPreparing.current=false;if(!signal.aborted)setBusy(false);}}
 }
 function downloadOriginal(){return download(true);}
 return <section className="simple-ad-result"><h1>{t('내 광고','Your ad')}</h1><p className="result-name">{project.productName} · {project.format}</p>{project.generated&&(!usable||!!error)&&!showingGeneration&&<HistoricalAdResult key={project.id} project={project}/>}{usable&&<div className="accepted-ad">{isTextExample(project)&&<p role="note">{t("AI 예시 · 실제 상품 재현 아님","AI example · Not an actual product reproduction")}</p>}<h2>{t('사용 확정한 광고','Accepted ad')}</h2>{incomplete&&<p role="status">{baseOnly?t('치수선 없는 광고입니다. 입력 규격은 보관됩니다.','Ad without added dimension lines. Your measurements are preserved.'):t('규격 표시 미완료 · 원본 광고','Dimensions incomplete · Original ad')}</p>}<canvas ref={canvas} aria-label={t('저장할 광고 이미지','Ad to download')}/><button className="primary-action" disabled={busy||!valid} onClick={()=>void download()}><Download size={18}/>{baseOnly?t('치수선 없이 저장 · 공유','Save / share without dimension lines'):t('이미지 저장 · 공유','Save / share image')}</button>{hasUsableCreative(project)&&project.generated?.composition==='complete-ad'&&<button className="new-product-action" disabled={busy||editBusy||!valid} onClick={()=>void openSelectiveEdit()}>{editBusy?t('부분 수정 확인 중…','Checking selected-area editing…'):t('광고 이미지 부분 수정','Edit part of this ad')}</button>}{!baseOnly&&!aiDimensionRequested(project)&&project.dimensionAnnotation?.mode&&project.dimensionAnnotation.mode!=='none'&&<button disabled={busy} onClick={()=>void downloadOriginal()}>{t('원본 광고 저장 · 사진 규격 표시 없음','Save original ad · no added photo dimensions')}</button>}{project.generated?.planarReport&&<PlanarResult report={project.generated.planarReport} original={project.generated.planarOriginal}/>}</div>}{editSource&&editQuote&&<SelectiveImageEditor source={editSource} project={project} quote={editQuote} onClose={()=>{setEditSource(null);setEditQuote(null);}}/>}{!usable&&<details className="new-ad-options" open={!usable||generationExpanded} onToggle={e=>setGenerationExpanded(e.currentTarget.open)}><summary onClick={e=>{if(!usable)e.preventDefault();}} className={usable?'another-ad-action':undefined} aria-expanded={generationExpanded}>{t('제작 상태','Generation status')}</summary><GenerationPanel key={project.id} simple project={project} change={change} onEditInputs={onEdit} onCreativeDraft={onCreativeDraft} autoRequest={autoRequest} onAutoHandled={()=>{generationStarted();onAutoHandled();}} onGenerationStarted={generationStarted} onReviewChange={setReviewing}/></details>}{usable&&<button className="primary-action same-product-variant" disabled={busy} onClick={()=>{if(busy)return;setBusy(true);void onCreativeDraft().catch(()=>setError(t('현재 광고를 보관하지 못했습니다.','Could not preserve this ad.'))).finally(()=>setBusy(false));}}>{t('같은 상품으로 다른 시안 만들기','Create another design for this product')}</button>}{!reviewing&&onNewProduct&&<button className="new-product-action" onClick={onNewProduct}>{t('새 상품 광고 만들기','Create an ad for a new product')}</button>}{!reviewing&&<button className="result-back" onClick={onEdit}><ArrowLeft size={17}/>{t('입력 내용 수정','Edit details')}</button>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}</section>;
}

export function SimpleAdResult(props:Parameters<typeof GeneratedSimpleAdResult>[0]){return props.project.dimensionControl?<DimensionControlledResult {...props}/>:<GeneratedSimpleAdResult {...props}/>;}

