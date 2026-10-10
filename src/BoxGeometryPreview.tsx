import type {Project} from './model';
import {boxGeometry,parseBoxSize} from './box-geometry';
import {useUiLanguage} from './ui-language';
import './box-geometry.css';
export function BoxGeometryPreview({project}:{project:Project}){
 const {t}=useUiLanguage();
 if(project.productProfile.specType!=='rectangular')return null;
 let model:ReturnType<typeof boxGeometry>|null=null;
 try{model=boxGeometry(parseBoxSize(project.dimensions));}catch{/* Incomplete input has no reference shape. */}
 const names={width:t('가로','Width'),depth:t('세로','Depth'),height:t('높이','Height')};
 return <details className="box-geometry"><summary>{t('입력 규격의 입체 비례 보기','Preview the dimensions as a box')}</summary>
  <p>{t('입력한 세 치수로 계산한 직육면체 기준입니다. 원본 사진의 형상을 바꾸거나 실측 일치를 확인한 결과는 아닙니다.','A cuboid calculated from your three dimensions. This does not reshape the photo or verify its physical dimensions.')}</p>
  {model?<><svg viewBox="0 0 720 540" role="img" aria-label={t('입력 치수의 직육면체 기준','Cuboid reference for the entered dimensions')}>
   {model.faces.map((face,i)=><polygon key={face.name} data-face={face.name} points={face.corners.map(id=>`${model.vertices[id].x},${model.vertices[id].y}`).join(' ')} fill={['#efe8db','#d6c9b2','#b8a88c'][i]} stroke="#665e50" strokeWidth="2"/>)}
   {model.dimensions.map(d=>{
    const offset=d.axis==='width'?{x:-25,y:33}:d.axis==='depth'?{x:25,y:33}:{x:36,y:0};
    const a={x:d.start.x+offset.x,y:d.start.y+offset.y},b={x:d.end.x+offset.x,y:d.end.y+offset.y};
    return <g key={d.axis} data-dimension={d.axis}><path d={`M${d.start.x},${d.start.y} L${a.x},${a.y} M${d.end.x},${d.end.y} L${b.x},${b.y}`} stroke="#aaa092" strokeWidth="1"/><path d={`M${a.x},${a.y} L${b.x},${b.y}`} stroke="#4b4336" strokeWidth="2"/><circle cx={a.x} cy={a.y} r="3" fill="#4b4336"/><circle cx={b.x} cy={b.y} r="3" fill="#4b4336"/><text x={(a.x+b.x)/2} y={(a.y+b.y)/2} textAnchor="middle" dominantBaseline="middle" fontSize="18" fill="#27241f" stroke="#faf8f3" strokeWidth="7" paintOrder="stroke">{names[d.axis]} {d.value} mm</text></g>;
   })}
  </svg><p className="box-geometry-note">{t('형상 기준만 계산됨 · 원본 인쇄 미적용 · 실물 검증 전','Shape reference only · Source print not applied · Physical verification pending')}</p></>:<p role="status">{t('가로·세로·높이를 모두 올바르게 입력해주세요.','Enter a valid width, depth and height.')}</p>}
 </details>;
}
