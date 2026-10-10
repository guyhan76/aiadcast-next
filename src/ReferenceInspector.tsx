import {useUiLanguage} from './ui-language';
import {assessReference,defaultReferenceCheck} from './specification';
import type {Project} from './model';
import {dimensionAxes} from './product';
export function ReferenceInspector({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {text}=useUiLanguage();
 const check=project.referenceCheck??defaultReferenceCheck(),assessment=assessReference(project);
 if(!dimensionAxes(project.productProfile).length)return null;
 return <details className="reference-inspector"><summary>{text("사진과 입력 규격의 비례 점검")}</summary><p className="help">{text("정면에서 촬영한 사진에만 사용하세요. 먼저 ‘요약과 치수선’을 켜고 가로와 ")}{project.productProfile.specType==='flat'?text('세로'):text('높이')}{text(" 선을 상품의 실제 두 변에 맞추세요.")}</p><label className="field">{text("사진의 촬영 방향")}<select value={check.view} onChange={e=>change(p=>({...p,referenceCheck:{view:e.target.value as 'front'|'perspective',confirmedSourceHash:null}}))}><option value="perspective">{text("사선 사진 또는 확인 안 됨")}</option><option value="front">{text("정면 사진")}</option></select></label>{check.view==='front'&&<label className="check-field"><input type="checkbox" disabled={!project.product} checked={!!project.product&&check.confirmedSourceHash===project.product.sha256} onChange={e=>change(p=>({...p,referenceCheck:{view:'front',confirmedSourceHash:e.target.checked?p.product?.sha256??null:null}}))}/>{text("두 치수선을 실제 상품 경계에 맞췄습니다.")}</label>}<div className={`reference-assessment ${assessment.status}`} role="note"><strong>{assessment.status==='mismatch'?text('비례 재확인 필요'):assessment.status==='consistent-in-plane'?text('정면의 두 변 확인'):text('비례 확인 전')}</strong><p>{text(assessment.message)}</p></div><p className="help small">{text("사진을 늘이거나 다른 상품으로 바꾸지 않습니다. 실제 입체 형상과 깊이를 맞추려면 추가 사진·도면·3D 정보가 필요합니다.")}</p></details>;
}
