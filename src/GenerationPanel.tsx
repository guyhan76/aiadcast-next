import {setUnacceptedPreview} from './PreviewLeaveGuard';
import {aiDimensionRequested,projectAiDimensionKey,parseAiDimensionDisplay,validAiDimensionReview,type AiDimensionReview} from './ai-dimension-display';
import {isTextExample,generationInputs,generationSourceHash} from './generation-input';
import {DimensionAnnotationPanel} from './DimensionAnnotationPanel';
import {annotationIncomplete} from './dimension-annotation';
import {DimensionResult} from './DimensionResult';
import {parseDimensionPlan} from './dimension-generation';
import {PlanarResult} from './PlanarResult';
import {parsePlanarReport} from './planar-proportion';
import {imageFile} from './model';
import {preflightProportions} from './proportion-browser';
import {offlineDemo} from './demo-mode';
import {MarketingSummary} from './MarketingSummary';
import {parseMarketingPlan} from './marketing-plan';
import {storageNamespace} from './beta-session';
import {useEffect,useRef,useState} from 'react';
import {Check,RefreshCw,Sparkles,X} from 'lucide-react';
import type {Project} from './model';
import {buildGenerationRequest,buildNewGenerationRequest,photoGenerationDraft,newGenerationIssues} from './generation';
import {generatedCompatibilityKey,projectWithGenerated} from './generated';
import {render} from './render';
import {dimensionAxes,specSummary} from './product';
import {ApiRequestFailure,apiRequest,verifiedArtifact} from './generation-client';
import type {ApiStatus,GenerationJob} from './generation-client';
import {useUiLanguage} from './ui-language';
import {saveProject} from './storage';
import {ImageReview} from './ImageReview';
import {completeAdKey} from './complete-ad';
import {betaSession} from './beta-session';
import {hasUsableCreative,hasUsableOriginal} from './generated';
import {needsPhotoPurposeServer} from './photo-roles';
import './generation-panel.css';
import './admin-test.css';
function updatedWallet(status:ApiStatus|null,wallet:ApiStatus['wallet']){
 if(!status)return status;
 const old=status.generation.creditQuote;
 const unit=wallet.unlimited||wallet.available>0?'legacy-ticket':'credit-v2';
 return {...status,wallet,generation:{...status.generation,...(old?{creditQuote:{unit,amount:wallet.unlimited?0:unit==='legacy-ticket'?1:10,policy:unit==='legacy-ticket'?'legacy-accept-v1':'delivered-2026-10-18'} as const}:{})}};
}
type Pending={projectId:string;requestId:string;key:string;jobId?:string;recovered?:boolean};
type JobResponse={job:GenerationJob;wallet:ApiStatus['wallet']};
type AdPreview={source:Project;composed:Project;dataUrl:string;errors:string[];jobId:string};
export function GenerationPanel({project,change,simple=false,onCreativeDraft,autoRequest,onAutoHandled,onGenerationStarted}:{project:Project;change:(fn:(p:Project)=>Project)=>void;simple?:boolean;onCreativeDraft?:()=>Promise<void>;autoRequest?:string;onAutoHandled?:()=>void;onGenerationStarted?:()=>void}){
 const {t}=useUiLanguage();const [status,setStatus]=useState<ApiStatus|null>(null),[job,setJob]=useState<GenerationJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reviewed,setReviewed]=useState(false);
 useEffect(()=>{if(job)onGenerationStarted?.();},[job?.id,onGenerationStarted]);
 useEffect(()=>{setUnacceptedPreview(job?.state==='ready');return()=>setUnacceptedPreview(false);},[job?.state]);
 const dispatching=useRef(false),generationRequest=useRef<AbortController|null>(null);
 const [recoveryChecked,setRecoveryChecked]=useState(false),[recoveryError,setRecoveryError]=useState('');
 const recoveryRequest=useRef<AbortController|null>(null);
 const [recovering,setRecovering]=useState(false),[pollStopped,setPollStopped]=useState(false);
 const [statusError,setStatusError]=useState(''),[checking,setChecking]=useState(false),[checked,setChecked]=useState<{at:string;same:boolean}>();const statusRequest=useRef<AbortController|null>(null),statusFingerprint=useRef('');const autoHandled=useRef('');
 const latest=useRef(project);latest.current=project;const alive=useRef(true);const pending=useRef<Pending|null>(null);const storageKey=(storageNamespace()==='guest'?'':storageNamespace()+':')+`aiadcast.pending-generation.${project.id}`;
 const [creditConsent,setCreditConsent]=useState(false),[defect,setDefect]=useState('');
 const [enlarged,setEnlarged]=useState(false);const [dimensionChecks,setDimensionChecks]=useState({values:false,axes:false,complete:false});
 const [preview,setPreview]=useState<AdPreview|null>(null),[previewError,setPreviewError]=useState('');
 const previewRef=useRef<AdPreview|null>(null);
 const remember=(value:Pending|null)=>{pending.current=value;try{if(value)localStorage.setItem(storageKey,JSON.stringify(value));else localStorage.removeItem(storageKey);}catch{/* API history still keeps the job. */}};
 const failure=(e:unknown)=>{const code=e instanceof Error?e.message:'';setError(code==='CREDIT_QUOTE_CHANGED'?t('잔액이나 이용권 종류가 바뀌었습니다. 상태를 새로 확인하고 차감을 다시 확인해주세요. 생성은 실행하지 않았습니다.','Your balance or credit unit changed. Refresh and confirm the charge again. No generation was dispatched.'):code==='PLANAR_SOURCE_UNCONFIRMED'?t('정면 평면 외곽이나 입력 비례를 확인하지 못했습니다. 가림 없는 정면 사진·가로·세로를 확인해주세요. 유료 생성을 요청하지 않았습니다.','Could not confirm the front plane outline or dimensions. Check the unobstructed front photo and measurements. No paid generation was dispatched.'):code==='PROPORTION_MISMATCH'?t('입력 규격과 사진 비례가 다릅니다. 자동 검사에서 촬영면·규격·전체 외곽을 확인해주세요. 새 시안은 요청하지 않았습니다.','Photo proportions differ from the dimensions. Check views, dimensions and full extent in the automatic check. No visual was requested.'):code==='BUDGET_NOT_AVAILABLE'?t('테스트 비용 한도에 도달했습니다. 추가 생성은 중단했습니다.','The test budget is exhausted. Generation is paused.'):code==='ARTIFACT_MISMATCH'||code==='INVALID_ARTIFACT'?t('결과 파일 검증에 실패했습니다. 사용 확정하지 않았습니다.','The result failed file validation. It has not been accepted.'):t('연결 또는 요청을 확인하지 못했습니다. 자동으로 다시 생성하지 않습니다. 연결 상태와 기존 작업을 확인해주세요.','The request could not be confirmed. No automatic regeneration will occur. Refresh the connection and check the existing job.'));};
 async function recover(automatic=false){
  if(recoveryRequest.current)return;
  const controller=new AbortController();recoveryRequest.current=controller;setRecoveryChecked(false);setRecoveryError('');setRecovering(true);setPollStopped(false);
  const timer=setTimeout(()=>controller.abort(),automatic?45000:30000);
  const current=()=>alive.current&&recoveryRequest.current===controller;
  try{
   for(let attempt=0;attempt<(automatic?3:1);attempt++){
   try{
   let record=pending.current,id=record?.jobId;
   if(!id){
    const history=await apiRequest<{jobs:GenerationJob[]}>(`/api/generations?projectId=${encodeURIComponent(project.id)}`,undefined,controller.signal);
    if(!current())return;
    if(!Array.isArray(history.jobs))throw Error('INVALID_HISTORY');
    const candidates=history.jobs.filter(j=>j.projectId===project.id&&(record?(j.requestId===record.requestId||j.requestIds?.includes(record.requestId)):['running','ready','uncertain'].includes(j.state)));
    if(candidates.length>1)throw Error('AMBIGUOUS_HISTORY');
    id=candidates[0]?.id;
    if(record&&!id)throw Error('REQUEST_NOT_FOUND');
   }
   if(id){
    const result=await apiRequest<JobResponse>(`/api/generations/${encodeURIComponent(id)}`,undefined,controller.signal);
    if(!current())return;
    if(result.job.id!==id||result.job.projectId!==project.id)throw Error('INVALID_HISTORY');
    // Without the original pending marker, only the server's complete-ad input key
    // can establish compatibility. Other results remain visible but cannot be accepted.
    if(!record||record.recovered)record={recovered:true,projectId:project.id,jobId:id,requestId:result.job.requestId??result.job.requestIds?.[0]??'',key:result.job.composition==='complete-ad'&&result.job.compositionKey===completeAdKey(project)&&result.job.sourceHash===generationSourceHash(project)&&result.job.mode===project.generation.mode?generatedCompatibilityKey(project):''};
    remember({...record,jobId:id});setJob(result.job);setStatus(s=>updatedWallet(s,result.wallet));
   }
   setRecoveryChecked(true);setError('');return;
   }catch(e){
    if(!automatic||attempt===2||controller.signal.aborted||e instanceof ApiRequestFailure&&[401,403].includes(e.status)||e instanceof Error&&['INVALID_HISTORY','AMBIGUOUS_HISTORY'].includes(e.message))throw e;
    await new Promise<void>(resolve=>{const done=()=>{clearTimeout(wait);controller.signal.removeEventListener('abort',done);resolve();};const wait=setTimeout(done,1000*(attempt+1));controller.signal.addEventListener('abort',done,{once:true});});
    if(!current())return;if(controller.signal.aborted)throw Error('RECOVERY_TIMEOUT');
   }}
  }catch(e){if(current()){setRecoveryError(e instanceof ApiRequestFailure&&e.status===401?t('로그인 인증을 확인하지 못했습니다. 다시 로그인한 뒤 기존 결과를 확인해주세요.','Authentication failed. Sign in again to recover the existing result.'):t('기존 작업을 확인하지 못했습니다. 중복 생성을 막기 위해 새 생성을 멈췄습니다. 기존 결과를 다시 확인해주세요.','Could not check existing work. New generation is paused to prevent duplicates. Check existing results again.'));}}
  finally{clearTimeout(timer);if(recoveryRequest.current===controller){recoveryRequest.current=null;if(alive.current)setRecovering(false);}}
 }
 async function refresh(){
  void recover();
  if(statusRequest.current)return;const controller=new AbortController();statusRequest.current=controller;setChecking(true);setStatusError('');const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const data=await apiRequest<ApiStatus>('/api/status',undefined,controller.signal);if(!alive.current||statusRequest.current!==controller)return;const fingerprint=JSON.stringify(data);setChecked({at:new Date().toISOString(),same:fingerprint===statusFingerprint.current});statusFingerprint.current=fingerprint;setStatus(data);setError('');setStatusError('');
  }catch(e){if(alive.current&&statusRequest.current===controller){setStatus(null);setStatusError(controller.signal.aborted?'STATUS_TIMEOUT':e instanceof ApiRequestFailure?e.code:'CONNECTION_UNAVAILABLE');}}finally{clearTimeout(timer);if(statusRequest.current===controller){statusRequest.current=null;if(alive.current)setChecking(false);}}
 }
 useEffect(()=>{alive.current=true;pending.current=null;setJob(null);setRecoveryChecked(false);try{const raw=JSON.parse(localStorage.getItem(storageKey)??'null');if(raw?.projectId===project.id&&typeof raw.requestId==='string'&&typeof raw.key==='string'){if(raw.jobId&&raw.jobId===project.generated?.jobId&&(hasUsableCreative(project)||hasUsableOriginal(project)))remember(null);else pending.current=raw;}}catch{/* Invalid local state is ignored. */}void refresh();return()=>{alive.current=false;generationRequest.current?.abort();statusRequest.current?.abort();statusRequest.current=null;recoveryRequest.current?.abort();recoveryRequest.current=null;};},[project.id]);
 useEffect(()=>{
  if(job?.state!=='running'||recovering)return;
  let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,reads=0,failures=0;
  const deadline=Date.now()+180000,id=job.id;
  async function poll(){
   controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),15000);let running=true;
   try{
    const result=await apiRequest<JobResponse>(`/api/generations/${encodeURIComponent(id)}`,undefined,controller.signal);
    if(cancelled)return;
    if(result.job.id!==id||result.job.projectId!==project.id)throw Error('INVALID_HISTORY');
    setJob(result.job);setStatus(s=>updatedWallet(s,result.wallet));setError('');setRecoveryError('');setPollStopped(false);failures=0;running=result.job.state==='running';
   }catch(e){if(cancelled)return;failures++;if(e instanceof ApiRequestFailure&&[401,403].includes(e.status)||e instanceof Error&&e.message==='INVALID_HISTORY')failures=3;}
   finally{clearTimeout(timeout);}
   if(cancelled||!running)return;
   if(failures>=3||++reads>=60||Date.now()>=deadline){setPollStopped(true);setRecoveryError(t('결과 확인이 지연되고 있습니다. 기존 결과를 다시 확인해주세요. 새 생성은 요청하지 않습니다.','Result confirmation is taking longer. Check the existing result again; no new generation will be requested.'));return;}
   timer=setTimeout(()=>void poll(),2000);
  }
  timer=setTimeout(()=>void poll(),2000);
  return()=>{cancelled=true;clearTimeout(timer);controller?.abort();};
 },[job?.id,job?.state,recovering]);
 const complete=job?.composition==='complete-ad';
 const compatible=!!pending.current&&pending.current.key===generatedCompatibilityKey(project)&&job?.sourceHash===generationSourceHash(project)&&job?.mode===project.generation.mode&&(!complete||job?.compositionKey===completeAdKey(project));
 // An explicit submission with changed inputs may create a new visual after
 // a completed preview. Keep running/uncertain work blocked and retain the old
 // server job; never reject, accept or refund it implicitly.
 const revisedReady=job?.state==='ready'&&!!pending.current?.key&&!compatible;
 const issues=newGenerationIssues(project);const active=job?.state==='running'||job?.state==='ready'&&!revisedReady||job?.state==='uncertain';
 useEffect(()=>{
  if(previewRef.current?.source===project&&previewRef.current.jobId===job?.id&&compatible&&job?.artifact)return;
  let cancelled=false;setReviewed(false);setDimensionChecks({values:false,axes:false,complete:false});setEnlarged(false);setPreviewError('');if(!compatible||!job?.artifact||previewRef.current?.jobId!==job.id){setPreview(null);previewRef.current=null;}
  if(!job?.artifact||!compatible)return;
  const currentJob=job;
  void (async()=>{
   try{
    const marketingPlan=parseMarketingPlan(currentJob.marketingPlan??undefined);if(marketingPlan&&(marketingPlan.input.sourceHash!==currentJob.sourceHash||marketingPlan.input.mode!==currentJob.mode))throw Error('INVALID_ARTIFACT');
    if(currentJob.inputMode!==(isTextExample(project)?'text-example':undefined)||isTextExample(project)&&currentJob.composition!=='complete-ad')throw Error('INVALID_ARTIFACT');
    const asset=await verifiedArtifact(currentJob);
    const dimensionDisplay=await parseAiDimensionDisplay(currentJob.dimensionDisplay);if(aiDimensionRequested(project)?!dimensionDisplay||dimensionDisplay.inputKey!==projectAiDimensionKey(project)||dimensionDisplay.layout!==project.dimensionAnnotation?.mode||currentJob.composition!=='complete-ad':!!dimensionDisplay)throw Error('INVALID_ARTIFACT');
    if(currentJob.dimensionReview&&(!dimensionDisplay||!validAiDimensionReview(currentJob.dimensionReview,dimensionDisplay,asset.sha256)))throw Error('INVALID_ARTIFACT');
    const dimensionPlan=parseDimensionPlan(currentJob.dimensionPlan);
    const expectedPlan=buildGenerationRequest(project).dimensionPlan;
    if(JSON.stringify(dimensionPlan)!==JSON.stringify(expectedPlan))throw Error('INVALID_ARTIFACT');
    const planarReport=parsePlanarReport(currentJob.planarReport);
    let planarOriginal;
    if(project.generation.planarSourceHash&&!planarReport)throw Error('INVALID_ARTIFACT');
    if(planarReport){const raw=currentJob.planarOriginal;if(!project.generation.planarSourceHash||Math.abs(planarReport.expectedRatio-Number(project.dimensions.width)/Number(project.dimensions.depth))>1e-9||planarReport.variantLabel!==(project.generation.dimensionVariant??'')||planarReport.outputRatio!==null&&Math.abs(asset.width/asset.height-planarReport.outputRatio)>1e-9||!raw||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.dataUrl)||raw.dataUrl.length>14000000||raw.sha256!==planarReport.originalHash)throw Error('INVALID_ARTIFACT');const response=await fetch(raw.dataUrl);planarOriginal=await imageFile(new File([await response.blob()],'generated-before-adjustment.png',{type:'image/png'}));if(planarOriginal.sha256!==raw.sha256||planarOriginal.width!==raw.width||planarOriginal.height!==raw.height)throw Error('INVALID_ARTIFACT');}

    const composed=projectWithGenerated(project,{...(dimensionDisplay?{dimensionDisplay}:{}),...(currentJob.dimensionReview?{dimensionReview:currentJob.dimensionReview}:{}),...(currentJob.inputMode?{inputMode:currentJob.inputMode}:{}),jobId:currentJob.id,mode:currentJob.mode,sourceHash:currentJob.sourceHash,asset,...(dimensionPlan?{dimensionPlan}:{}),...(planarReport?{planarReport,planarOriginal}:{}),role:currentJob.artifact!.role,model:currentJob.model,createdAt:currentJob.createdAt,specificationKey:pending.current!.key,...(marketingPlan?{marketingPlan}:{}),...(currentJob.composition?{composition:currentJob.composition}:{}),...(currentJob.compositionKey?{compositionKey:currentJob.compositionKey}:{})});
    const canvas=document.createElement('canvas'),errors=await render(canvas,composed);
    if(cancelled||latest.current!==project)return;
    const ready={source:project,composed,dataUrl:canvas.toDataURL('image/png'),errors,jobId:currentJob.id};previewRef.current=ready;setPreview(ready);if(currentJob.dimensionReview)setDimensionChecks({values:true,axes:true,complete:true});
   }catch(e){if(!cancelled)setPreviewError(e instanceof Error&&['ARTIFACT_MISMATCH','INVALID_ARTIFACT','INVALID_AI_DIMENSION_DISPLAY'].includes(e.message)?t('결과 파일 검증에 실패했습니다. 사용 확정하지 않았습니다.','The result failed file validation. It has not been accepted.'):t('광고 미리보기를 만들지 못했습니다. 사용 확정하지 않았습니다. 연결 상태를 확인해주세요.','Could not compose the ad preview. It has not been accepted. Check the connection.'));}
  })();
  return()=>{cancelled=true;};
 },[project,job?.id,job?.artifactId,!!job?.artifact,compatible]);
 const previewReady=!!preview&&preview.source===project&&preview.jobId===job?.id&&!preview.errors.length;
 useEffect(()=>{if(!recoveryChecked||!autoRequest||autoHandled.current===autoRequest||(!status&&!statusError)||(!!pending.current&&!job))return;autoHandled.current=autoRequest;onAutoHandled?.();if(status?.generation.creditQuote?.unit==='credit-v2')return;if(status?.generation.enabled&&!active)void start();},[autoRequest,status,statusError,job?.id,job?.state,recoveryChecked,active]);
 async function start(){
  if(dispatching.current||!recoveryChecked||!status?.generation.enabled)return;
  if(busy||active||pending.current&&!job)return;
  onGenerationStarted?.();
  const previous=latest.current,sanitized=photoGenerationDraft(previous);
  if(sanitized!==previous){latest.current=sanitized;change(p=>p===previous?sanitized:p);}
  const inputIssues=newGenerationIssues(latest.current);if(inputIssues.length){setError(inputIssues.join(' '));return;}
  if(aiDimensionRequested(latest.current)&&status?.generation.aiDimensionDisplay!==true){setError(t('서버가 AI 자동 규격 표시를 지원하지 않습니다. 서버 업데이트 후 다시 확인해주세요. 유료 생성을 요청하지 않았습니다.','The server does not support AI dimension display. Check again after a server update. No paid generation was requested.'));return;}
  if(isTextExample(latest.current)&&status?.generation.textExamples!==true)return;
  if(needsPhotoPurposeServer(latest.current,status?.generation.photoPurposes))return;
  if(latest.current.generation.dimensionBased&&!status?.generation.dimensionVariants){setError(t('서버가 규격 기반 생성을 지원하지 않습니다. 옵션을 끄거나 서버 업데이트를 확인해주세요.','The server does not support dimension-based generation. Turn it off or check the server update.'));return;}
  if(latest.current.generation.planarSourceHash&&!status?.generation.planarControl){setError(t('서버가 규격 기반 평면 생성을 지원하지 않습니다. 옵션을 끄거나 서버 업데이트를 확인해주세요.','The server does not support planar dimension control. Turn it off or check the server update.'));return;}
  const snapshot=latest.current;if(busy||active||pending.current&&!job)return;
  dispatching.current=true;setBusy(true);setError('');setNotice('');setReviewed(false);
  try{
   if(!aiDimensionRequested(snapshot)&&snapshot.dimensionAnnotation?.mode&&snapshot.dimensionAnnotation.mode!=='none'){const capability=await apiRequest<{available:boolean}>('/api/dimension-analysis');if(!capability.available){setError(t('선택한 사진 규격 표시를 완성할 수 없어 새 AI 생성을 요청하지 않았습니다. 규격 표시 경로가 준비된 뒤 다시 진행해주세요. 입력 내용은 보관했습니다.','No new AI generation was requested because the selected photo dimensions cannot be completed. Continue when dimension placement is available. Your inputs are preserved.'));return;}}
   if(status?.generation.creditQuote?.unit==='credit-v2'&&!creditConsent)return;
   const measured=await preflightProportions(snapshot);if(measured?.status==='mismatch')throw Error('PROPORTION_MISMATCH');if(latest.current!==snapshot)throw Error('STALE_PROJECT');const request=buildNewGenerationRequest(snapshot);await saveProject(snapshot);const record={projectId:snapshot.id,requestId:crypto.randomUUID(),key:generatedCompatibilityKey(snapshot)};remember(record);setJob(null);
   const controller=new AbortController();generationRequest.current=controller;const timeout=setTimeout(()=>controller.abort(),30000);
   let result:JobResponse;try{result=await apiRequest<JobResponse>('/api/generations',{projectId:snapshot.id,requestId:record.requestId,request,creditQuote:status?.generation.creditQuote,...generationInputs(snapshot)},controller.signal);}finally{clearTimeout(timeout);if(generationRequest.current===controller)generationRequest.current=null;}
   if(!alive.current)return;if(result.job.projectId!==snapshot.id||!result.job.id)throw Error('INVALID_HISTORY');setCreditConsent(false);setRecoveryError('');setPollStopped(false);remember({...record,jobId:result.job.id});setJob(result.job);setStatus(s=>updatedWallet(s,result.wallet));
  }catch(e){if(alive.current){if(e instanceof ApiRequestFailure&&['CREDIT_QUOTE_CHANGED','INVALID_AI_DIMENSION_DISPLAY','AI_DIMENSION_DISPLAY_UNAVAILABLE','INVALID_TEXT_EXAMPLE','TEXT_EXAMPLE_PHOTOS_NOT_ALLOWED','TEXT_EXAMPLE_UNSUPPORTED_GEOMETRY','PLANAR_SOURCE_UNCONFIRMED','INVALID_PLANAR_CONTROL','INVALID_DIMENSION_PLAN','INVALID_REQUEST','INVALID_SPECIFICATIONS','REGION_EDIT_NOT_AVAILABLE','SOURCE_MISMATCH','INVALID_IMAGE','SOURCE_REQUIRED','GENERATION_DISABLED','PROVIDER_NOT_CONFIGURED','BUDGET_NOT_AVAILABLE','NO_TEST_CREDITS','GENERATION_ALREADY_RUNNING','REVIEW_REQUIRED_AFTER_REJECTIONS','JSON_REQUIRED','REQUEST_TOO_LARGE','CLIENT_HEADER_REQUIRED','ORIGIN_NOT_ALLOWED','LOCAL_ACCESS_ONLY','TOO_MANY_REQUESTS'].includes(e.code))remember(null);if(pending.current&&!pending.current.jobId){setError('');void recover(true);}else failure(e);}}finally{dispatching.current=false;if(alive.current)setBusy(false);}
 }
 async function accept(){
  if(!job||!compatible||!reviewed||!previewReady||busy||aiDimensionRequested(project)&&!Object.values(dimensionChecks).every(Boolean))return;setBusy(true);setError('');
  try{
   // The fully rendered, hash-verified ad must be reviewed before accepting a charge.
   const reviewedAd=previewRef.current,record=pending.current;if(!reviewedAd||reviewedAd.source!==latest.current||reviewedAd.errors.length||!record||record.key!==generatedCompatibilityKey(latest.current))throw Error('STALE_PROJECT');
   const dimensionReview:AiDimensionReview|undefined=job.dimensionDisplay?{inputHash:job.dimensionDisplay.inputHash,artifactHash:job.artifactId!,values:true,axes:true,complete:true}:undefined;
   const result=job.state==='accepted'?await apiRequest<JobResponse>(`/api/generations/${encodeURIComponent(job.id)}`):await apiRequest<JobResponse>(`/api/generations/${job.id}/accept`,{artifactId:job.artifactId,...(dimensionReview?{dimensionReview}:{})});
   if(!alive.current)return;
   if(reviewedAd.source!==latest.current||record.key!==generatedCompatibilityKey(latest.current))throw Error('STALE_PROJECT');
   if(dimensionReview&&!validAiDimensionReview(result.job.dimensionReview,job.dimensionDisplay!,job.artifactId!))throw Error('INVALID_ARTIFACT');
   const reviewedComposed=dimensionReview?{...reviewedAd.composed,generated:{...reviewedAd.composed.generated!,dimensionReview}}:reviewedAd.composed;
   const composed={...reviewedComposed,generated:{...reviewedComposed.generated!,acceptedAt:new Date().toISOString()}};
   // Keep the confirmed result durable before it can outlive the pending request.
   await saveProject({...composed,updatedAt:new Date().toISOString()});
   // Retain the in-memory review for reapply, but never recover a completed request as pending.
   try{localStorage.removeItem(storageKey);}catch{/* A legacy marker is reconciled against the saved result on restore. */}
   if(!alive.current||reviewedAd.source!==latest.current) return;
   const applied={...reviewedAd,composed,source:composed};previewRef.current=applied;setPreview(applied);
   change(p=>p!==reviewedAd.source?p:composed);
   setJob(result.job);setStatus(s=>updatedWallet(s,result.wallet));setNotice(t('확인한 광고 전체를 적용했습니다. 문구·규격·연락처가 포함된 광고를 PNG로 저장하세요.','Your reviewed complete ad is applied. Export the PNG with its copy, dimensions and contact information.'));
  }catch(e){failure(e);}finally{if(alive.current)setBusy(false);}
 }
 async function reject(){if(!job||busy)return;setBusy(true);try{const result=await apiRequest<JobResponse>(`/api/generations/${job.id}/reject`,{});if(!alive.current)return;setJob(result.job);setStatus(s=>updatedWallet(s,result.wallet));setCreditConsent(false);remember(null);setReviewed(false);setNotice(job.creditCaptured?t('결과를 반려했습니다. 이미 제공된 결과의 크레딧은 자동 복원하지 않습니다.','Result rejected. Delivered credits are not automatically refunded.'):job.creditPolicy==='admin-unlimited'&&job.creditCost===0?t('관리자 테스트 시안을 반려했습니다. 이용권 변동은 없습니다.','Administrator test rejected. No credit balance changed.'):t('시안을 반려하고 테스트 이용권을 복원했습니다.','The visual was rejected and the test credit was restored.'));}catch(e){failure(e);}finally{if(alive.current)setBusy(false);}}
 async function creativeDraft(){
  if(!onCreativeDraft||busy||active||job?.state==='uncertain'||pending.current&&!job)return;
  setBusy(true);setError('');
  try{await onCreativeDraft();}catch{if(alive.current)setError(t('현재 광고를 보관하지 못해 전환하지 않았습니다. 다시 시도해주세요.','Could not preserve this ad. The draft was not switched; please retry.'));}finally{if(alive.current)setBusy(false);}
 }
 const demo=offlineDemo();const applied=simple&&job?.state==='accepted'&&project.generated?.jobId===job.id&&(hasUsableCreative(project)||hasUsableOriginal(project));
 const referenceBlocked=!!status&&needsPhotoPurposeServer(project,status.generation.photoPurposes);
 const adminUnlimited=status?.wallet.unlimited===true;const exemptJob=job?.creditPolicy==='admin-unlimited'&&job.creditCost===0;
 const reviewAvailable=!!job&&['ready','accepted'].includes(job.state)&&previewReady;
 const reason=status?.generation.reason;
 const blocked=statusError==='AUTH_REQUIRED'?t('이미지를 생성하려면 로그인해주세요. 입력한 광고 정보는 보관했습니다.','Sign in to generate your image. Your ad details are kept.'):statusError==='STATUS_TIMEOUT'?t('15초 안에 상태를 확인하지 못했습니다. 다시 확인해주세요. 이용권이나 예산을 변경하지 않았습니다.','Status check timed out after 15 seconds. Retry; credits and budget were not changed.'):statusError?t('서버 상태를 확인하지 못했습니다. 다시 확인해주세요.','Could not check the server. Please retry.'):reason==='BUDGET_NOT_AVAILABLE'?(adminUnlimited?t('관리자 이용권은 차감되지 않지만 이미지 생성용 예산이 부족합니다. 이 계정의 월 배정·사용·보류액을 확인해주세요.','Administrator credits are exempt, but the image generation budget is insufficient. Check this account’s monthly allocation, spend and holds.'):status?.budget.limitMicros===0?t('이용권과 별도로, 이 계정에 이미지 생성용 API 예산이 배정되지 않았습니다. 추가 결제로 해결되지 않습니다. 관리자에게 예산 배정을 문의해주세요.','This account has no image generation API budget allocated, separately from credits. Another purchase will not resolve this. Ask your administrator about allocation.'):t('이용권과 별도로 이미지 생성용 예산의 사용·보류액 또는 생성 전 예약금 때문에 지금 생성할 수 없습니다. 관리자에게 남은 예산을 확인해주세요.','Generation budget spending, holds or the required reservation prevents generation, separately from credits. Ask your administrator to check the remaining budget.')):reason==='NO_TEST_CREDITS'?(betaSession()?.user.role==='admin'?t('관리자 무제한 테스트를 적용하려면 서버 업데이트가 필요합니다.','The server needs an update to enable unlimited administrator tests.'):t('생성 이용권이 부족합니다. 내 이용권을 확인해주세요.','You need a generation credit. Check your credits.')):reason==='PROVIDER_NOT_CONFIGURED'?t('이미지 생성 연결을 준비 중입니다. 관리자 설정이 필요합니다.','Image generation needs administrator configuration.'):status&&!status.generation.enabled?t('현재 이미지 생성을 사용할 수 없습니다. 관리자에게 문의해주세요.','Image generation is unavailable. Contact your administrator.'):t('생성 준비 상태를 확인하고 있습니다…','Checking generation readiness…');
 const budgetDetails=adminUnlimited&&reason==='BUDGET_NOT_AVAILABLE'&&status&&[status.budget.limitMicros,status.budget.spentMicros,status.budget.heldMicros].every(n=>Number.isFinite(n)&&n>=0)?status.budget:null;
 const reservationUsd=status?.generation.perRequestReservationUsd;
 const usd=(micros:number)=>'$'+(micros/1e6).toFixed(4);
 const labels:Record<GenerationJob['state'],string>={running:simple?t('광고 시안을 제작하고 있습니다. 잠시만 기다려 주세요.','We are creating your ad. Please wait.'):t('시안 제작 중','Creating your visual'),ready:t('결과를 확인해주세요','Review your result'),accepted:t('사용 확정한 시안','Accepted visual'),rejected:job?.creditCaptured?t('반려 · 자동 복원 없음','Rejected · no automatic refund'):t('반려 · 이용권 복원','Rejected · credit restored'),failed:t('실패 · 이용권 복원','Failed · credit restored'),uncertain:t('결과 미확인 · 이용권 복원','Result unconfirmed · credit restored'),expired:t('검토 만료 · 이용권 복원','Review expired · credit restored'),refunded:t('이용권 복원됨','Credit restored')};
 return <section className={`generation-panel${simple?' generation-simple':''}`}  aria-label={offlineDemo()?t('기기 내 체험 합성','Local demo composition'):t('AI 광고 제작','AI ad generation')}>
  {!simple&&<div className="generation-heading"><div><span className="eyebrow">{demo?'LOCAL DEMO':'AI CREATIVE'}</span><h2>{t('내 광고의 다음 시안.','Your next creative.')}</h2></div><button onClick={()=>void refresh()} disabled={busy||checking}><RefreshCw size={16}/>{t('연결 상태 확인','Refresh connection')}</button></div>}
  {simple&&project.generation.mode==='original'&&<div className="original-photo-notice">
   <strong>{t('현재 방식: 원본 사진 합성','Current mode: original-photo composition')}</strong>
   <p>{t('사진 속 흰 배경·여백도 그대로 남고, 문구는 정해진 배치로 합성됩니다. 상품·장면·큰 제목·가격을 함께 연출하려면 아래에서 AI 광고로 전환하세요.','The photo’s white background and margins remain, with text placed in a fixed layout. Switch to an AI ad to art-direct the subject, scene, headline and offer together.')}</p>
   {onCreativeDraft&&<><button type="button" disabled={busy||active||job?.state==='uncertain'||!!pending.current&&!job} onClick={()=>void creativeDraft()}>{t('같은 정보로 AI 광고 다시 기획','Plan an AI ad with these details')}</button>
   <small>{active?t('검토 중인 시안을 먼저 사용 확정하거나 반려해주세요.','Accept or reject the pending visual first.'):t('입력 내용을 유지한 새 초안을 엽니다. 전환만으로 생성·차감하지 않습니다. AI로 다시 그린 상품은 원본과 비교해 검수해야 합니다.','Opens a new draft with your details, without generating or charging. Review the AI-redrawn subject against the original.')}</small></>}
  </div>}
  {!simple&&<p>{demo?t('체험 시안은 기기에서 사진과 준비된 배경을 합성합니다. 새로운 AI 연출·품질이나 실물 3D 복원 시험은 아닙니다.','Demo visuals compose photos with prepared backgrounds on this device. This does not test new AI direction, quality or physical 3D reconstruction.'):project.generation.mode==='original'?t('원본 사진은 유지하고 새로운 배경을 요청합니다. 사진 안에 있는 배경은 자동 제거되지 않습니다.','Keep your original photo and request a new backdrop. Any background inside the original photo stays in place.'):t('참고 사진과 광고 방향으로 새로운 시안을 요청합니다. 상품의 형태·색상은 원본과 달라질 수 있습니다.','Create a new visual from your reference and direction. Product shape and color may differ from the original.')}</p>}
  {adminUnlimited&&<div className="admin-test-mode" role="status"><strong>{t('관리자 테스트 · 이용권 차감 없음','Administrator tests · No credits used')}</strong>{!simple&&<p>{t('이용권 개수 제한 없이 테스트합니다. 실제 API 사용 비용과 서버 예산 한도는 적용됩니다.','Test without a credit-count limit. API costs and server budget limits still apply.')}</p>}{simple&&<span>{t(' API 비용·예산 한도 적용',' API budget limits apply')}</span>}</div>}
  {!simple&&<div className="generation-status"><span>{demo?t('서버 없는 체험 합성','Offline demo composition'):status?.generation.enabled?t('생성 테스트 연결됨','Generation test connected'):t('생성 테스트 준비 중','Generation test pending')}</span>{status&&<span>{adminUnlimited?t('관리자 무제한 테스트','Unlimited administrator tests'):<>{t('테스트 이용권','Test credits')} {status.wallet.available} · {t('처리 중','Reserved')} {status.wallet.reserved}</>}</span>}</div>}
  {simple&&!status?.generation.enabled&&!reviewAvailable&&!applied&&<div className="simple-generation-block"><p role="status">{blocked}</p>{statusError==='AUTH_REQUIRED'?<a className="primary-action" href="#login">{t('로그인하고 생성하기','Sign in to generate')}</a>:<button type="button" disabled={checking} onClick={()=>void refresh()}>{checking?t('확인 중…','Checking…'):t('다시 확인','Check again')}</button>}{betaSession()?.user.role==='admin'&&reason&&<a href="#admin">{t('관리자 설정 확인','Check administrator settings')}</a>}</div>}
  {!simple&&<p role="status" aria-label={t('생성 상태 조회','Generation status check')}>{checking?t('서버에서 생성 가능 상태를 확인 중입니다…','Checking generation readiness with the server…'):statusError?t('상태 조회 실패 · 다시 확인할 수 있습니다.','Status check failed · You can retry.'):checked?<>{t('상태 확인 완료','Status checked')} · <time dateTime={checked.at}>{new Date(checked.at).toLocaleTimeString()}</time> · {checked.same?t('변경 없음','No change'):t('최신 상태 반영','Latest status loaded')}{!status?.generation.enabled&&t(' · 아직 생성할 수 없습니다. 아래 안내를 확인해주세요.',' · Generation is still unavailable. Check the guidance.')}</>:t('아직 조회하지 않았습니다.','Not checked yet.')}</p>}
  {isTextExample(project)&&<p role="note">{t('AI 예시 · 실제 상품 재현 아님. 저장 이미지에도 예시 표시가 포함됩니다.','AI example · Not an actual product reproduction. The saved image also includes this label.')}</p>}
  {referenceBlocked&&<div className="simple-generation-block"><p role="alert">{t('디자인 참고 사진을 사용하려면 서버 업데이트가 필요합니다. 관리자에게 문의해주세요.','Design references need a server update. Please contact your administrator.')}</p><button type="button" disabled={checking} onClick={()=>void refresh()}>{checking?t('확인 중…','Checking…'):t('다시 확인','Check again')}</button></div>}
  {budgetDetails&&(!simple||reason==='BUDGET_NOT_AVAILABLE')&&<div className="admin-budget-details" role="note" aria-label={t('이 계정의 생성 예산','This account’s generation budget')}><p>{t('월 배정','Monthly allocation')} {usd(budgetDetails.limitMicros)} · {t('사용','Spent')} {usd(budgetDetails.spentMicros)} · {t('보류','Held')} {usd(budgetDetails.heldMicros)} · {t('남은 예산','Available')} {usd(Math.max(0,budgetDetails.limitMicros-budgetDetails.spentMicros-budgetDetails.heldMicros))}</p>{typeof reservationUsd==='number'&&Number.isFinite(reservationUsd)&&reservationUsd>0&&<p>{t('생성 전 예약금','Reservation before generation')} {usd(reservationUsd*1e6)} · {t('실제 1회 요금과는 다릅니다.','This is not the actual price of one generation.')}</p>}<p>{t('보류액은 처리 중이거나 비용 확인이 필요한 금액입니다. 관리자 화면에서 배정과 최근 생성 내역을 확인하세요. 승인 원본 사진 분석 예산과는 별도입니다.','Holds cover work in progress or costs awaiting confirmation. Review allocation and recent generations in Administration. Approved reference-photo analysis has a separate budget.')}</p></div>}
  {!simple&&!adminUnlimited&&status?.generation.creditQuote?.unit!=='credit-v2'&&<p className="generation-hint">{t('새 시안 1개에 테스트 이용권 1개를 예약하며, 결과를 사용 확정할 때 차감합니다. 시스템 오류·반려는 복원합니다. 실제 결제는 연결되지 않았습니다.','One test credit is reserved per new visual and used only when you accept it. Errors and rejection restore it. Live payments are not connected.')}</p>}
  {issues.length>0&&<details><summary>{t('제작 전 확인할 내용','Before generating')}</summary><p>{t('광고 정보에서 사진·규격·제작 방향을 확인해주세요.','Check the photo, dimensions and creative direction in Ad details.')}</p></details>}
  {status?.generation.creditQuote?.unit==='credit-v2'&&<div className="generation-hint"><p>{t('신규 크레딧 잔액','New credit balance')}: {status.wallet.credits?.available??0} · {t('예약 중','Reserved')}: {status.wallet.credits?.reserved??0}. {t('생성·재생성 1회 10크레딧. 정상 결과 제공 시 차감하며 단순 취향 반려·미확인은 환급하지 않습니다. 오류는 신고 후 확인하여 복원합니다.','10 credits per generation or regeneration, charged on delivery. Preference rejection or no review does not refund. Report defects for review and restoration.')}</p><label><input type="checkbox" checked={creditConsent} disabled={busy||active} onChange={e=>setCreditConsent(e.target.checked)}/>{t('이번 생성 10크레딧 차감을 확인했습니다.','I confirm the 10-credit charge for this generation.')}</label></div>}
  {(!simple||status?.generation.enabled&&!(job?.state==='ready'&&compatible)&&job?.state!=='uncertain')&&<button className="generate-button" disabled={!recoveryChecked||!status?.generation.enabled||status.generation.creditQuote?.unit==='credit-v2'&&!creditConsent||referenceBlocked||busy||active||issues.length>0||!!pending.current&&!job} onClick={()=>void start()}><Sparkles size={17}/>{job?.state==='ready'&&!revisedReady?t('생성 완료 · 결과 확인','Generation complete · Review result'):pollStopped?t('결과 확인 필요','Check existing result'):job?.state==='running'?t('시안 제작 중…','Creating your visual…'):recovering?t('기존 요청 확인 중…','Checking existing request…'):status?.generation.creditQuote?.unit==='credit-v2'?t('광고 생성 · 10크레딧','Generate ad · 10 credits'):simple?(busy?t('생성 준비 중…','Preparing…'):active?t('광고 생성·확인 중','Creating or reviewing'):adminUnlimited?(job?.state==='accepted'?t('다른 시안 생성 · 관리자 테스트','Create another visual · Admin test'):t('광고 생성 · 관리자 테스트','Generate ad · Admin test')):job?.state==='accepted'?t('다른 시안 생성 · 1개','Create another visual · 1 credit'):t('광고 생성 · 1개','Generate ad · 1 credit')):busy?t('처리 중…','Working…'):adminUnlimited?t('관리자 테스트 생성 · 차감 없음','Admin test · No credits used'):demo?t('체험 시안 만들기 · 1개','Compose demo visual · 1 credit'):project.generation.mode==='original'?t('AI 배경 요청 · 1개','Create backdrop · 1 credit'):t('AI 새 시안 요청 · 1개','Create visual · 1 credit')}</button>}
  {recoveryError&&<p role="alert">{recoveryError}</p>}
  {simple&&(recoveryError||pollStopped||job?.state==='uncertain')&&<button type="button" disabled={busy||recovering} onClick={()=>void refresh()}>{t('기존 결과 다시 확인','Check existing results again')}</button>}
  {simple&&busy&&!job&&<p role="status">{t('광고 시안을 제작하고 있습니다. 잠시만 기다려 주세요.','We are creating your ad. Please wait.')}</p>}
  {pending.current&&!job&&(!simple||!busy)&&<p role="status">{t('이전 요청 상태를 확인하고 있습니다. 중복 생성을 막기 위해 새 요청을 보류합니다.','Checking the earlier request. New requests are paused to prevent duplicate generation.')}</p>}
   {job?.creditCaptured&&<details><summary>{t('결과 오류 신고','Report a result defect')}</summary><p>{t('오류 부위와 입력 정보와 다른 점을 적어주세요. 자동 판정·즉시 환급이 아닌 관리자 검토 요청입니다.','Describe the defect and mismatch with your input. This requests human review, not an automatic refund.')}</p><label>{t('오류 설명','Defect description')}<textarea value={defect} maxLength={2000} onChange={e=>setDefect(e.target.value)}/></label><button disabled={busy||defect.trim().length<10||Boolean(job.defectReport)} onClick={async()=>{setBusy(true);try{await apiRequest(`/api/generations/${job.id}/report`,{description:defect});setJob({...job,defectReport:{state:'pending'}});setNotice(t('신고가 접수되었습니다. 관리자 확인 후 처리합니다.','Report received for administrator review.'));}catch(e){failure(e);}finally{setBusy(false);}}}>{job.defectReport?t('신고 접수됨','Report received'):t('오류 신고 접수','Submit defect report')}</button></details>}
   {job&&!applied&&<div className="generation-result">{!revisedReady&&<strong role="status">{exemptJob&&['rejected','failed','uncertain','expired','refunded'].includes(job.state)?({rejected:t('반려 · 이용권 변동 없음','Rejected · no credit change'),failed:t('실패 · 이용권 변동 없음','Failed · no credit change'),uncertain:t('결과 미확인 · 이용권 변동 없음','Result unconfirmed · no credit change'),expired:t('검토 만료 · 이용권 변동 없음','Review expired · no credit change'),refunded:t('관리자 테스트 보정 · 이용권 변동 없음','Admin test corrected · no credit change')} as Record<string,string>)[job.state]:job.state==='running'&&reason==='BUDGET_NOT_AVAILABLE'?t('기존 생성 요청 처리 중 · 새 생성은 예산으로 차단됨','Existing generation is processing · budget blocks a new generation'):labels[job.state]}</strong>}{job.artifact&&(!simple||compatible)&&<>
   {!simple&&<p className="generation-preview-label"><b>{preview&&annotationIncomplete(preview.composed)?t('규격 표시 미완료 · 원본 시안','Dimension placement incomplete · original visual'):project.generation.mode==='original'?t('원본 사진 합성 미리보기','Original-photo composition preview'):t('광고 전체 미리보기','Complete ad preview')}</b>{!simple&&<span>{t('문구·가격·규격·연락처를 함께 확인하세요.','Review the copy, price, dimensions and contact details together.')}</span>}</p>}
   {preview?<img className="generation-ad-preview" src={preview.dataUrl} alt={t('광고카피와 상품 정보가 합성된 광고 미리보기','Complete ad with advertising copy and product information')}/>:!previewError&&compatible?<p role="status">{t('광고 문구와 상품 정보를 합성하고 있습니다…','Composing the ad copy and product information…')}</p>:null}
   {preview&&project.dimensionAnnotation?.mode&&project.dimensionAnnotation.mode!=='none'&&<DimensionAnnotationPanel project={preview.composed} change={fn=>change(p=>({...p,dimensionAnnotation:fn({...preview.composed,dimensionAnnotation:p.dimensionAnnotation}).dimensionAnnotation}))}/>}
   {previewError&&<p role="alert" className="generation-error">{previewError}</p>}{preview?.errors.map((issue,i)=><p role="alert" className="generation-error" key={i}>{issue}</p>)}
   {!simple&&!!dimensionAxes(project.productProfile).length&&<label className="generation-spec-toggle"><input type="checkbox" checked={project.dimensions.visible} disabled={busy} onChange={e=>change(p=>({...p,dimensions:{...p.dimensions,visible:e.target.checked}}))}/>{t('광고에 규격 표시','Show dimensions on ad')}<small>{specSummary(project.dimensions,project.productProfile)}</small></label>}
   <button type="button" className="generation-enlarge" disabled={!previewReady} onClick={()=>setEnlarged(true)}>{t('확대 검수','Inspect enlarged visual')}</button>{!simple&&<small>{complete?t('완성 이미지에 문구가 포함되어 있습니다. 문구·규격 표시·연락처 변경은 새 생성에 반영됩니다. 기존 이미지의 글자는 직접 바뀌지 않습니다.','The finished image includes its copy. Copy, dimension-display or contact changes require a new visual; existing lettering does not change directly.'):t('문구나 규격 표시를 수정하면 같은 사진으로 광고를 다시 합성합니다. 추가 AI 호출과 이용권 차감은 없습니다.','Copy or dimension-display edits recompose the same photo without another AI request or credit charge.')}</small>}
   {!simple&&<details className="generation-raw-photo"><summary>{complete?t('생성된 광고 원본 보기','View the generated ad'):t('AI 사진 원본 보기','View the AI photograph')}</summary><img src={job.artifact.dataUrl} alt={complete?t('생성된 완성 광고','Generated finished ad'):t('문구 합성 전 AI 사진','AI photograph before copy composition')}/></details>}
   <details className="generation-checklist"><summary>{t('검수 항목','Review checklist')}</summary><ul><li>{t('비율: 원본과 본체·손잡이·부속품의 크기 및 원근 비교','Proportions: compare body, handle, parts and perspective with the source')}</li><li>{t('티끌: 로고 주변·네 모서리의 점, 선, 글자 잔상과 깨진 윤곽 확인','Stray marks: inspect logos and all corners for dots, strokes, letter fragments and broken outlines')}</li><li>{t('규격: 입력한 가로·세로·높이와 단위, 출력 비율 확인. 치수 표기만으로 실제 형상이 검증되지는 않습니다.','Dimensions: check supplied axes, units and output ratio. Correct labels alone do not verify physical geometry.')}</li><li>{t('최종 문구: 회사명·연락처·상품명·규격·가격의 오타, 겹침과 잘림 확인','Final copy: check names, contacts, dimensions and prices for typos, overlap and cropping')}</li></ul>{!isTextExample(project)&&project.product&&<img src={project.product.data} alt={t('검수용 원본 사진','Original photo for review')}/>}</details></>}
   {preview?.composed.generated?.dimensionPlan&&<DimensionResult plan={preview.composed.generated.dimensionPlan}/>}
   {preview?.composed.generated?.planarReport&&<PlanarResult report={preview.composed.generated.planarReport} original={preview.composed.generated.planarOriginal}/>}
   {(job.state==='ready'||job.state==='accepted')&&<>{!compatible&&<p role="alert">{revisedReady?t('입력이 바뀌었습니다. 새 광고를 생성할 수 있으며 이전 결과와 차감 내역은 유지됩니다.','Details changed. You can generate a new ad; the previous result and charges are preserved.'):t('사진·상품 설정 또는 완성 광고의 문구·규격 표시·연락처가 바뀌었습니다. 원래 정보를 복원하거나 시안을 반려한 뒤 현재 정보로 새로 생성해주세요.','The photo, product settings or finished ad copy, dimension display or contacts changed. Restore the original details, or reject the visual and generate with the current details.')}</p>}{!aiDimensionRequested(project)&&project.dimensionAnnotation?.mode&&project.dimensionAnnotation.mode!=='none'&&<p role="status">{t('선택한 사진 규격 표시를 미리보기에 합성한 뒤 사용 확정할 수 있습니다. 미완료 상태에서는 확정·저장하지 않습니다.','Accept only after the requested photo dimensions are composed in this preview. Incomplete placement cannot be accepted or exported.')}</p>}{aiDimensionRequested(project)&&<fieldset aria-label={t('AI 규격 표시 직접 검수','Review AI dimension display')}><legend>{t('AI 규격 표시 직접 검수','Review AI dimension display')}</legend><p>{t('검수 체크는 자동 정확도 보증이 아닙니다. 잘못된 글자·축이나 누락이 있으면 확정하지 말고 반려해주세요.','These checks are your review, not an automatic accuracy guarantee. Reject incorrect text, axes or missing labels instead of accepting.')}</p>{([['values',t('입력한 수치와 단위가 모두 정확합니다.','All entered values and units are correct.')],['axes',t('치수선의 양 끝이 해당 상품 축의 실제 경계와 맞습니다.','Both arrow endpoints align with the actual boundaries of the measured product axis.')],['complete',t('선택한 배치에 누락·가림 없이 모두 표시됐습니다.','The chosen layout shows every label without omissions or obstruction.')]] as const).map(([key,label])=><label key={key} className="generation-review"><input type="checkbox" checked={dimensionChecks[key]} disabled={!compatible||!previewReady} onChange={e=>setDimensionChecks(v=>({...v,[key]:e.target.checked}))}/>{label}</label>)}</fieldset>}<label className="generation-review"><input type="checkbox" checked={reviewed} disabled={!compatible||!previewReady} onChange={e=>setReviewed(e.target.checked)}/>{t('상품·재질 구조·규격·가격·문구를 확인했습니다.','I reviewed the product, material structure, dimensions, price and copy.')}</label><div className="generation-review-actions"><button disabled={busy||!reviewed||!compatible||!previewReady||aiDimensionRequested(project)&&!Object.values(dimensionChecks).every(Boolean)} onClick={()=>void accept()}><Check size={16}/>{job.state==='accepted'?t('저장한 시안 다시 적용','Reapply accepted visual'):job.creditCaptured?t('사용 확정 · 추가 차감 없음','Accept · no extra charge'):exemptJob?t('사용 확정 · 이용권 차감 없음','Accept · No credits used'):t('사용 확정 · 1개 차감','Accept · use 1 credit')}</button>{job.state==='ready'&&<button disabled={busy} onClick={()=>void reject()}><X size={16}/>{job.creditCaptured?t('반려 · 자동 복원 없음','Reject · no automatic refund'):exemptJob?t('시안 반려','Reject visual'):t('반려 · 이용권 복원','Reject · restore credit')}</button>}</div></>}
   {job.artifact&&job.marketingPlan&&compatible&&<MarketingSummary plan={job.marketingPlan} saved/>}
   {job.state==='uncertain'&&<p>{t('결과를 확인하지 못했습니다. 기존 결과를 다시 확인해주세요. 중복 생성을 막기 위해 새 요청은 보내지 않습니다.','The result is unconfirmed. Check the existing result again. No new request will be sent to avoid duplicate generation.')}</p>}
  </div>}
  {enlarged&&previewReady&&<ImageReview label={t('시안 확대 검수','Enlarged visual inspection')} onClose={()=>setEnlarged(false)}><img src={preview!.dataUrl} alt={t('광고 전체 확대 검수','Inspect the complete ad')}/></ImageReview>}
  {error&&<p role="alert" className="generation-error">{error}</p>}{notice&&<p role="status" className="generation-notice">{notice}</p>}
 </section>;
}


