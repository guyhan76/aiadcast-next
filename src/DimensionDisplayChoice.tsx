import type {Project} from './model';
import {annotationSnapshot} from './dimension-annotation';
import {useUiLanguage} from './ui-language';
export function DimensionDisplayChoice({project,change,disabled=false}:{project:Project;change:(f:(p:Project)=>Project)=>void;disabled?:boolean}){
 const {t}=useUiLanguage();
 return <fieldset><legend>{t('사진 규격 표시','Photo dimension display')}</legend>{([['none',t('사진 치수선 없음','No photo arrows')],['main',t('본제품에 직접 표시','On the main product')],['inset',t('같은 제품 작은 사진에 표시','On a small product photo')]] as const).map(([mode,label])=><label key={mode}><input type="radio" name="creation-dimension-mode" disabled={disabled&&mode!=='none'} checked={(project.dimensionAnnotation?.mode??'none')===mode} onChange={()=>change(p=>({...p,dimensionAnnotation:{method:'manual',mode,snapshot:annotationSnapshot(p)},dimensions:{...p.dimensions,lines:false,...(mode!=='none'?{visible:true}:{})}}))}/>{label}</label>)}<p className="help">{t('광고 생성 후 각 치수의 두 끝점을 지정합니다. 추가 AI 분석 비용은 없습니다.','After generation, mark two endpoints for each dimension. No additional AI analysis is used.')}</p></fieldset>;
}
