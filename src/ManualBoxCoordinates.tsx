import {useState} from 'react';
import type {AnnotationProposal,AnnotationBox} from './dimension-annotation';
import {annotationPlan} from './dimension-annotation';
import type {Project} from './model';
import {useUiLanguage} from './ui-language';
// Empty coordinates are deliberately invalid. They are not a detection result.
export function ManualBoxCoordinates({project,onApply,onCancel}:{project:Project;onApply:(proposal:AnnotationProposal)=>void;onCancel:()=>void}){
 const {t}=useUiLanguage();
 const [p,setP]=useState<AnnotationProposal>(()=>structuredClone(project.dimensionAnnotation?.proposal??{located:true,product:[0,0,0,0],axes:{width:[[0,0],[0,0]],depth:[[0,0],[0,0]],height:[[0,0],[0,0]]},protectedText:[],existingAnnotations:[],inset:[0,0,0,0]}));
 const [confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 function edit(fn:(n:AnnotationProposal)=>void){setP(old=>{const n=structuredClone(old);fn(n);return n;});setConfirmed(false);setError('');}
 const fields=(label:string,values:number[],update:(n:AnnotationProposal,i:number,v:number)=>void,names:string[])=> <fieldset key={label}><legend>{label}</legend>{values.map((v,i)=><label className="field" key={i}>{label+' '+names[i]+' %'}<input type="number" min="0" max="100" step="0.1" value={Number.isFinite(v)?Math.round(v*10000)/100:''} onChange={e=>{const value=e.currentTarget.valueAsNumber/100;edit(n=>update(n,i,value));}}/></label>)}</fieldset>;
 const boxNames=[t('왼쪽','Left'),t('위','Top'),t('너비','Width'),t('높이','Height')];
 const boxes=(key:'protectedText'|'existingAnnotations',label:string)=> <>{p[key].map((b,index)=><div key={index}>{fields(label+' '+(index+1),b,(n,i,v)=>{n[key][index][i]=v;},boxNames)}<button onClick={()=>edit(n=>{n[key].splice(index,1);})}>{label+' '+(index+1)+' '+t('삭제','Remove')}</button></div>)}<button disabled={p[key].length>=(key==='protectedText'?30:20)} onClick={()=>edit(n=>{n[key].push([0,0,0,0]);})}>{label+' '+t('추가','Add')}</button></>;
 function apply(){try{if(!confirmed||!project.dimensionAnnotation||project.dimensionAnnotation.mode==='none')return;annotationPlan(p,project.dimensions,project.dimensionAnnotation.mode,project.generated!.asset.width,project.generated!.asset.height);onApply(p);}catch{setError(t('상품 영역·세 축·문구 겹침·작은 사진 공간을 확인해주세요. 유효한 배치 전에는 저장하지 않습니다.','Check product bounds, all three axes, protected copy and inset space. Invalid placement cannot be saved.'));}}
 return <div className="manual-box-coordinates"><h4>{t('박스 위치 직접 지정 · 자동 검출 아님','Locate box manually · not automatic detection')}</h4><p>{t('이미지 왼쪽 위가 0%, 오른쪽 아래가 100%입니다. 본체 모서리 세 축을 지정하고 덮개는 높이에서 제외하세요. 광고의 모든 문구와 기존 치수 표시 영역을 등록하세요. 이 작업은 상품 형상·비례를 바꾸지 않습니다.','Top-left is 0%, bottom-right 100%. Mark three body edges, excluding flaps from height. Protect every copy and existing annotation region. This does not change product shape or proportions.')}</p>
 <div style={{position:'relative'}}><img style={{width:'100%'}} src={project.generated!.asset.data} alt={t('위치를 지정할 원본 광고','Original ad to locate')}/><svg aria-label={t('수동 위치 미리보기','Manual coordinates preview')} viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>{([p.product,...p.protectedText,...p.existingAnnotations,p.inset] as AnnotationBox[]).map((b,i)=><rect key={i} x={b[0]*100} y={b[1]*100} width={b[2]*100} height={b[3]*100} fill="none" stroke={i===0?'blue':'red'} strokeWidth=".4"/>)}{Object.values(p.axes).map(([a,b],i)=><line key={i} x1={a[0]*100} y1={a[1]*100} x2={b[0]*100} y2={b[1]*100} stroke="#ff8c00" strokeWidth=".5"/>)}</svg></div>
 {fields(t('상품 영역','Product bounds'),p.product,(n,i,v)=>{n.product[i]=v;},boxNames)}
 {(['width','depth','height'] as const).map((axis,a)=><div key={axis}>{p.axes[axis].map((pt,end)=>fields([t('가로','Width'),t('깊이','Depth'),t('높이','Height')][a]+' '+(end===0?t('시작점','start'):t('끝점','end')),pt,(n,i,v)=>{n.axes[axis][end][i]=v;},['X','Y']))}</div>)}
 {boxes('protectedText',t('문구 보호 영역','Protected copy'))}{boxes('existingAnnotations',t('기존 치수 영역','Existing annotations'))}
 {project.dimensionAnnotation?.mode==='inset'&&fields(t('작은 사진 공간','Inset space'),p.inset,(n,i,v)=>{n.inset[i]=v;},boxNames)}
 <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('모든 문구·기존 치수 영역과 본체 모서리를 직접 확인했습니다.','I checked all copy, existing annotations and body edges.')}</label>
 <button disabled={!confirmed} onClick={apply}>{t('수동 위치 적용','Apply manual coordinates')}</button><button onClick={onCancel}>{t('수동 지정 취소','Cancel manual placement')}</button>{error&&<p role="alert">{error}</p>}
 </div>;
}
