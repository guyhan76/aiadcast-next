import {useEffect,useRef,useState} from 'react';
import {apiRequest} from './generation-client';
import {useAdminRead} from './use-admin-read';
import {betaSession} from './beta-session';
import {apiIdentity} from './api-origin';
import {imageFile,loadImage} from './model';
import type {Asset} from './model';
import {annotationAxes,validateAnnotationProposal} from './dimension-annotation';
import type {AnnotationProposal} from './dimension-annotation';
import './admin-reference-evaluation.css';
type Reference={name:string;bytes:number;sha256:string;dimensions:Record<'width'|'depth'|'height',string>;basis:string;label:string};
type Result={requestId:string;state:'pending'|'ready'|'failed';sourceHash:string;verified:false;proposal?:AnnotationProposal;reason?:string};
type Status={available:boolean;providerConfigured:boolean;generalAnalysisEnabled:false;limitCalls:number;limitMicros:number;perCallHoldMicros:number;references:Reference[];budget:null|{ledgerExists:boolean;usedCalls:number|null;allowanceUsedMicros:number|null;knownCostMicros:number|null;unresolvedCalls:number|null;remainingCalls:number;request:Result|null}};
type Saved={id:string;hash:string};
const usd=(n:number)=>'$'+(n/1e6).toFixed(4);
export function AdminReferenceEvaluation(){
 const key='aiadcast-reference-evaluation:'+apiIdentity()+':'+(betaSession()?.user.id??'none');
 const [status,setStatus]=useState<Status|null>(null),[file,setFile]=useState<Asset|null>(null),[reference,setReference]=useState<Reference|null>(null),[result,setResult]=useState<Result|null>(null),[saved,setSaved]=useState<Saved|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const selection=useRef(0);
 const active=useRef(true),locked=useRef(false),savedRef=useRef<Saved|null>(null),canvas=useRef<HTMLCanvasElement>(null),[rendered,setRendered]=useState(false);
 const query=useAdminRead<Status>(s=>{setStatus(s);if(savedRef.current)setResult(s.budget?.request??null);},s=>!!s&&Array.isArray(s.references)&&typeof s.available==='boolean');
 async function refresh(request=savedRef.current){return query.read('/api/admin/dimension-evaluation'+(request?'?requestId='+encodeURIComponent(request.id):''));}
 useEffect(()=>{active.current=true;savedRef.current=null;setSaved(null);setResult(null);setFile(null);setReference(null);setStatus(null);try{const s=JSON.parse(localStorage.getItem(key)??'null');if(s&&typeof s.id==='string'&&/^[A-Za-z0-9_-]{16,100}$/.test(s.id)&&/^[a-f0-9]{64}$/.test(s.hash)){savedRef.current=s;setSaved(s);}}catch{}void refresh();return()=>{active.current=false;};},[key]);
 async function select(chosen?:File){if(locked.current||query.isPending())return;const selectionId=++selection.current;setError('');setFile(null);setReference(null);setRendered(false);if(!chosen||!status)return;try{const r=status.references.find(r=>r.bytes===chosen.size);if(!r)throw Error('원본과 파일 크기가 다릅니다. 원본 JPG를 선택해주세요. 재압축된 파일은 허용하지 않습니다.');const asset=await imageFile(chosen);const exact=status.references.find(r=>r.sha256===asset.sha256&&r.bytes===chosen.size);if(!exact)throw Error('승인된 원본과 해시가 다릅니다. 이름 변경으로 우회할 수 없습니다. 원본 JPG를 다시 선택해주세요.');if(!active.current||selectionId!==selection.current)return;setFile(asset);setReference(exact);}catch(e){if(active.current&&selectionId===selection.current)setError(e instanceof Error?e.message:'파일을 확인하지 못했습니다.');}}
 async function submit(){if(locked.current||query.isPending()||!file||!reference||!status?.available)return;locked.current=true;setBusy(true);setError('');try{
  // Persist the non-secret id before dispatch. Unknown responses retain the id;
  // retries reuse it, while only an explicit new evaluation creates another id.
  const request=savedRef.current&&savedRef.current.hash===file.sha256&&!result?savedRef.current:{id:crypto.randomUUID(),hash:file.sha256};
  localStorage.setItem(key,JSON.stringify(request));savedRef.current=request;setSaved(request);setResult({requestId:request.id,sourceHash:request.hash,state:'pending',verified:false});
  const r=await apiRequest<Result>('/api/admin/dimension-evaluation',{requestId:request.id,source:file},AbortSignal.timeout(55000));
  if(!active.current)return;setResult(r);await refresh(request);
 }catch{if(active.current)setError('처리 결과가 미확인입니다. 새 분석 대신 상태를 재확인해주세요.');}finally{locked.current=false;if(active.current)setBusy(false);}}
 async function check(){if(locked.current)return;setError('');await refresh();}
 const matching=result?.sourceHash===file?.sha256&&reference;
 useEffect(()=>{let alive=true;setRendered(false);if(result?.state!=='ready'||!matching||!result.proposal||!file||!canvas.current)return;
  const p=result.proposal;void(async()=>{validateAnnotationProposal(p);const img=await loadImage(file.data),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);ctx.strokeStyle='#ff00b8';ctx.lineWidth=Math.max(3,c.width*.004);for(const axis of annotationAxes){const [a,b]=p.axes[axis];ctx.beginPath();ctx.moveTo(a[0]*c.width,a[1]*c.height);ctx.lineTo(b[0]*c.width,b[1]*c.height);ctx.stroke();for(const pt of [a,b]){ctx.beginPath();ctx.arc(pt[0]*c.width,pt[1]*c.height,6,0,Math.PI*2);ctx.stroke();}}
   if(!alive||!canvas.current)return;canvas.current.width=c.width;canvas.current.height=c.height;canvas.current.getContext('2d')!.drawImage(c,0,0);setRendered(true);
  })().catch(()=>{if(alive)setError('자동 검출 좌표가 안전하지 않아 진단 이미지를 표시하지 않았습니다. 원본은 유지됩니다.');});return()=>{alive=false;};
 },[result,file,matching]);
 function original(){if(!file||!reference)return;const a=document.createElement('a');a.href=file.data;a.download=reference.name;a.click();}
 async function diagnostic(){if(!canvas.current||!rendered||!reference)return;const blob=await new Promise<Blob|null>(r=>canvas.current!.toBlob(r,'image/png'));if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='analysis-overlay-'+reference.name.replace('.jpg','.png');a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
 const waiting=!!saved&&(!result||result.state==='pending');
 return <section className="admin-card admin-reference-evaluation" aria-label="승인 원본 사진 분석"><h2>승인 원본 사진 분석</h2><p>박스·쇼핑백 원본 두 장만, 합계 최대 10회·US$0.30입니다. 새 광고 생성과 일반 광고 분석은 실행하지 않습니다.</p><button disabled={busy||query.pending} onClick={()=>void check()}>{query.pending?'상태 확인 중…':'상태를 재확인'}</button>
 <p role="status" aria-live="polite" aria-label="참조 분석 상태 조회">{query.pending?'서버 상태를 조회하고 있습니다. 분석을 새로 요청하지 않습니다.':query.confirmedAt?<>{query.error?'마지막 성공한 상태 확인':query.unchanged?'상태 확인 완료 · 변경 없음':'상태 확인 완료'} · <time dateTime={new Date(query.confirmedAt).toISOString()}>{new Date(query.confirmedAt).toLocaleTimeString('ko-KR',{hour12:false})}</time></>:'아직 상태를 확인하지 못했습니다.'}</p>
 {query.error&&<p role="alert">{query.error} 분석 요청은 새로 보내지 않았습니다.{query.confirmedAt?' 아래 정보는 마지막 확인 결과입니다.':''}</p>}
 {status&&<><p>서버 기존 키: {status.providerConfigured?'설정됨 (실제 연결 성공과는 별개)':'설정 확인 필요'} · 일반 광고 분석 OFF</p><div role="status">{!status.budget?'원장 상태 조회 불가':!status.budget.ledgerExists?'공통 원장 아직 없음 · 사용량 0으로 확정한 상태가 아닙니다. 최초 승인 요청 때 생성합니다.':`공통 원장 있음 · 사용 ${status.budget.usedCalls}회 / ${status.limitCalls}회 · 승인 한도 사용 ${usd(status.budget.allowanceUsedMicros??0)} / ${usd(status.limitMicros)} · 확인된 추정 비용 ${usd(status.budget.knownCostMicros??0)} · 미확정 ${status.budget.unresolvedCalls}건`}</div><p>매 호출 예약 {usd(status.perCallHoldMicros)}. 미확정 요청은 확인 전까지 다음 호출을 막습니다. 이 조회는 분석이나 원장 초기화를 실행하지 않습니다.</p><ul>{status.references.map(r=><li key={r.name}>{r.name} · {r.label} · {r.dimensions.width} × {r.dimensions.depth} × {r.dimensions.height} mm · {r.bytes.toLocaleString()} bytes</li>)}</ul><label>승인 원본 JPG 선택<input type="file" accept="image/jpeg" disabled={busy||query.pending} onChange={e=>void select(e.target.files?.[0])}/></label></>}
 {file&&reference&&<><p>원본 일치 확인: {reference.name}. 자동 압축·새 해시 허용 없음.</p><img className="reference-original" src={file.data} alt="승인 참조 원본 · 기존 화살표 포함"/><button onClick={original}>원본 파일 그대로 저장</button></>}
 {waiting&&<p role="status">이전 요청이 미확인입니다. 새로고침해도 재분석하지 않습니다. 상태 조회로 확인하고 같은 원본 파일을 다시 선택해주세요.</p>}
 <button disabled={busy||query.pending||waiting||!file||!reference||!status?.available} onClick={()=>void submit()}>{busy?'분석 결과 확인 중…':result?.state==='ready'||result?.state==='failed'?'새 분석 1회 요청 (한도 사용)':'분석 1회 요청 (최대 $0.03 예약)'}</button>
 {saved&&!result&&!busy&&file?.sha256===saved.hash&&status?.available&&<button disabled={query.pending} onClick={()=>void submit()}>동일 요청 확인 (중복 호출 방지)</button>}
 {result?.state==='failed'&&<p role="alert">{result.reason==='COST_RECONCILIATION_REQUIRED'?'분석 비용이 미확정이므로 추가 호출을 중지했습니다.':'분석 위치를 확정하지 못했습니다. 원본은 유지됩니다.'}</p>}
 {result?.state==='ready'&&<><p>검출 제안 · 정확도 미검증. 원본의 기존 화살표·숫자는 모델이 새로 만든 표시가 아닙니다. 아래 자홍색 선·원만 이번 검출 좌표입니다. 박스 축 대응과 쇼핑백 손잡이 제외 여부를 비교해주세요.</p>{!matching&&<p>결과를 복구했습니다. 대응 원본 파일을 다시 선택하면 비교할 수 있습니다.</p>}<canvas ref={canvas} aria-label="검출 좌표 진단 · 자홍색 선만 새 표시" hidden={!matching}/>{matching&&<button disabled={!rendered} onClick={()=>void diagnostic()}>진단 PNG 저장 (기존 표시 포함)</button>}</>}
 {error&&<p role="alert">{error}</p>}</section>;
}
