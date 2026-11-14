import {useRef,useState} from 'react';
import type {KeyboardEvent,PointerEvent} from 'react';
import type {Asset,Point} from './model';
import {buildProportionReport,emptyMeasurement} from './proportion-review';
import type {MeasuredPhoto,ProportionContext,ProportionMeasurement} from './proportion-review';
import {useUiLanguage} from './ui-language';
import './proportion-review.css';

function MarkPhoto({asset,label,vertical,value,onChange}:{asset:Asset;label:string;vertical:string;value:MeasuredPhoto;onChange:(v:MeasuredPhoto)=>void}){
 const {t}=useUiLanguage();const [cursor,setCursor]=useState<Point>({x:.5,y:.5});
 const gesture=useRef<{id:number;x:number;y:number;moved:boolean}|null>(null);
 const steps=[t('가로 시작점','Width start'),t('가로 끝점','Width end'),`${vertical} ${t('시작점','start')}`,`${vertical} ${t('끝점','end')}`];
 function add(p:Point){if(value.points.length<4)onChange({...value,points:[...value.points,p]});}
 function start(e:PointerEvent<SVGSVGElement>){
  if(!e.isPrimary||e.button!==0){gesture.current=null;return;}
  gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
 }
 function move(e:PointerEvent<SVGSVGElement>){const g=gesture.current;if(g?.id===e.pointerId&&Math.hypot(e.clientX-g.x,e.clientY-g.y)>8)g.moved=true;}
 function point(e:PointerEvent<SVGSVGElement>){
  const g=gesture.current;gesture.current=null;
  if(!g||g.id!==e.pointerId||g.moved||Math.hypot(e.clientX-g.x,e.clientY-g.y)>8)return;
  const r=e.currentTarget.getBoundingClientRect();
  if(!r.width||!r.height||e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;
  add({x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});
 }
 function key(e:KeyboardEvent<SVGSVGElement>){
  const step=e.shiftKey?.02:.002;
  if(e.key==='Enter'||e.key===' '){e.preventDefault();add(cursor);return;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setCursor(p=>({x:Math.min(1,Math.max(0,p.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0))),y:Math.min(1,Math.max(0,p.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)))}));}
 }
 return <fieldset className="proportion-photo"><legend>{label}</legend>
  <label>{t('촬영 방향','View')}<select value={value.view} onChange={e=>onChange({...value,view:e.target.value as MeasuredPhoto['view']})}>
   <option value="unconfirmed">{t('확인 전','Unconfirmed')}</option><option value="front">{t('정면 · 원근 영향이 작은 사진','Front · minimal perspective')}</option><option value="perspective">{t('사선 · 수치 비교 제외','Perspective · unmeasured')}</option>
  </select></label>
  <p aria-live="polite">{value.points.length<4?`${value.points.length+1}/4 · ${steps[value.points.length]}`:t('네 점 표시 완료','Four points marked')}</p>
  <svg className="proportion-marker" viewBox={`0 0 ${asset.width} ${asset.height}`} role="application" tabIndex={0} aria-label={`${label}: ${t('가로 두 점, 높이 또는 세로 두 점. 방향키로 이동하고 엔터로 선택','mark width endpoints then vertical endpoints. Arrow keys move; Enter selects')}`} onPointerDown={start} onPointerMove={move} onPointerUp={point} onPointerCancel={()=>{gesture.current=null;}} onBlur={()=>{gesture.current=null;}} onKeyDown={key}>
   <image href={asset.data} width={asset.width} height={asset.height}/>
   {[0,2].map(start=>value.points.length>start+1&&<line key={start} x1={value.points[start].x*asset.width} y1={value.points[start].y*asset.height} x2={value.points[start+1].x*asset.width} y2={value.points[start+1].y*asset.height} stroke={start===0?'#ec521c':'#006ce5'} strokeWidth="3" vectorEffect="non-scaling-stroke"/>)}
   {value.points.map((p,i)=><g key={i}><circle cx={p.x*asset.width} cy={p.y*asset.height} r={Math.min(asset.width,asset.height)*.012} fill={i<2?'#ec521c':'#006ce5'} stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke"/><text x={p.x*asset.width} y={p.y*asset.height-Math.min(asset.width,asset.height)*.022} fill="#fff" stroke="#111" strokeWidth=".5" fontSize={Math.min(asset.width,asset.height)*.045} textAnchor="middle">{i+1}</text></g>)}
   <circle className="proportion-cursor" cx={cursor.x*asset.width} cy={cursor.y*asset.height} r={Math.min(asset.width,asset.height)*.02} fill="none" stroke="#e94800" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
  </svg>
  <p className="help">{t('사진을 가볍게 눌러 점을 표시하세요. 위아래로 밀면 화면을 스크롤합니다.','Tap the photo to mark a point. Swipe vertically to scroll.')}</p>
  <button type="button" disabled={!value.points.length} onClick={()=>onChange({...value,points:value.points.slice(0,-1)})}>{t('마지막 점 취소','Undo last point')}</button>
 </fieldset>;
}
export function ProportionReview({context,source,result,onDownload,exportDisabled=false}:{context:ProportionContext;source:Asset;result:Asset;onDownload:(b:Blob,name:string)=>void;exportDisabled?:boolean}){
 const {t}=useUiLanguage();const [measurement,setMeasurement]=useState<ProportionMeasurement>(emptyMeasurement),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 let report:ReturnType<typeof buildProportionReport>;
 try{report=buildProportionReport(context,measurement);}catch{return <p role="alert">{t('유효한 규격과 사진이 필요해 수치 비교를 진행하지 않았습니다.','Numerical comparison requires valid dimensions and images.')}</p>;}
 if(context.specType==='none')return <p>{t('규격이 없어 수치 비례 비교를 생략합니다.','No dimensions supplied; numerical comparison is not applicable.')}</p>;
 const status={unverified:t('미검증','Unverified'),invalid:t('측정점 확인 필요','Check measurement points'),mismatch:t('비례 재확인 필요','Proportion mismatch'),'consistent-in-plane':t('정면 두 축 비교 범위 내','Within the front two-axis threshold'),'not-applicable':t('해당 없음','Not applicable')};
 const reason:Record<string,string>={'extent-unconfirmed':t('동일한 측정 범위를 확인하세요.','Confirm the same measurement extent.'),'view-unconfirmed':t('촬영 방향을 확인하세요.','Confirm the view.'),'perspective-not-measurable':t('사선 사진은 정면 비례로 판정하지 않습니다.','Perspective views are not assessed as front views.'),'four-points-required':t('두 변의 네 점을 표시하세요.','Mark four endpoints.'),'edges-too-short':t('너무 짧은 선입니다. 상품 전체 변을 표시하세요.','Edges are too short; mark the full product extent.'),'axes-not-perpendicular':t('두 축이 직각에 가까운지 확인하세요.','Check that the axes are near perpendicular.'),'invalid-input':t('규격과 이미지 정보를 확인하세요.','Check dimensions and image metadata.'),'invalid-points':t('이미지 안의 점을 선택하세요.','Choose points inside the image.')};
 const vertical=t(context.specType==='flat'?'세로':'높이',context.specType==='flat'?'Length':'Height');
 async function download(){
  if(saving||exportDisabled)return;
  setSaving(true);setError('');try{
   const snapshot=buildProportionReport(context,measurement);
   const digest=async(a:Asset)=>{const bytes=await(await fetch(a.data)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');};
   if(await digest(source)!==context.source.sha256||await digest(result)!==context.result.sha256)throw Error('Image hash mismatch');
   onDownload(new Blob([JSON.stringify({...snapshot,images:{source,result}},null,2)],{type:'application/json'}),'aiadcast-proportion-evidence.json');
  }catch{setError(t('사진·규격·비교 기록을 저장하지 못했습니다. 다시 시도해주세요.','Could not save the photos, dimensions and comparison. Please try again.'));}finally{setSaving(false);}
 }
 return <details className="proportion-review"><summary>{t('상품 비례 수치 비교 · 선택','Measure product proportions · optional')}</summary>
  <p>{t('정면 사진에서 같은 부분의 가로와 높이를 원본·결과 각각 네 점으로 표시합니다. 가방은 손잡이 포함 여부, 용기는 뚜껑 포함 여부를 입력 규격과 맞춰주세요.','Mark four endpoints on the same product extent in each front view. Match handle and cap inclusion to the supplied dimensions.')}</p>
  <label>{t('측정 범위','Measurement extent')}<input maxLength={120} value={measurement.extent} placeholder={t('예: 가방 본체, 손잡이 제외','e.g. bag body, excluding handle')} onChange={e=>setMeasurement(m=>({...m,extent:e.target.value,sameExtentConfirmed:false}))}/></label>
  <label className="proportion-confirm"><input type="checkbox" checked={measurement.sameExtentConfirmed} onChange={e=>setMeasurement(m=>({...m,sameExtentConfirmed:e.target.checked}))}/>{t('입력 규격과 두 사진에서 측정하는 부분이 같습니다.','The dimensions and both marked photos use the same measurement extent.')}</label>
  <div className="proportion-photos">{(['source','result'] as const).map(side=><MarkPhoto key={side} asset={side==='source'?source:result} label={side==='source'?t('원본','Source'):t('광고 결과','Ad result')} vertical={vertical} value={measurement[side]} onChange={value=>setMeasurement(m=>({...m,[side]:value}))}/>)}</div>
  <p>{t('입력 비례','Expected ratio')}: {report.expectedRatio?.toFixed(4)} · {t('개발 비교 기준 ±10%','Development threshold ±10%')}</p>
  <p className="proportion-status" role="status">{status[report.status]}</p>
  <dl>{(['source','result'] as const).map(side=><div key={side}><dt>{side==='source'?t('원본','Source'):t('광고 결과','Ad result')}</dt><dd>{status[report[side].status]}{report[side].relativeError!==null?` · ${t('규격 대비 차이','Deviation from dimensions')} ${(report[side].relativeError!*100).toFixed(1)}%`:` · ${reason[report[side].reason]??''}`}</dd></div>)}</dl>
  {report.sourceToResultRelativeChange!==null&&<p>{t('원본 대비 결과 비례 변화','Source-to-result proportion change')}: {(report.sourceToResultRelativeChange*100).toFixed(1)}%</p>}
  <p>{t('수동으로 지정한 정면 두 축의 비교입니다. 깊이·실제 크기·로고 동일성·3D 형상을 검증한 결과가 아닙니다. 사선 사진은 미검증으로 남습니다.','This compares two manually marked front-view axes. It does not verify depth, real size, logo identity or 3D shape. Perspective photos remain unverified.')}</p>
  <button type="button" disabled={saving||exportDisabled} onClick={()=>void download()}>{saving?t('기록 준비 중…','Preparing evidence…'):t('사진·규격·비교 기록 저장','Save photos, dimensions and comparison')}</button>
  {error&&<p role="alert">{error}</p>}
 </details>;
}
