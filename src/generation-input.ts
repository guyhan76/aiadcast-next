import type {Project} from './model.ts';
import {isPhysicalCategory} from './industry.ts';

export const isTextExample=(p:Project)=>p.generation.inputMode==='text-example'&&isPhysicalCategory(p.productProfile.category);
export const generationInputs=(p:Project)=>({source:isTextExample(p)?null:p.product,references:isTextExample(p)?[]:p.references??[]});
export const generationSourceHash=(p:Project)=>generationInputs(p).source?.sha256??null;
export function withGenerationInput(p:Project,inputMode:'photo'|'text-example'):Project{
 if((p.generation.inputMode??'photo')===inputMode)return p;
 return {...p,generation:{...p.generation,inputMode,mode:inputMode==='text-example'?'creative':p.generation.photoMode??p.generation.mode,photoMode:inputMode==='text-example'?p.generation.mode:undefined}};
}
export function textExampleGeometryError(p:Project){
 return isTextExample(p)&&(p.generation.dimensionBased||p.generation.planarSourceHash||p.dimensionControl||p.boxProjection?.enabled||p.dimensions.lines||p.dimensionAnnotation&&p.dimensionAnnotation.mode!=='none')?'설명 예시는 사진 기반 형상 제어·직접/작은 사진 치수선을 지원하지 않습니다. 해당 제어를 끄거나 사진으로 만들기를 선택해주세요. 숫자 규격은 별도로 입력할 수 있습니다.':null;
}
// Keep source assets in the saved project; exclude them from all generation context.
export function generationContext(p:Project):Project{
 return isTextExample(p)?{...p,product:null,references:[],referenceRoles:undefined,referenceCheck:undefined,proportionViews:undefined}:p;
}
