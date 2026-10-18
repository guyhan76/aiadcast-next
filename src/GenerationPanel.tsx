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
import {buildGenerationRequest,generationIssues} from './generation';
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
type Pending={projectId:string;requestId:string;key:string;jobId?:string};
type JobResponse={job:GenerationJob;wallet:ApiStatus['wallet']};
type AdPreview={source:Project;composed:Project;dataUrl:string;errors:string[];jobId:string};
export function GenerationPanel({project,change,simple=false,onCreativeDraft,autoRequest,onAutoHandled}:{project:Project;change:(fn:(p:Project)=>Project)=>void;simple?:boolean;onCreativeDraft?:()=>Promise<void>;autoRequest?:string;onAutoHandled?:()=>void}){
 const {t}=useUiLanguage();const [status,setStatus]=useState<ApiStatus|null>(null),[job,setJob]=useState<GenerationJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reviewed,setReviewed]=useState(false);
 const [statusError,setStatusError]=useState('');const autoHandled=useRef('');
 const latest=useRef(project);latest.current=project;const alive=useRef(true);const pending=useRef<Pending|null>(null);const storageKey=(storageNamespace()==='guest'?'':storageNamespace()+':')+`aiadcast.pending-generation.${project.id}`;
 const [enlarged,setEnlarged]=useState(false);
 const [preview,setPreview]=useState<AdPreview|null>(null),[previewError,setPreviewError]=useState('');
 const previewRef=useRef<AdPreview|null>(null);
 const remember=(value:Pending|null)=>{pending.current=value;try{if(value)localStorage.setItem(storageKey,JSON.stringify(value));else localStorage.removeItem(storageKey);}catch{/* API history still keeps the job. */}};
 const failure=(e:unknown)=>{const code=e instanceof Error?e.message:'';setError(code==='PLANAR_SOURCE_UNCONFIRMED'?t('정면 평면 외곽이나 입력 비례를 확인하지 못했습니다. 가림 없는 정면 사진·가로·세로를 확인해주세요. 유료 생성을 요청하지 않았습니다.','Could not confirm the front plane outline or dimensions. Check the unobstructed front photo and measurements. No paid generation was dispatched.'):code==='PROPORTION_MISMATCH'?t('입력 규격과 사진 비례가 다릅니다. 자동 검사에서 촬영면·규격·전체 외곽을 확인해주세요. 새 시안은 요청하지 않았습니다.','Photo proportions differ from the dimensions. Check views, dimensions and full extent in the automatic check. No visual was requested.'):code==='BUDGET_NOT_AVAILABLE'?t('테스트 비용 한도에 도달했습니다. 추가 생성은 중단했습니다.','The test budget is exhausted. Generation is paused.'):code==='ARTIFACT_MISMATCH'||code==='INVALID_ARTIFACT'?t('결과 파일 검증에 실패했습니다. 사용 확정하지 않았습니다.','The result failed file validation. It has not been accepted.'):t('연결 또는 요청을 확인하지 못했습니다. 자동으로 다시 생성하지 않습니다. 연결 상태와 기존 작업을 확인해주세요.','The request could not be confirmed. No automatic regeneration will occur. Refresh the connection and check the existing job.'));};
 async function refresh(){
  try{
   const data=await apiRequest<ApiStatus>('/api/status');if(!alive.current)return;setStatus(data);setError('');setStatusError('');
   const record=pending.current;if(!record)return;
   let id=record.jobId;
   if(!id){const history=await apiRequest<{jobs:GenerationJob[]}>(`/api/generations?projectId=${encodeURIComponent(project.id)}`);id=history.jobs.find(j=>j.requestId===record.requestId||j.requestIds?.includes(record.requestId))?.id;}
   if(id){const result=await apiRequest<JobResponse>(`/api/generations/${id}`);if(!alive.current)return;remember({...record,jobId:id});setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);}
  }catch(e){if(alive.current){setStatus(null);setStatusError(e instanceof ApiRequestFailure?e.code:'CONNECTION_UNAVAILABLE');if(pending.current)failure(e);}}
 }
 useEffect(()=>{alive.current=true;try{const raw=JSON.parse(localStorage.getItem(storageKey)??'null');if(raw?.projectId===project.id&&typeof raw.requestId==='string'&&typeof raw.key==='string')pending.current=raw;}catch{/* Invalid local state is ignored. */}void refresh();return()=>{alive.current=false;};},[project.id]);
 useEffect(()=>{
  if(job?.state!=='running')return;let cancelled=false;
  const timer=setInterval(()=>{void apiRequest<JobResponse>(`/api/generations/${job.id}`).then(result=>{if(!cancelled){setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);}}).catch(()=>{if(!cancelled)setError(t('상태 확인이 지연되고 있습니다. 새 생성 없이 다시 확인합니다.','Status updates are delayed. Checking again without starting a new generation.'));});},2000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[job?.id,job?.state]);
 const complete=job?.composition==='complete-ad';
 const compatible=!!pending.current&&pending.current.key===generatedCompatibilityKey(project)&&job?.sourceHash===(project.product?.sha256??null)&&job?.mode===project.generation.mode&&(!complete||job?.compositionKey===completeAdKey(project));
 const issues=generationIssues(project);const active=job?.state==='running'||job?.state==='ready';
 useEffect(()=>{
  if(previewRef.current?.source===project&&previewRef.current.jobId===job?.id&&compatible&&job?.artifact)return;
  let cancelled=false;setReviewed(false);setEnlarged(false);setPreviewError('');if(!compatible||!job?.artifact||previewRef.current?.jobId!==job.id){setPreview(null);previewRef.current=null;}
  if(!job?.artifact||!compatible)return;
  const currentJob=job;
  void (async()=>{
   try{
    const marketingPlan=parseMarketingPlan(currentJob.marketingPlan??undefined);if(marketingPlan&&(marketingPlan.input.sourceHash!==currentJob.sourceHash||marketingPlan.input.mode!==currentJob.mode))throw Error('INVALID_ARTIFACT');
    const asset=await verifiedArtifact(currentJob);
    const dimensionPlan=parseDimensionPlan(currentJob.dimensionPlan);
    const expectedPlan=buildGenerationRequest(project).dimensionPlan;
    if(JSON.stringify(dimensionPlan)!==JSON.stringify(expectedPlan))throw Error('INVALID_ARTIFACT');
    const planarReport=parsePlanarReport(currentJob.planarReport);
    let planarOriginal;
    if(project.generation.planarSourceHash&&!planarReport)throw Error('INVALID_ARTIFACT');
    if(planarReport){const raw=currentJob.planarOriginal;if(!project.generation.planarSourceHash||Math.abs(planarReport.expectedRatio-Number(project.dimensions.width)/Number(project.dimensions.depth))>1e-9||planarReport.variantLabel!==(project.generation.dimensionVariant??'')||planarReport.outputRatio!==null&&Math.abs(asset.width/asset.height-planarReport.outputRatio)>1e-9||!raw||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.dataUrl)||raw.dataUrl.length>14000000||raw.sha256!==planarReport.originalHash)throw Error('INVALID_ARTIFACT');const response=await fetch(raw.dataUrl);planarOriginal=await imageFile(new File([await response.blob()],'generated-before-adjustment.png',{type:'image/png'}));if(planarOriginal.sha256!==raw.sha256||planarOriginal.width!==raw.width||planarOriginal.height!==raw.height)throw Error('INVALID_ARTIFACT');}

    const composed=projectWithGenerated(project,{jobId:currentJob.id,mode:currentJob.mode,sourceHash:currentJob.sourceHash,asset,...(dimensionPlan?{dimensionPlan}:{}),...(planarReport?{planarReport,planarOriginal}:{}),role:currentJob.artifact!.role,model:currentJob.model,createdAt:currentJob.createdAt,specificationKey:pending.current!.key,...(marketingPlan?{marketingPlan}:{}),...(currentJob.composition?{composition:currentJob.composition}:{}),...(currentJob.compositionKey?{compositionKey:currentJob.compositionKey}:{})});
    const canvas=document.createElement('canvas'),errors=await render(canvas,composed);
    if(cancelled||latest.current!==project)return;
    const ready={source:project,composed,dataUrl:canvas.toDataURL('image/png'),errors,jobId:currentJob.id};previewRef.current=ready;setPreview(ready);
   }catch(e){if(!cancelled)setPreviewError(e instanceof Error&&['ARTIFACT_MISMATCH','INVALID_ARTIFACT'].includes(e.message)?t('결과 파일 검증에 실패했습니다. 사용 확정하지 않았습니다.','The result failed file validation. It has not been accepted.'):t('광고 미리보기를 만들지 못했습니다. 사용 확정하지 않았습니다. 연결 상태를 확인해주세요.','Could not compose the ad preview. It has not been accepted. Check the connection.'));}
  })();
  return()=>{cancelled=true;};
 },[project,job?.id,job?.artifactId,!!job?.artifact,compatible]);
 const previewReady=!!preview&&preview.source===project&&preview.jobId===job?.id&&!preview.errors.length;
 useEffect(()=>{if(!autoRequest||autoHandled.current===autoRequest||(!status&&!statusError)||(!!pending.current&&!job))return;autoHandled.current=autoRequest;onAutoHandled?.();if(status?.generation.enabled&&(!job||!['running','ready','uncertain'].includes(job.state)))void start();},[autoRequest,status,statusError,job?.id,job?.state]);
 async function start(){
  if(needsPhotoPurposeServer(latest.current,status?.generation.photoPurposes))return;
  if(latest.current.generation.dimensionBased&&!status?.generation.dimensionVariants){setError(t('서버가 규격 기반 생성을 지원하지 않습니다. 옵션을 끄거나 서버 업데이트를 확인해주세요.','The server does not support dimension-based generation. Turn it off or check the server update.'));return;}
  if(latest.current.generation.planarSourceHash&&!status?.generation.planarControl){setError(t('서버가 규격 기반 평면 생성을 지원하지 않습니다. 옵션을 끄거나 서버 업데이트를 확인해주세요.','The server does not support planar dimension control. Turn it off or check the server update.'));return;}
  const snapshot=latest.current;if(busy||active||pending.current&&!job)return;
  setBusy(true);setError('');setNotice('');setReviewed(false);
  try{
   if(snapshot.dimensionAnnotation?.mode&&snapshot.dimensionAnnotation.mode!=='none'){const capability=await apiRequest<{available:boolean}>('/api/dimension-analysis');if(!capability.available){setError(t('선택한 사진 규격 표시를 완성할 수 없어 새 AI 생성을 요청하지 않았습니다. 규격 표시 경로가 준비된 뒤 다시 진행해주세요. 입력 내용은 보관했습니다.','No new AI generation was requested because the selected photo dimensions cannot be completed. Continue when dimension placement is available. Your inputs are preserved.'));return;}}
   const measured=await preflightProportions(snapshot);if(measured?.status==='mismatch')throw Error('PROPORTION_MISMATCH');if(latest.current!==snapshot)throw Error('STALE_PROJECT');const request=buildGenerationRequest(snapshot);await saveProject(snapshot);const record={projectId:snapshot.id,requestId:crypto.randomUUID(),key:generatedCompatibilityKey(snapshot)};remember(record);setJob(null);
   const result=await apiRequest<JobResponse>('/api/generations',{projectId:snapshot.id,requestId:record.requestId,request,source:snapshot.product,references:snapshot.references??[]});
   if(!alive.current)return;remember({...record,jobId:result.job.id});setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);
  }catch(e){if(alive.current){if(e instanceof ApiRequestFailure&&['PLANAR_SOURCE_UNCONFIRMED','INVALID_PLANAR_CONTROL','INVALID_DIMENSION_PLAN','INVALID_REQUEST','INVALID_SPECIFICATIONS','REGION_EDIT_NOT_AVAILABLE','SOURCE_MISMATCH','INVALID_IMAGE','SOURCE_REQUIRED','GENERATION_DISABLED','PROVIDER_NOT_CONFIGURED','BUDGET_NOT_AVAILABLE','NO_TEST_CREDITS','GENERATION_ALREADY_RUNNING','REVIEW_REQUIRED_AFTER_REJECTIONS','JSON_REQUIRED','REQUEST_TOO_LARGE','CLIENT_HEADER_REQUIRED','ORIGIN_NOT_ALLOWED','LOCAL_ACCESS_ONLY','TOO_MANY_REQUESTS'].includes(e.code))remember(null);failure(e);}}finally{if(alive.current)setBusy(false);}
 }
 async function accept(){
  if(!job||!compatible||!reviewed||!previewReady||busy)return;setBusy(true);setError('');
  try{
   // The fully rendered, hash-verified ad must be reviewed before accepting a charge.
   const reviewedAd=previewRef.current,record=pending.current;if(!reviewedAd||reviewedAd.source!==latest.current||reviewedAd.errors.length||!record||record.key!==generatedCompatibilityKey(latest.current))throw Error('STALE_PROJECT');
   const result=job.state==='accepted'?{job,wallet:status!.wallet}:await apiRequest<JobResponse>(`/api/generations/${job.id}/accept`,{artifactId:job.artifactId});
   if(!alive.current)return;
   if(reviewedAd.source!==latest.current||record.key!==generatedCompatibilityKey(latest.current))throw Error('STALE_PROJECT');
   const applied={...reviewedAd,source:reviewedAd.composed};previewRef.current=applied;setPreview(applied);
   change(p=>p!==reviewedAd.source?p:reviewedAd.composed);
   setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);setNotice(t('확인한 광고 전체를 적용했습니다. 문구·규격·연락처가 포함된 광고를 PNG로 저장하세요.','Your reviewed complete ad is applied. Export the PNG with its copy, dimensions and contact information.'));
  }catch(e){failure(e);}finally{if(alive.current)setBusy(false);}
 }
 async function reject(){if(!job||busy)return;setBusy(true);try{const result=await apiRequest<JobResponse>(`/api/generations/${job.id}/reject`,{});if(!alive.current)return;setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);remember(null);setReviewed(false);setNotice(job.creditPolicy==='admin-unlimited'&&job.creditCost===0?t('관리자 테스트 시안을 반려했습니다. 이용권 변동은 없습니다.','Administrator test rejected. No credit balance changed.'):t('시안을 반려하고 테스트 이용권을 복원했습니다.','The visual was rejected and the test credit was restored.'));}catch(e){failure(e);}finally{if(alive.current)setBusy(false);}}
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
 const blocked=statusError==='AUTH_REQUIRED'?t('이미지를 생성하려면 로그인해주세요. 입력한 광고 정보는 보관했습니다.','Sign in to generate your image. Your ad details are kept.'):statusError?t('서버 상태를 확인하지 못했습니다. 다시 확인해주세요.','Could not check the server. Please retry.'):reason==='BUDGET_NOT_AVAILABLE'?(adminUnlimited?t('관리자 이용권은 차감되지 않지만 이미지 생성용 예산이 부족합니다. 이 계정의 월 배정·사용·보류액을 확인해주세요.','Administrator credits are exempt, but the image generation budget is insufficient. Check this account’s monthly allocation, spend and holds.'):t('테스트 생성 한도에 도달했습니다. 관리자에게 한도 확인을 요청해주세요.','The test generation budget is exhausted. Ask your administrator to check it.')):reason==='NO_TEST_CREDITS'?(betaSession()?.user.role==='admin'?t('관리자 무제한 테스트를 적용하려면 서버 업데이트가 필요합니다.','The server needs an update to enable unlimited administrator tests.'):t('생성 이용권이 부족합니다. 내 이용권을 확인해주세요.','You need a generation credit. Check your credits.')):reason==='PROVIDER_NOT_CONFIGURED'?t('이미지 생성 연결을 준비 중입니다. 관리자 설정이 필요합니다.','Image generation needs administrator configuration.'):status&&!status.generation.enabled?t('현재 이미지 생성을 사용할 수 없습니다. 관리자에게 문의해주세요.','Image generation is unavailable. Contact your administrator.'):t('생성 준비 상태를 확인하고 있습니다…','Checking generation readiness…');
 const budgetDetails=adminUnlimited&&reason==='BUDGET_NOT_AVAILABLE'&&status&&[status.budget.limitMicros,status.budget.spentMicros,status.budget.heldMicros].every(n=>Number.isFinite(n)&&n>=0)?status.budget:null;
 const reservationUsd=status?.generation.perRequestReservationUsd;
 const usd=(micros:number)=>'$'+(micros/1e6).toFixed(4);
 const labels:Record<GenerationJob['state'],string>={running:t('시안 제작 중','Creating your visual'),ready:t('결과를 확인해주세요','Review your result'),accepted:t('사용 확정한 시안','Accepted visual'),rejected:t('반려 · 이용권 복원','Rejected · credit restored'),failed:t('실패 · 이용권 복원','Failed · credit restored'),uncertain:t('처리 확인 중 · 이용권 복원','Provider status uncertain · credit restored'),expired:t('검토 만료 · 이용권 복원','Review expired · credit restored'),refunded:t('이용권 복원됨','Credit restored')};
 return <section className={`generation-panel${simple?' generation-simple':''}`}  aria-label={offlineDemo()?t('기기 내 체험 합성','Local demo composition'):t('AI 광고 제작','AI ad generation')}>
  {!simple&&<div className="generation-heading"><div><span className="eyebrow">{demo?'LOCAL DEMO':'AI CREATIVE'}</span><h2>{t('내 광고의 다음 시안.','Your next creative.')}</h2></div><button onClick={()=>void refresh()} disabled={busy}><RefreshCw size={16}/>{t('연결 상태 확인','Refresh connection')}</button></div>}
  {simple&&project.generation.mode==='original'&&<div className="original-photo-notice">
   <strong>{t('현재 방식: 원본 사진 합성','Current mode: original-photo composition')}</strong>
   <p>{t('사진 속 흰 배경·여백도 그대로 남고, 문구는 정해진 배치로 합성됩니다. 상품·장면·큰 제목·가격을 함께 연출하려면 아래에서 AI 광고로 전환하세요.','The photo’s white background and margins remain, with text placed in a fixed layout. Switch to an AI ad to art-direct the subject, scene, headline and offer together.')}</p>
   {onCreativeDraft&&<><button type="button" disabled={busy||active||job?.state==='uncertain'||!!pending.current&&!job} onClick={()=>void creativeDraft()}>{t('같은 정보로 AI 광고 다시 기획','Plan an AI ad with these details')}</button>
   <small>{active?t('검토 중인 시안을 먼저 사용 확정하거나 반려해주세요.','Accept or reject the pending visual first.'):t('입력 내용을 유지한 새 초안을 엽니다. 전환만으로 생성·차감하지 않습니다. AI로 다시 그린 상품은 원본과 비교해 검수해야 합니다.','Opens a new draft with your details, without generating or charging. Review the AI-redrawn subject against the original.')}</small></>}
  </div>}
  {!simple&&<p>{demo?t('체험 시안은 기기에서 사진과 준비된 배경을 합성합니다. 새로운 AI 연출·품질이나 실물 3D 복원 시험은 아닙니다.','Demo visuals compose photos with prepared backgrounds on this device. This does not test new AI direction, quality or physical 3D reconstruction.'):project.generation.mode==='original'?t('원본 사진은 유지하고 새로운 배경을 요청합니다. 사진 안에 있는 배경은 자동 제거되지 않습니다.','Keep your original photo and request a new backdrop. Any background inside the original photo stays in place.'):t('참고 사진과 광고 방향으로 새로운 시안을 요청합니다. 상품의 형태·색상은 원본과 달라질 수 있습니다.','Create a new visual from your reference and direction. Product shape and color may differ from the original.')}</p>}
  {adminUnlimited&&<div className="admin-test-mode" role="status"><strong>{t('관리자 테스트 · 이용권 차감 없음','Administrator tests · No credits used')}</strong><p>{t('이용권 개수 제한 없이 테스트합니다. 실제 API 사용 비용과 서버 예산 한도는 적용됩니다.','Test without a credit-count limit. API costs and server budget limits still apply.')}</p></div>}
  {!simple&&<div className="generation-status"><span>{demo?t('서버 없는 체험 합성','Offline demo composition'):status?.generation.enabled?t('생성 테스트 연결됨','Generation test connected'):t('생성 테스트 준비 중','Generation test pending')}</span>{status&&<span>{adminUnlimited?t('관리자 무제한 테스트','Unlimited administrator tests'):<>{t('테스트 이용권','Test credits')} {status.wallet.available} · {t('처리 중','Reserved')} {status.wallet.reserved}</>}</span>}</div>}
  {simple&&!status?.generation.enabled&&!reviewAvailable&&!applied&&<div className="simple-generation-block"><p role="status">{blocked}</p>{statusError==='AUTH_REQUIRED'?<a className="primary-action" href="#login">{t('로그인하고 생성하기','Sign in to generate')}</a>:<button type="button" onClick={()=>void refresh()}>{t('다시 확인','Check again')}</button>}{betaSession()?.user.role==='admin'&&reason&&<a href="#admin">{t('관리자 설정 확인','Check administrator settings')}</a>}</div>}
  {referenceBlocked&&<div className="simple-generation-block"><p role="alert">{t('디자인 참고 사진을 사용하려면 서버 업데이트가 필요합니다. 관리자에게 문의해주세요.','Design references need a server update. Please contact your administrator.')}</p><button type="button" onClick={()=>void refresh()}>{t('다시 확인','Check again')}</button></div>}
  {budgetDetails&&<div className="admin-budget-details" role="note" aria-label={t('이 계정의 생성 예산','This account’s generation budget')}><p>{t('월 배정','Monthly allocation')} {usd(budgetDetails.limitMicros)} · {t('사용','Spent')} {usd(budgetDetails.spentMicros)} · {t('보류','Held')} {usd(budgetDetails.heldMicros)} · {t('남은 예산','Available')} {usd(Math.max(0,budgetDetails.limitMicros-budgetDetails.spentMicros-budgetDetails.heldMicros))}</p>{typeof reservationUsd==='number'&&Number.isFinite(reservationUsd)&&reservationUsd>0&&<p>{t('생성 전 예약금','Reservation before generation')} {usd(reservationUsd*1e6)} · {t('실제 1회 요금과는 다릅니다.','This is not the actual price of one generation.')}</p>}<p>{t('보류액은 처리 중이거나 비용 확인이 필요한 금액입니다. 관리자 화면에서 배정과 최근 생성 내역을 확인하세요. 승인 원본 사진 분석 예산과는 별도입니다.','Holds cover work in progress or costs awaiting confirmation. Review allocation and recent generations in Administration. Approved reference-photo analysis has a separate budget.')}</p></div>}
  {!simple&&!adminUnlimited&&<p className="generation-hint">{t('새 시안 1개에 테스트 이용권 1개를 예약하며, 결과를 사용 확정할 때 차감합니다. 시스템 오류·반려는 복원합니다. 실제 결제는 연결되지 않았습니다.','One test credit is reserved per new visual and used only when you accept it. Errors and rejection restore it. Live payments are not connected.')}</p>}
  {issues.length>0&&<details><summary>{t('제작 전 확인할 내용','Before generating')}</summary><p>{t('광고 정보에서 사진·규격·제작 방향을 확인해주세요.','Check the photo, dimensions and creative direction in Ad details.')}</p></details>}
  {(!simple||status?.generation.enabled)&&<button className="generate-button" disabled={!status?.generation.enabled||referenceBlocked||busy||active||issues.length>0||!!pending.current&&!job} onClick={()=>void start()}><Sparkles size={17}/>{simple?(busy?t('생성 준비 중…','Preparing…'):active?t('광고 생성·확인 중','Creating or reviewing'):adminUnlimited?(job?.state==='accepted'?t('다른 시안 생성 · 관리자 테스트','Create another visual · Admin test'):t('광고 생성 · 관리자 테스트','Generate ad · Admin test')):job?.state==='accepted'?t('다른 시안 생성 · 1개','Create another visual · 1 credit'):t('광고 생성 · 1개','Generate ad · 1 credit')):busy?t('처리 중…','Working…'):adminUnlimited?t('관리자 테스트 생성 · 차감 없음','Admin test · No credits used'):demo?t('체험 시안 만들기 · 1개','Compose demo visual · 1 credit'):project.generation.mode==='original'?t('AI 배경 요청 · 1개','Create backdrop · 1 credit'):t('AI 새 시안 요청 · 1개','Create visual · 1 credit')}</button>}
  {pending.current&&!job&&<p role="status">{t('이전 요청 상태를 확인하고 있습니다. 중복 생성을 막기 위해 새 요청을 보류합니다.','Checking the earlier request. New requests are paused to prevent duplicate generation.')}</p>}
   {job&&!applied&&<div className="generation-result"><strong role="status">{exemptJob&&['rejected','failed','uncertain','expired','refunded'].includes(job.state)?({rejected:t('반려 · 이용권 변동 없음','Rejected · no credit change'),failed:t('실패 · 이용권 변동 없음','Failed · no credit change'),uncertain:t('처리 확인 중 · 이용권 변동 없음','Provider status uncertain · no credit change'),expired:t('검토 만료 · 이용권 변동 없음','Review expired · no credit change'),refunded:t('관리자 테스트 보정 · 이용권 변동 없음','Admin test corrected · no credit change')} as Record<string,string>)[job.state]:labels[job.state]}</strong>{job.artifact&&<>
   <p className="generation-preview-label"><b>{preview&&annotationIncomplete(preview.composed)?t('규격 표시 미완료 · 원본 시안','Dimension placement incomplete · original visual'):project.generation.mode==='original'?t('원본 사진 합성 미리보기','Original-photo composition preview'):t('광고 전체 미리보기','Complete ad preview')}</b><span>{t('문구·가격·규격·연락처를 함께 확인하세요.','Review the copy, price, dimensions and contact details together.')}</span></p>
   {preview?<img className="generation-ad-preview" src={preview.dataUrl} alt={t('광고카피와 상품 정보가 합성된 광고 미리보기','Complete ad with advertising copy and product information')}/>:!previewError&&compatible?<p role="status">{t('광고 문구와 상품 정보를 합성하고 있습니다…','Composing the ad copy and product information…')}</p>:null}
   {preview&&project.dimensionAnnotation?.mode&&project.dimensionAnnotation.mode!=='none'&&<DimensionAnnotationPanel project={preview.composed} change={fn=>change(p=>({...p,dimensionAnnotation:fn({...preview.composed,dimensionAnnotation:p.dimensionAnnotation}).dimensionAnnotation}))}/>}
   {previewError&&<p role="alert" className="generation-error">{previewError}</p>}{preview?.errors.map((issue,i)=><p role="alert" className="generation-error" key={i}>{issue}</p>)}
   {!simple&&!!dimensionAxes(project.productProfile).length&&<label className="generation-spec-toggle"><input type="checkbox" checked={project.dimensions.visible} disabled={busy} onChange={e=>change(p=>({...p,dimensions:{...p.dimensions,visible:e.target.checked}}))}/>{t('광고에 규격 표시','Show dimensions on ad')}<small>{specSummary(project.dimensions,project.productProfile)}</small></label>}
   <button type="button" className="generation-enlarge" disabled={!previewReady} onClick={()=>setEnlarged(true)}>{t('확대 검수','Inspect enlarged visual')}</button><small>{complete?t('완성 이미지에 문구가 포함되어 있습니다. 문구·규격 표시·연락처 변경은 새 생성에 반영됩니다. 기존 이미지의 글자는 직접 바뀌지 않습니다.','The finished image includes its copy. Copy, dimension-display or contact changes require a new visual; existing lettering does not change directly.'):t('문구나 규격 표시를 수정하면 같은 사진으로 광고를 다시 합성합니다. 추가 AI 호출과 이용권 차감은 없습니다.','Copy or dimension-display edits recompose the same photo without another AI request or credit charge.')}</small>
   {!simple&&<details className="generation-raw-photo"><summary>{complete?t('생성된 광고 원본 보기','View the generated ad'):t('AI 사진 원본 보기','View the AI photograph')}</summary><img src={job.artifact.dataUrl} alt={complete?t('생성된 완성 광고','Generated finished ad'):t('문구 합성 전 AI 사진','AI photograph before copy composition')}/></details>}
   <details className="generation-checklist"><summary>{t('검수 항목','Review checklist')}</summary><ul><li>{t('비율: 원본과 본체·손잡이·부속품의 크기 및 원근 비교','Proportions: compare body, handle, parts and perspective with the source')}</li><li>{t('티끌: 로고 주변·네 모서리의 점, 선, 글자 잔상과 깨진 윤곽 확인','Stray marks: inspect logos and all corners for dots, strokes, letter fragments and broken outlines')}</li><li>{t('규격: 입력한 가로·세로·높이와 단위, 출력 비율 확인. 치수 표기만으로 실제 형상이 검증되지는 않습니다.','Dimensions: check supplied axes, units and output ratio. Correct labels alone do not verify physical geometry.')}</li><li>{t('최종 문구: 회사명·연락처·상품명·규격·가격의 오타, 겹침과 잘림 확인','Final copy: check names, contacts, dimensions and prices for typos, overlap and cropping')}</li></ul>{project.product&&<img src={project.product.data} alt={t('검수용 원본 사진','Original photo for review')}/>}</details></>}
   {preview?.composed.generated?.dimensionPlan&&<DimensionResult plan={preview.composed.generated.dimensionPlan}/>}
   {preview?.composed.generated?.planarReport&&<PlanarResult report={preview.composed.generated.planarReport} original={preview.composed.generated.planarOriginal}/>}{job.artifact&&job.marketingPlan&&<MarketingSummary plan={job.marketingPlan} saved/>}
   {(job.state==='ready'||job.state==='accepted')&&<>{!compatible&&<p role="alert">{t('사진·상품 설정 또는 완성 광고의 문구·규격 표시·연락처가 바뀌었습니다. 원래 정보를 복원하거나 시안을 반려한 뒤 현재 정보로 새로 생성해주세요.','The photo, product settings or finished ad copy, dimension display or contacts changed. Restore the original details, or reject the visual and generate with the current details.')}</p>}{project.dimensionAnnotation?.mode&&project.dimensionAnnotation.mode!=='none'&&<p role="status">{t('선택한 사진 규격 표시를 미리보기에 합성한 뒤 사용 확정할 수 있습니다. 미완료 상태에서는 확정·저장하지 않습니다.','Accept only after the requested photo dimensions are composed in this preview. Incomplete placement cannot be accepted or exported.')}</p>}<label className="generation-review"><input type="checkbox" checked={reviewed} disabled={!compatible||!previewReady} onChange={e=>setReviewed(e.target.checked)}/>{t('상품·재질 구조·규격·가격·문구를 확인했습니다.','I reviewed the product, material structure, dimensions, price and copy.')}</label><div className="generation-review-actions"><button disabled={busy||!reviewed||!compatible||!previewReady} onClick={()=>void accept()}><Check size={16}/>{job.state==='accepted'?t('저장한 시안 다시 적용','Reapply accepted visual'):exemptJob?t('사용 확정 · 이용권 차감 없음','Accept · No credits used'):t('사용 확정 · 1개 차감','Accept · use 1 credit')}</button>{job.state==='ready'&&<button disabled={busy} onClick={()=>void reject()}><X size={16}/>{exemptJob?t('시안 반려','Reject visual'):t('반려 · 이용권 복원','Reject · restore credit')}</button>}</div></>}
   {job.state==='uncertain'&&<p>{t('AI 공급사의 사용량을 확인하기 전에는 동일 요청을 자동 재시도하지 않습니다.','This request will not be retried automatically while provider usage is unresolved.')}</p>}
  </div>}
  {enlarged&&previewReady&&<ImageReview label={t('시안 확대 검수','Enlarged visual inspection')} onClose={()=>setEnlarged(false)}><img src={preview!.dataUrl} alt={t('광고 전체 확대 검수','Inspect the complete ad')}/></ImageReview>}
  {error&&<p role="alert" className="generation-error">{error}</p>}{notice&&<p role="status" className="generation-notice">{notice}</p>}
 </section>;
}


