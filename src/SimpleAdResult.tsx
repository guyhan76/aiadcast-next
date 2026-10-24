import {HistoricalAdResult} from './HistoricalAdResult';
import {TextLayerEditor} from './TextLayerEditor';
import {aiDimensionRequested,aiDimensionReviewError} from './ai-dimension-display';
import {isTextExample} from './generation-input';
import {DimensionControlledResult} from './DimensionControlledResult';
import {annotationIncomplete} from './dimension-annotation';
import {DimensionAnnotationPanel} from './DimensionAnnotationPanel';
import {DimensionGuide} from './DimensionGuide';
import {DimensionResult} from './DimensionResult';
import {PlanarResult} from './PlanarResult';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,Download} from 'lucide-react';
import type {Project} from './model';
import {exportErrors} from './model';
import {GenerationPanel} from './GenerationPanel';
import {MarketingSummary} from './MarketingSummary';
import {hasUsableCreative,hasUsableOriginal} from './generated';
import {saveProject} from './storage';
import {render} from './render';
import {useUiLanguage} from './ui-language';
import './simple-ad-result.css';
function GeneratedSimpleAdResult({project,change,onEdit,onCreativeDraft,autoRequest,onAutoHandled}:{project:Project;change:(fn:(p:Project)=>Project)=>void;onEdit:()=>void;onCreativeDraft:()=>Promise<void>;autoRequest?:string;onAutoHandled:()=>void}){
 const {t}=useUiLanguage(),canvas=useRef<HTMLCanvasElement>(null),latest=useRef(project);latest.current=project;
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[valid,setValid]=useState(false);
 const [generationExpanded,setGenerationExpanded]=useState(!!autoRequest);
 // An auto request is consumed before its network work finishes. Keep the
 // result view in generation mode until this project view is left. Unmounting
 // HistoricalAdResult clears its messages and aborts outstanding lookups.
 const [generationProject,setGenerationProject]=useState(autoRequest?project.id:'');
 const generationStarted=useCallback(()=>{setGenerationProject(project.id);setGenerationExpanded(true);},[project.id]);
 const showingGeneration=!!autoRequest||generationProject===project.id;
 useEffect(()=>{if(autoRequest)setGenerationExpanded(true);},[autoRequest]);
 const incomplete=annotationIncomplete(project);
 const usable=hasUsableCreative(project)||hasUsableOriginal(project);
 useEffect(()=>{let active=true;setValid(false);if(!usable)return;const scratch=document.createElement('canvas');void render(scratch,project).then(errors=>{if(!active||!canvas.current)return;if(errors.length){setError(errors.join(' '));if(incomplete){canvas.current.width=scratch.width;canvas.current.height=scratch.height;canvas.current.getContext('2d')!.drawImage(scratch,0,0);}return;}canvas.current.width=scratch.width;canvas.current.height=scratch.height;canvas.current.getContext('2d')!.drawImage(scratch,0,0);setValid(!aiDimensionReviewError(project));setError(aiDimensionReviewError(project)??'');}).catch(()=>{if(active)setError(t('광고를 불러오지 못했습니다.','Could not load the ad.'));});return()=>{active=false};},[project,usable]);
 useEffect(()=>{const exported=(e:Event)=>{const status=(e as CustomEvent).detail?.status;setMessage(status==='saved'?t('이미지를 저장했습니다.','Image saved.'):status==='requested'?t('저장 또는 공유를 선택해주세요.','Choose saving or sharing.'):status==='cancelled'?t('저장을 취소했습니다.','Save canceled.'):status==='error'?t('저장하지 못했습니다. 다시 시도해주세요.','Could not save. Please retry.'):t('공유할 앱을 열었습니다.','Sharing app opened.'));};window.addEventListener('aiadcast-native-export',exported);return()=>window.removeEventListener('aiadcast-native-export',exported);},[t]);
 async function downloadOriginal(){if(busy||!project.generated)return;setBusy(true);try{const p=latest.current;await saveProject({...p,updatedAt:new Date().toISOString()});const blob=await (await fetch(p.generated!.asset.data)).blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='aiadcast-original-unannotated.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage(t('사진 규격 표시를 추가하지 않은 원본 광고입니다. 규격 표시 완성본이 아닙니다.','Original ad without added photo dimensions. This is not the completed annotated ad.'));}catch{setError(t('원본 광고를 저장하지 못했습니다. 다시 시도해주세요.','Could not save the original. Try again.'));}finally{setBusy(false);}}
 async function download(){if(busy||!usable||!valid)return;setBusy(true);setError('');try{const p=latest.current,errors=exportErrors(p);if(errors.length)throw Error(errors.join(' '));const output=document.createElement('canvas'),layoutErrors=await render(output,p);if(layoutErrors.length)throw Error(layoutErrors.join(' '));if(latest.current!==p)throw Error(t('광고 정보가 변경되었습니다. 다시 확인해주세요.','Ad details changed. Please review again.'));await saveProject({...p,updatedAt:new Date().toISOString()});const blob=await new Promise<Blob>((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(Error('PNG')), 'image/png'));const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`aiadcast-${p.format.replace(':','x')}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage(t('이미지 저장을 요청했습니다.','Image download requested.'));}catch(e){setError(e instanceof Error?e.message:t('이미지를 저장하지 못했습니다.','Could not save the image.'));}finally{setBusy(false);}}
 return <section className="simple-ad-result"><h1>{t('내 광고','Your ad')}</h1><p className="result-name">{project.productName} · {project.format}</p>{(!usable||!!error)&&!showingGeneration&&<HistoricalAdResult key={project.id} project={project}/>}{usable&&<div className="accepted-ad">{isTextExample(project)&&<p role="note">{t("AI 예시 · 실제 상품 재현 아님","AI example · Not an actual product reproduction")}</p>}<h2>{t('사용 확정한 광고','Accepted ad')}</h2><TextLayerEditor project={project} change={change}/><DimensionAnnotationPanel project={project} change={change}/>{incomplete&&<p role="status">{t('배치 미완료 · 아래는 보존된 원본 광고입니다. 사진 규격 표시 완성본이 아닙니다.','Placement incomplete · The preview below is the preserved original, not a completed photo dimension ad.')}</p>}<canvas ref={canvas} aria-label={t('저장할 광고 이미지','Ad to download')}/><button className="primary-action" disabled={busy||!valid} onClick={()=>void download()}><Download size={18}/>{t('이미지 저장 · 공유','Save / share image')}</button>{!aiDimensionRequested(project)&&project.dimensionAnnotation?.mode&&project.dimensionAnnotation.mode!=='none'&&<button disabled={busy} onClick={()=>void downloadOriginal()}>{t('원본 광고 저장 · 사진 규격 표시 없음','Save original ad · no added photo dimensions')}</button>}{project.generated&&<DimensionGuide result={project.generated}/>}{project.generated?.dimensionPlan&&<DimensionResult plan={project.generated.dimensionPlan}/>}{project.generated?.planarReport&&<PlanarResult report={project.generated.planarReport} original={project.generated.planarOriginal}/>}{project.generated?.marketingPlan&&<MarketingSummary plan={project.generated.marketingPlan} saved/>}</div>}<details className="new-ad-options" open={generationExpanded} onToggle={e=>setGenerationExpanded(e.currentTarget.open)}><summary>{usable?t('새 광고 만들기','Create a new ad'):t('광고 미리보기','Ad preview')}</summary><GenerationPanel key={project.id} simple project={project} change={change} onCreativeDraft={onCreativeDraft} autoRequest={autoRequest} onAutoHandled={()=>{generationStarted();onAutoHandled();}} onGenerationStarted={generationStarted}/></details><button className="result-back" onClick={onEdit}><ArrowLeft size={17}/>{t('입력 내용 수정','Edit details')}</button>{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}</section>;
}

export function SimpleAdResult(props:Parameters<typeof GeneratedSimpleAdResult>[0]){return props.project.dimensionControl?<DimensionControlledResult {...props}/>:<GeneratedSimpleAdResult {...props}/>;}
