import {MarketingSummary} from './MarketingSummary';
import {parseMarketingPlan} from './marketing-plan';
import {storageNamespace} from './beta-session';
import {useEffect,useRef,useState} from 'react';
import {Check,RefreshCw,Sparkles,X} from 'lucide-react';
import type {Project} from './model';
import {buildGenerationRequest,generationIssues} from './generation';
import {generatedCompatibilityKey} from './generated';
import {ApiRequestFailure,apiRequest,verifiedArtifact} from './generation-client';
import type {ApiStatus,GenerationJob} from './generation-client';
import {useUiLanguage} from './ui-language';
import {saveProject} from './storage';
import {ImageReview} from './ImageReview';
import './generation-panel.css';
type Pending={projectId:string;requestId:string;key:string;jobId?:string};
type JobResponse={job:GenerationJob;wallet:ApiStatus['wallet']};
export function GenerationPanel({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage();const [status,setStatus]=useState<ApiStatus|null>(null),[job,setJob]=useState<GenerationJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reviewed,setReviewed]=useState(false);
 const latest=useRef(project);latest.current=project;const alive=useRef(true);const pending=useRef<Pending|null>(null);const storageKey=(storageNamespace()==='guest'?'':storageNamespace()+':')+`aiadcast.pending-generation.${project.id}`;
 const [enlarged,setEnlarged]=useState(false);
 const remember=(value:Pending|null)=>{pending.current=value;try{if(value)localStorage.setItem(storageKey,JSON.stringify(value));else localStorage.removeItem(storageKey);}catch{/* API history still keeps the job. */}};
 const failure=(e:unknown)=>{const code=e instanceof Error?e.message:'';setError(code==='BUDGET_NOT_AVAILABLE'?t('테스트 비용 한도에 도달했습니다. 추가 생성은 중단했습니다.','The test budget is exhausted. Generation is paused.'):code==='ARTIFACT_MISMATCH'||code==='INVALID_ARTIFACT'?t('결과 파일 검증에 실패했습니다. 사용 확정하지 않았습니다.','The result failed file validation. It has not been accepted.'):t('연결 또는 요청을 확인하지 못했습니다. 자동으로 다시 생성하지 않습니다. 연결 상태와 기존 작업을 확인해주세요.','The request could not be confirmed. No automatic regeneration will occur. Refresh the connection and check the existing job.'));};
 async function refresh(){
  try{
   const data=await apiRequest<ApiStatus>('/api/status');if(!alive.current)return;setStatus(data);setError('');
   const record=pending.current;if(!record)return;
   let id=record.jobId;
   if(!id){const history=await apiRequest<{jobs:GenerationJob[]}>(`/api/generations?projectId=${encodeURIComponent(project.id)}`);id=history.jobs.find(j=>j.requestId===record.requestId||j.requestIds?.includes(record.requestId))?.id;}
   if(id){const result=await apiRequest<JobResponse>(`/api/generations/${id}`);if(!alive.current)return;remember({...record,jobId:id});setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);}
  }catch(e){if(alive.current){setStatus(null);if(pending.current)failure(e);}}
 }
 useEffect(()=>{alive.current=true;try{const raw=JSON.parse(localStorage.getItem(storageKey)??'null');if(raw?.projectId===project.id&&typeof raw.requestId==='string'&&typeof raw.key==='string')pending.current=raw;}catch{/* Invalid local state is ignored. */}void refresh();return()=>{alive.current=false;};},[project.id]);
 useEffect(()=>{
  if(job?.state!=='running')return;let cancelled=false;
  const timer=setInterval(()=>{void apiRequest<JobResponse>(`/api/generations/${job.id}`).then(result=>{if(!cancelled){setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);}}).catch(()=>{if(!cancelled)setError(t('상태 확인이 지연되고 있습니다. 새 생성 없이 다시 확인합니다.','Status updates are delayed. Checking again without starting a new generation.'));});},2000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[job?.id,job?.state]);
 const compatible=!!pending.current&&pending.current.key===generatedCompatibilityKey(project)&&job?.sourceHash===(project.product?.sha256??null)&&job?.mode===project.generation.mode;
 const issues=generationIssues(project);const active=job?.state==='running'||job?.state==='ready';
 useEffect(()=>{setReviewed(false);setEnlarged(false);},[job?.artifactId,compatible]);
 async function start(){
  const snapshot=latest.current;if(busy||active||pending.current&&!job)return;
  setBusy(true);setError('');setNotice('');setReviewed(false);
  try{
   const request=buildGenerationRequest(snapshot);await saveProject(snapshot);const record={projectId:snapshot.id,requestId:crypto.randomUUID(),key:generatedCompatibilityKey(snapshot)};remember(record);setJob(null);
   const result=await apiRequest<JobResponse>('/api/generations',{projectId:snapshot.id,requestId:record.requestId,request,source:snapshot.product,references:snapshot.references??[]});
   if(!alive.current)return;remember({...record,jobId:result.job.id});setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);
  }catch(e){if(alive.current){if(e instanceof ApiRequestFailure&&['INVALID_REQUEST','INVALID_SPECIFICATIONS','REGION_EDIT_NOT_AVAILABLE','SOURCE_MISMATCH','INVALID_IMAGE','SOURCE_REQUIRED','GENERATION_DISABLED','PROVIDER_NOT_CONFIGURED','BUDGET_NOT_AVAILABLE','NO_TEST_CREDITS','GENERATION_ALREADY_RUNNING','REVIEW_REQUIRED_AFTER_REJECTIONS','JSON_REQUIRED','REQUEST_TOO_LARGE','CLIENT_HEADER_REQUIRED','ORIGIN_NOT_ALLOWED','LOCAL_ACCESS_ONLY','TOO_MANY_REQUESTS'].includes(e.code))remember(null);failure(e);}}finally{if(alive.current)setBusy(false);}
 }
 async function accept(){
  if(!job||!compatible||!reviewed||busy)return;setBusy(true);setError('');
  try{
   // Validate and decode before accepting the charge. Recheck the project after every async boundary.
   const marketingPlan=parseMarketingPlan(job.marketingPlan??undefined);if(marketingPlan&&(marketingPlan.input.sourceHash!==job.sourceHash||marketingPlan.input.mode!==job.mode))throw Error('INVALID_ARTIFACT');
   const asset=await verifiedArtifact(job),record=pending.current;if(!record||record.key!==generatedCompatibilityKey(latest.current))throw Error('STALE_PROJECT');
   const result=job.state==='accepted'?{job,wallet:status!.wallet}:await apiRequest<JobResponse>(`/api/generations/${job.id}/accept`,{artifactId:job.artifactId});
   if(!alive.current)return;
   if(record.key!==generatedCompatibilityKey(latest.current))throw Error('STALE_PROJECT');
   change(p=>record.key!==generatedCompatibilityKey(p)?p:{...p,generated:{jobId:job.id,mode:job.mode,sourceHash:job.sourceHash,asset,role:job.artifact!.role,model:job.model,createdAt:job.createdAt,specificationKey:record.key,...(marketingPlan?{marketingPlan}:{})},background:job.artifact!.role==='background'?{...p.background,image:asset}:p.background});
   setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);setNotice(t('확인한 시안을 적용했습니다. 문구와 비율을 수정하고 저장할 수 있습니다.','Your reviewed visual is applied. Edit the copy or format, then save your ad.'));
  }catch(e){failure(e);}finally{if(alive.current)setBusy(false);}
 }
 async function reject(){if(!job||busy)return;setBusy(true);try{const result=await apiRequest<JobResponse>(`/api/generations/${job.id}/reject`,{});if(!alive.current)return;setJob(result.job);setStatus(s=>s?{...s,wallet:result.wallet}:s);remember(null);setReviewed(false);setNotice(t('시안을 반려하고 테스트 이용권을 복원했습니다.','The visual was rejected and the test credit was restored.'));}catch(e){failure(e);}finally{if(alive.current)setBusy(false);}}
 const labels:Record<GenerationJob['state'],string>={running:t('시안 제작 중','Creating your visual'),ready:t('결과를 확인해주세요','Review your result'),accepted:t('사용 확정한 시안','Accepted visual'),rejected:t('반려 · 이용권 복원','Rejected · credit restored'),failed:t('실패 · 이용권 복원','Failed · credit restored'),uncertain:t('처리 확인 중 · 이용권 복원','Provider status uncertain · credit restored'),expired:t('검토 만료 · 이용권 복원','Review expired · credit restored'),refunded:t('이용권 복원됨','Credit restored')};
 return <section className="generation-panel" aria-label={t('AI 광고 제작','AI ad generation')}>
  <div className="generation-heading"><div><span className="eyebrow">AI CREATIVE</span><h2>{t('내 광고의 다음 시안.','Your next creative.')}</h2></div><button onClick={()=>void refresh()} disabled={busy}><RefreshCw size={16}/>{t('연결 상태 확인','Refresh connection')}</button></div>
  <p>{project.generation.mode==='original'?t('원본 사진은 유지하고 새로운 배경을 요청합니다. 사진 안에 있는 배경은 자동 제거되지 않습니다.','Keep your original photo and request a new backdrop. Any background inside the original photo stays in place.'):t('참고 사진과 광고 방향으로 새로운 시안을 요청합니다. 상품의 형태·색상은 원본과 달라질 수 있습니다.','Create a new visual from your reference and direction. Product shape and color may differ from the original.')}</p>
  <div className="generation-status"><span>{status?.generation.enabled?t('생성 테스트 연결됨','Generation test connected'):t('생성 테스트 준비 중','Generation test pending')}</span>{status&&<span>{t('테스트 이용권','Test credits')} {status.wallet.available} · {t('처리 중','Reserved')} {status.wallet.reserved}</span>}</div>
  {!status?.generation.enabled&&<p className="generation-hint">{t('테스트 서버 연결과 비용 한도 설정 후 AI 제작을 사용할 수 있습니다. 직접 편집·저장은 계속 이용할 수 있습니다.','AI creation requires the test server and an enabled budget. Manual editing and saving remain available.')}</p>}
  <p className="generation-hint">{t('새 시안 1개에 테스트 이용권 1개를 예약하며, 결과를 사용 확정할 때 차감합니다. 시스템 오류·반려는 복원합니다. 실제 결제는 연결되지 않았습니다.','One test credit is reserved per new visual and used only when you accept it. Errors and rejection restore it. Live payments are not connected.')}</p>
  {issues.length>0&&<details><summary>{t('제작 전 확인할 내용','Before generating')}</summary><p>{t('광고 정보에서 사진·규격·제작 방향을 확인해주세요.','Check the photo, dimensions and creative direction in Ad details.')}</p></details>}
  <button className="generate-button" disabled={!status?.generation.enabled||busy||active||issues.length>0||!!pending.current&&!job} onClick={()=>void start()}><Sparkles size={17}/>{busy?t('처리 중…','Working…'):project.generation.mode==='original'?t('AI 배경 요청 · 1개','Create backdrop · 1 credit'):t('AI 새 시안 요청 · 1개','Create visual · 1 credit')}</button>
  {pending.current&&!job&&<p role="status">{t('이전 요청 상태를 확인하고 있습니다. 중복 생성을 막기 위해 새 요청을 보류합니다.','Checking the earlier request. New requests are paused to prevent duplicate generation.')}</p>}
  {job&&<div className="generation-result"><strong role="status">{labels[job.state]}</strong>{job.artifact&&<><img src={job.artifact.dataUrl} alt={t('AI 생성 시안 검토','Review the generated visual')}/><button type="button" className="generation-enlarge" onClick={()=>setEnlarged(true)}>{t('확대 검수','Inspect enlarged visual')}</button><small>{t('상품의 형태·색상·로고와 잡티를 확인하세요. 문구는 적용 후 별도로 검수합니다.','Check shape, color, logos and stray marks. Review the typeset copy after applying.')}</small><details className="generation-checklist"><summary>{t('검수 항목','Review checklist')}</summary><ul><li>{t('원본과 상품·재질·비례 비교','Compare product, material and proportions with the source')}</li><li>{t('로고·인쇄·손·장식의 변형과 잡티 확인','Inspect logos, printing, hands, decoration and stray marks')}</li><li>{t('적용 후 상품명·규격·가격·글자 잘림 확인','After applying, check names, dimensions, prices and text cropping')}</li></ul>{project.product&&<img src={project.product.data} alt={t('검수용 원본 사진','Original photo for review')}/>}</details></>}
   {job.artifact&&job.marketingPlan&&<MarketingSummary plan={job.marketingPlan} saved/>}
   {(job.state==='ready'||job.state==='accepted')&&<>{!compatible&&<p role="alert">{t('원본 사진 또는 상품 설정이 바뀌어 이 결과를 현재 작업에 적용할 수 없습니다.','The source photo or product settings changed. This result cannot be applied to the current project.')}</p>}<label className="generation-review"><input type="checkbox" checked={reviewed} disabled={!compatible} onChange={e=>setReviewed(e.target.checked)}/>{t('상품·배경·형태를 확인했습니다.','I reviewed the product, background and shape.')}</label><div className="generation-review-actions"><button disabled={busy||!reviewed||!compatible} onClick={()=>void accept()}><Check size={16}/>{job.state==='accepted'?t('저장한 시안 다시 적용','Reapply accepted visual'):t('사용 확정 · 1개 차감','Accept · use 1 credit')}</button>{job.state==='ready'&&<button disabled={busy} onClick={()=>void reject()}><X size={16}/>{t('반려 · 이용권 복원','Reject · restore credit')}</button>}</div></>}
   {job.state==='uncertain'&&<p>{t('AI 공급사의 사용량을 확인하기 전에는 동일 요청을 자동 재시도하지 않습니다.','This request will not be retried automatically while provider usage is unresolved.')}</p>}
  </div>}
  {enlarged&&job?.artifact&&<ImageReview label={t('시안 확대 검수','Enlarged visual inspection')} onClose={()=>setEnlarged(false)}><img src={job.artifact.dataUrl} alt={t('AI 생성 시안 검토','Review the generated visual')}/></ImageReview>}
  {error&&<p role="alert" className="generation-error">{error}</p>}{notice&&<p role="status" className="generation-notice">{notice}</p>}
 </section>;
}


