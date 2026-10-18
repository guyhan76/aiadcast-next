import {useEffect,useRef,useState} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import type {Project} from './model';
import {apiRequest} from './generation-client';
import {hasCompleteAd} from './complete-ad';
import {annotationAxes,annotationPlan,annotationSnapshot,parseAnnotation} from './dimension-annotation';
import type {AnnotationAxis,AnnotationProposal,DimensionAnnotation} from './dimension-annotation';
import {useUiLanguage} from './ui-language';
import './dimension-annotation.css';
import {ManualBoxCoordinates} from './ManualBoxCoordinates';
type Capability={available:boolean;scope:string;reason:string|null;manual?:boolean};
export function DimensionAnnotationPanel({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage(),latest=useRef(project);latest.current=project;
 const [cap,setCap]=useState<Capability|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[editing,setEditing]=useState<AnnotationProposal|null>(null),[editError,setEditError]=useState('');
 const [manual,setManual]=useState(false);
 const pending=useRef<AbortController|null>(null),serial=useRef(0),attempted=useRef('');
 const snapshot=annotationSnapshot(project),current=project.dimensionAnnotation,ready=current?.snapshot===snapshot&&!!current.proposal;
 const supported=hasCompleteAd(project)&&annotationAxes.every(a=>Number(project.dimensions[a])>0)&&project.productProfile.specType==='rectangular'&&(cap?.scope!=='owned-single-box'||project.productProfile.category==='boxes');
 useEffect(()=>{const c=new AbortController();void apiRequest<Capability>('/api/dimension-analysis',undefined,c.signal).then(setCap).catch(()=>setCap({available:false,scope:'unavailable',reason:'UNAVAILABLE'}));return()=>{c.abort();pending.current?.abort();serial.current++;};},[]);
 useEffect(()=>{pending.current?.abort();serial.current++;setBusy(false);setEditing(null);setManual(false);},[snapshot]);
 async function choose(mode:DimensionAnnotation['mode'],retry=false){
  setMessage('');setEditError('');setEditing(null);pending.current?.abort();const id=++serial.current;setBusy(false);
  if(mode==='none'){change(p=>({...p,dimensionAnnotation:{...(p.dimensionAnnotation??{snapshot}),mode}}));return;}
  if(ready){change(p=>({...p,dimensionAnnotation:{...p.dimensionAnnotation!,mode}}));return;}
  if(!supported)return;
  if(!cap?.available&&!(cap?.scope==='owned-single-box'&&current?.requestId&&current.snapshot===snapshot&&!retry)){change(p=>({...p,dimensionAnnotation:{mode,snapshot:annotationSnapshot(p)}}));return;}
  attempted.current=snapshot+':'+mode;
  const p=latest.current,key=annotationSnapshot(p),controller=new AbortController();pending.current=controller;setBusy(true);
  const owned=cap?.scope==='owned-single-box',requestId=!retry&&current?.snapshot===key&&current.requestId?current.requestId:crypto.randomUUID();
  change(now=>annotationSnapshot(now)===key?{...now,dimensionAnnotation:{mode,snapshot:key,analysisAttempted:true,...(owned?{requestId,analysisState:'uncertain' as const}:{})}}:now);
  setMessage(t('상품 모서리와 문구 위치를 확인하고 있습니다.','Locating product edges and ad copy.'));
  try{
   const result=await apiRequest<{state?:'ready'|'failed'|'uncertain';sourceHash:string;proposal:AnnotationProposal;verified:false}>(owned?'/api/box-dimensions':'/api/dimension-analysis',owned?{jobId:p.generated!.jobId,sourceHash:p.generated!.asset.sha256,requestId}:{source:p.generated!.asset},AbortSignal.any([controller.signal,AbortSignal.timeout(55000)]));
   if(id!==serial.current||annotationSnapshot(latest.current)!==key)return;
   if(result.sourceHash!==p.generated!.asset.sha256)throw Error('SOURCE_MISMATCH');
   if(owned){change(now=>annotationSnapshot(now)===key?{...now,dimensionAnnotation:{...now.dimensionAnnotation!,analysisState:result.state??'uncertain'}}:now);if(result.state!=='ready')throw Error('LOCATION_UNAVAILABLE');}
   const next=parseAnnotation({mode,snapshot:key,proposal:result.proposal,...(owned?{analysisAttempted:true,requestId,analysisState:'ready'}:{})})!;
   annotationPlan(next.proposal!,p.dimensions,mode,p.generated!.asset.width,p.generated!.asset.height);
   change(now=>annotationSnapshot(now)===key?{...now,dimensionAnnotation:next}:now);
   setMessage(t('자동 배치 결과를 확인해주세요. 필요하면 위치를 수정할 수 있습니다.','Review the automatic placement; adjust positions if needed.'));
  }catch{if(id===serial.current)setMessage(t('자동 배치를 완료하지 못했습니다. 원본 광고는 유지됩니다. 분석 상태를 확인하거나 박스 위치를 직접 지정해주세요.','Automatic placement could not finish. Your original ad is preserved. Check analysis status or locate the box manually.'));}
  finally{if(id===serial.current){setBusy(false);pending.current=null;}}
 }
 useEffect(()=>{const mode=current?.mode,key=snapshot+':'+mode;if(supported&&cap?.available&&mode&&mode!=='none'&&!ready&&!busy&&attempted.current!==key&&(!current.analysisAttempted||current.snapshot!==snapshot)){attempted.current=key;void choose(mode);}},[snapshot,current?.mode,cap?.available,supported,ready]);
 function move(axis:AnnotationAxis,end:number,x:number,y:number){setEditing(old=>{if(!old)return old;const next=structuredClone(old);next.axes[axis][end]=[Math.max(.01,Math.min(.99,x)),Math.max(.01,Math.min(.99,y))];return next;});}
 function drag(e:PointerEvent<HTMLButtonElement>,axis:AnnotationAxis,end:number){if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const r=e.currentTarget.parentElement!.getBoundingClientRect();move(axis,end,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);}
 function keyMove(e:KeyboardEvent<HTMLButtonElement>,axis:AnnotationAxis,end:number){const shifts:Record<string,[number,number]>={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]};const d=shifts[e.key];if(d&&editing){e.preventDefault();const pt=editing.axes[axis][end];move(axis,end,pt[0]+d[0],pt[1]+d[1]);}}
 function apply(){if(!editing||!current||current.mode==='none')return;try{annotationPlan(editing,project.dimensions,current.mode,project.generated!.asset.width,project.generated!.asset.height);change(p=>annotationSnapshot(p)===snapshot?{...p,dimensionAnnotation:{...p.dimensionAnnotation!,proposal:editing,adjusted:true}}:p);setEditing(null);setEditError('');}catch{setEditError(t('치수선이 상품 영역을 벗어나거나 문구와 겹칩니다. 점 위치를 다시 확인해주세요.','An edge leaves the product or covers copy. Check the points.'));}}
 const names={width:t('가로','Width'),depth:t('깊이','Depth'),height:t('높이','Height')};
 return <section className="dimension-annotation" aria-label={t('광고 안 규격 표시','Dimensions inside the ad')}><h3>{t('규격 표시','Dimension display')}</h3><fieldset><legend className="sr-only">{t('규격 표시 방식','Dimension display mode')}</legend>{([['none',t('표시 없음','None')],['main',t('본제품에 직접 표시','On the main product')],['inset',t('같은 제품 작은 사진에 표시','On a small product photo')]] as const).map(([mode,label])=><label key={mode}><input type="radio" name="ad-dimension-mode" checked={(current?.mode??'none')===mode} disabled={mode!=='none'&&(!supported||busy)} onChange={()=>void choose(mode)}/>{label}</label>)}</fieldset>
 {!supported&&<p>{t('가로·깊이·높이를 입력한 상품의 완성 광고에서 사용할 수 있습니다.','Available for complete product ads with width, depth and height.')}</p>}
 {supported&&!ready&&!cap?.available&&<p role="status">{t('자동 배치는 현재 승인된 참조 광고 평가만 준비 중입니다. 일반 광고의 유료 분석은 켜져 있지 않습니다. 선택한 사진 규격 표시는 미완료입니다. 원본 광고만 별도 저장할 수 있습니다.','Automatic placement is being prepared for approved reference evaluation. Paid analysis of general ads is off. Requested photo dimensions remain incomplete. You can save the original separately.')}</p>}
 {supported&&cap?.available&&!ready&&<p>{t('서버가 승인한 이미지의 위치 분석을 요청합니다. 사진 형상이나 비례를 검증하는 기능은 아닙니다.','Requests placement only for images approved by the server; does not verify shape or proportions.')}</p>}
 {supported&&!ready&&!cap?.available&&current?.mode&&current.mode!=='none'&&<button onClick={()=>{void apiRequest<Capability>('/api/dimension-analysis').then(setCap).catch(()=>setMessage(t('자동 배치 연결을 확인하지 못했습니다. 다시 확인해주세요.','Could not check automatic placement. Try again.')));}}>{t('자동 배치 가능 여부 다시 확인','Check placement availability again')}</button>}
 {current?.proposal&&!ready&&<p role="alert">{t('원본 또는 치수가 변경되어 이전 위치를 사용할 수 없습니다. 표시 없음을 선택하거나 자동 배치를 다시 요청해주세요.','The source or dimensions changed. Select None or request fresh placement.')}</p>}
 {busy&&<button onClick={()=>{pending.current?.abort();serial.current++;setBusy(false);setMessage(t('화면 요청을 중단했습니다. 이미 시작된 서버 분석은 비용 확인 후 종료됩니다.','View request stopped. An already-started analysis will finish cost reconciliation.'));}}>{t('요청 중단','Stop waiting')}</button>}
 {!busy&&!ready&&(cap?.available||cap?.scope==='owned-single-box'&&current?.requestId)&&current&&current.mode!=='none'&&<button onClick={()=>void choose(current.mode,!!cap?.available&&current.analysisState==='failed')}>{(current.analysisState==='uncertain'||!cap?.available)?t('분석 상태 확인 · 추가 호출 없음','Check analysis · no additional call'):t('자동 배치 다시 요청','Request placement again')}</button>}
 {supported&&project.productProfile.category==='boxes'&&current?.mode&&current.mode!=='none'&&!busy&&<button onClick={()=>setManual(true)}>{t('박스 위치 직접 지정','Locate box manually')}</button>}
 {current?.analysisState==='uncertain'&&<p role="status">{t('분석 비용 확인 중입니다. 유료 재시도는 차단하고 원본을 보관합니다. 수동 위치 지정은 가능합니다.','Analysis cost is unresolved. Paid retries are blocked; the original is preserved. Manual placement remains available.')}</p>}
 {manual&&<ManualBoxCoordinates project={project} onCancel={()=>setManual(false)} onApply={proposal=>{change(p=>annotationSnapshot(p)===snapshot?{...p,dimensionAnnotation:{...p.dimensionAnnotation!,snapshot,proposal,adjusted:true}}:p);setManual(false);}}/>}
 {ready&&current?.mode!=='none'&&<><p>{t('숫자는 입력한 규격입니다. 모서리·손잡이 제외 여부와 문구 겹침을 확인해주세요. 위치 수정과 다시 저장에는 분석을 재요청하지 않습니다.','Labels use your saved dimensions. Check edges, handle exclusion and copy overlap. Adjustments and repeat downloads do not request analysis.')}</p><button onClick={()=>{setEditing(structuredClone(current!.proposal!));setEditError('');}}>{t('위치 수정','Adjust positions')}</button></>}
 {editing&&<div className="annotation-editor"><p>{t('점을 끌거나 선택한 점에서 방향키로 이동하세요.','Drag a point or use arrow keys on the focused point.')}</p><div className="annotation-points"><img src={project.generated!.asset.data} alt={t('규격선 위치를 수정할 원본 광고','Original ad for adjusting dimension positions')} draggable={false}/>{annotationAxes.flatMap(axis=>editing.axes[axis].map((pt,end)=><button key={axis+end} className="annotation-handle" style={{left:pt[0]*100+'%',top:pt[1]*100+'%'}} aria-label={`${names[axis]} ${end===0?t('시작점','start'):t('끝점','end')}`} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}} onPointerMove={e=>drag(e,axis,end)} onKeyDown={e=>keyMove(e,axis,end)}>{names[axis].slice(0,1)}{end+1}</button>))}</div><button onClick={apply}>{t('위치 적용','Apply positions')}</button><button onClick={()=>setEditing(null)}>{t('수정 취소','Cancel adjustment')}</button>{editError&&<p role="alert">{editError}</p>}</div>}
 {message&&<p role="status">{message}</p>}</section>;
}
