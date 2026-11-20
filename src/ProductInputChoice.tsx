import type {Project} from './model';
import {isTextExample,textExampleGeometryError,withGenerationInput} from './generation-input';
import {useUiLanguage} from './ui-language';

export function ProductInputChoice({project,change,busy}:{project:Project;change:(fn:(p:Project)=>Project)=>void;busy:boolean}){
 const {t}=useUiLanguage(),example=isTextExample(project),count=(project.product?1:0)+(project.references?.length??0);
 return <div className="product-input-choice"><div className="simple-choice" role="group" aria-label={t('상품 이미지 만들기 방식','Product image source')}>
  {(['photo','text-example'] as const).map(mode=><button type="button" key={mode} disabled={busy} aria-pressed={example===(mode==='text-example')} onClick={()=>change(p=>withGenerationInput(p,mode))}>{mode==='photo'?t('내 상품 사진으로 만들기','Use my product photos'):t('설명으로 예시 만들기','Create an example from text')}</button>)}
 </div>{example&&<><p className="help">{t('AI 예시 · 실제 상품 재현 아님. 상품명과 설명으로 새로운 예시를 만듭니다. 실제 형태·인쇄·색상과 규격 정확도를 보장하지 않습니다.','AI example · Not a reproduction of your actual product. Create a new concept from its name and description; shape, printing, colors and dimension accuracy are not guaranteed.')}</p><p className="help">{count?t(`사진 ${count}장은 보관하며 이 모드에서는 전송하지 않습니다. 사진 모드로 돌아가면 다시 사용할 수 있습니다.`,`Your ${count} saved photos will not be sent in this mode. Switch back to use them.`):t('이 모드에서는 사진을 첨부하거나 전송하지 않습니다.','No photos are attached or sent in this mode.')}</p>
 {textExampleGeometryError(project)&&<div><p role="alert">{t('사진 기반 형상 제어·치수선은 설명 예시에서 지원하지 않습니다. 해당 제어를 끄거나 사진 모드로 돌아가주세요. 숫자 규격 입력·표시는 별도로 유지됩니다.','Photo-based geometry and dimension arrows are not supported for text examples. Turn those controls off or switch back to photo mode. Numeric dimensions and their visibility remain separate.')}</p><button type="button" onClick={()=>change(p=>({...p,generation:{...p.generation,dimensionBased:false,planarSourceHash:undefined},dimensionControl:undefined,boxProjection:p.boxProjection?{...p.boxProjection,enabled:false}:undefined,dimensionAnnotation:p.dimensionAnnotation?{...p.dimensionAnnotation,mode:'none'}:undefined,dimensions:{...p.dimensions,lines:false}}))}>{t('사진 기반 규격 제어 끄기','Turn off photo-based dimension controls')}</button></div>}
 </>}</div>;
}
