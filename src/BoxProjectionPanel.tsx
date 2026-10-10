import {useState} from 'react';
import type {Project} from './model';
import {isServiceCategory} from './product';
import {boxCornerIds,boxFaces,boxProjectionProblem,boxProjectionReady,defaultBoxProjection,validBoxCorners} from './box-projection';
import type {BoxCorner} from './box-projection';
import {useUiLanguage} from './ui-language';
import './box-projection.css';

export function BoxProjectionPanel({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage();const [step,setStep]=useState(0);
 if(project.productProfile.specType!=='rectangular'||project.generation.mode!=='original'||isServiceCategory(project.productProfile.category))return null;
 const config=project.boxProjection??defaultBoxProjection(),asset=project.product;
 const ready=boxProjectionReady(project),problem=boxProjectionProblem(project),current=boxCornerIds[step];
 const names=[t('윗면 뒤쪽','Top rear'),t('윗면 오른쪽','Top right'),t('세 면의 만나는 점','Three-face junction'),t('윗면 왼쪽','Top left'),t('아래쪽 왼쪽','Bottom left'),t('아래쪽 가운데','Bottom centre'),t('아래쪽 오른쪽','Bottom right')];
 const setCorner=(id:BoxCorner,x:number,y:number)=>change(p=>{
  const old=p.boxProjection??defaultBoxProjection();
  return {...p,boxProjection:{...old,corners:{...old.corners,[id]:{x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))}},markedCorners:[...new Set([...old.markedCorners,id])],confirmedSourceHash:null}};
 });
 const messages={photo:t('원본 사진을 먼저 추가해주세요.','Add your original photo first.'),corners:t('모서리 순서를 확인해주세요. 세 면이 겹치거나 뒤집히면 적용할 수 없습니다.','Check the corner order. Faces must not overlap or flip.'),confirmation:t('사진에서 일곱 모서리를 지정하고 확인해주세요.','Mark all seven corners on the photo and confirm.'),dimensions:t('가로·세로·높이를 모두 올바르게 입력해주세요.','Enter a valid width, depth and height.')};
 return <section className="box-projection" aria-label={t('원본 사진으로 규격 박스 만들기','Build a dimensioned box from your photo')}>
  <h3>{t('원본 사진으로 규격 박스 만들기','Build a box from your photo')}</h3>
  <p>{t('닫힌 직육면체 박스의 윗면·앞면·오른쪽 면이 모두 보이는 사진에 사용하세요. 원본 인쇄를 가져와 입력 치수의 형상에 배치합니다.','Use a closed rectangular box with its top, front and right faces visible. Place the source print onto a shape calculated from your dimensions.')}</p>
  <label className="projection-toggle"><input type="checkbox" checked={config.enabled} onChange={e=>{const enabled=e.target.checked;change(p=>({...p,boxProjection:{...(p.boxProjection??defaultBoxProjection()),enabled}}));}}/>{t('규격 박스 구성 사용','Use dimensioned box composition')}</label>
  {config.enabled&&<>
   <p className="projection-limit">{t('곡면·열린 박스·펼친 전개도는 이 모드에서 지원하지 않습니다. 표시된 점은 초기 위치이므로 모두 직접 맞춰주세요.','Curved objects, open boxes and flat dielines are not supported here. Every initial marker must be aligned to your photo.')}</p>
   {asset&&<>
    <div className="projection-steps" role="group" aria-label={t('사진 모서리 선택','Choose a photo corner')}>{boxCornerIds.map((id,i)=><button key={id} type="button" aria-pressed={step===i} onClick={()=>setStep(i)} aria-label={`${i+1}. ${names[i]}`}><b>{i+1}</b>{config.markedCorners.includes(id)?' ✓':''}</button>)}</div>
    <p className="projection-prompt"><strong>{step+1}. {names[step]}</strong> — {t('사진에서 이 위치를 눌러주세요.','Tap this location on the photo.')}</p>
    <svg className="projection-photo" role="img" aria-label={t('박스 모서리를 지정할 원본 사진','Original photo for box corner alignment')} viewBox={`0 0 1000 ${1000*asset.height/asset.width}`} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setCorner(current,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);setStep(s=>Math.min(6,s+1));}}>
     <image href={asset.data} width="1000" height={1000*asset.height/asset.width}/>
     {boxFaces.map((face,i)=><polygon key={face.name} points={face.corners.map(id=>`${config.corners[id].x*1000},${config.corners[id].y*1000*asset.height/asset.width}`).join(' ')} fill={['#00a5a522','#ef792522','#2866cc22'][i]} stroke={['#007575','#e36613','#285bba'][i]} strokeWidth="4"/>)}
     {boxCornerIds.map((id,i)=><g key={id} transform={`translate(${config.corners[id].x*1000},${config.corners[id].y*1000*asset.height/asset.width})`}><circle r="23" fill={step===i?'#f26d21':'#202623'} stroke="white" strokeWidth="3"/><text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="28" fontWeight="700">{i+1}</text></g>)}
    </svg>
    <div className="projection-coordinates">{(['x','y'] as const).map(axis=><label key={axis}>{axis.toUpperCase()} %<input aria-label={t('선택한 모서리','Selected corner')+` ${axis.toUpperCase()} %`} type="number" min="0" max="100" step="0.1" value={Math.round(config.corners[current][axis]*1000)/10} onChange={e=>{if(e.target.value==='')return;const v=Number(e.target.value)/100;if(!Number.isFinite(v))return;setCorner(current,axis==='x'?v:config.corners[current].x,axis==='y'?v:config.corners[current].y);}}/></label>)}</div>
    <label className="projection-toggle"><input type="checkbox" disabled={config.markedCorners.length!==7||!validBoxCorners(config.corners,asset.width,asset.height)} checked={config.confirmedSourceHash===asset.sha256} onChange={e=>change(p=>({...p,boxProjection:{...p.boxProjection!,confirmedSourceHash:e.target.checked?p.product!.sha256:null}}))}/>{t('일곱 점을 현재 사진의 실제 모서리에 맞췄습니다.','I aligned all seven points to the actual corners in this photo.')}</label>
   </>}
   <div className={ready?'projection-state ready':'projection-state'} role="status">{ready?t('원본 면 투영 적용됨 · 실물 일치 검증은 별도','Source faces projected · Physical match still needs verification'):problem?messages[problem]:''}</div>
   <p>{t('사진을 바꾸거나 모서리를 수정하면 다시 확인해야 합니다. 원본 파일은 보관되며 확대·투영 과정에서 글자가 흐려질 수 있습니다. 규격·문구 변경에는 새 AI 생성이 필요하지 않습니다.','Changing the photo or corners requires confirmation again. The original file is retained; scaling and projection can blur fine print. Dimension and copy edits need no new AI generation.')}</p>
  </>}
 </section>;
}
