import type {Project} from './model';
import {annotationSnapshot} from './dimension-annotation';
import {useUiLanguage} from './ui-language';
export function DimensionDisplayChoice({project,change,disabled=false}:{project:Project;change:(f:(p:Project)=>Project)=>void;disabled?:boolean}){
 const {t}=useUiLanguage();
 return <fieldset><legend>{t('사진 규격 표시','Photo dimension display')}</legend>{([['none',t('사진 치수선 없음','No photo arrows')],['main',t('본제품에 직접 표시','On the main product')],['inset',t('같은 제품 작은 사진에 표시','On a small product photo')]] as const).map(([mode,label])=><label key={mode}><input type="radio" name="creation-dimension-mode" disabled={disabled&&mode!=='none'} checked={(project.dimensionAnnotation?.mode??'none')===mode} onChange={()=>change(p=>({...p,dimensionAnnotation:{method:'ai',mode,snapshot:annotationSnapshot(p)},dimensions:{...p.dimensions,lines:mode!=='none',visible:mode!=='none'}}))}/>{label}</label>)}</fieldset>;
}
