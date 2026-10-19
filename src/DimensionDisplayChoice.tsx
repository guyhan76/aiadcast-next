import type {Project} from './model';
import {annotationSnapshot} from './dimension-annotation';
import {useUiLanguage} from './ui-language';
export function DimensionDisplayChoice({project,change,disabled=false}:{project:Project;change:(f:(p:Project)=>Project)=>void;disabled?:boolean}){
 const {t}=useUiLanguage();
 return <fieldset><legend>{t('사진 규격 표시','Photo dimension display')}</legend>{([['none',t('사진 치수선 없음','No photo arrows')],['main',t('본제품에 직접 표시','On the main product')],['inset',t('같은 제품 작은 사진에 표시','On a small product photo')]] as const).map(([mode,label])=><label key={mode}><input type="radio" name="creation-dimension-mode" disabled={disabled&&mode!=='none'} checked={(project.dimensionAnnotation?.mode??'none')===mode} onChange={()=>change(p=>({...p,dimensionAnnotation:{method:'ai',mode,snapshot:annotationSnapshot(p)},dimensions:{...p.dimensions,lines:false,...(mode!=='none'?{visible:true}:{})}}))}/>{label}</label>)}<p className="help">{t('형상을 먼저 구성한 뒤 선택한 치수 표시를 적용합니다. 숫자가 맞는 것만으로 형상 정확도가 확인되지는 않습니다. 결과에서 수치·단위와 치수선 양 끝의 실제 상품 경계를 확인한 뒤 확정하세요.','Construct geometry before applying dimension labels. Correct numbers alone do not verify shape. Review values, units and the actual product boundaries at both arrow endpoints before accepting.')}</p></fieldset>;
}
