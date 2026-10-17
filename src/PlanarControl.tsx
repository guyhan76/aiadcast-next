import type {Project} from './model';
import {photoRole} from './photo-roles';
import {useUiLanguage} from './ui-language';
export function PlanarControl({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage(),enabled=!!project.generation.dimensionBased;
 const eligible=project.generation.mode==='creative'&&project.productProfile.specType!=='none'&&!!project.product&&photoRole(project,project.product.sha256)==='subject';
 const planarEligible=eligible&&project.productProfile.specType==='flat'&&project.generation.dimensionBasis!=='garment-flat';
 return <div className="planar-control">
 <label className="check-field"><input type="checkbox" checked={enabled} disabled={!eligible&&!enabled} onChange={e=>{const checked=e.target.checked;change(p=>({...p,generation:{...p.generation,dimensionBased:checked,dimensionBasis:p.generation.dimensionBasis??'outer-body',planarSourceHash:undefined}}));}}/>{t('규격 기반 생성','Dimension-based generation')}</label>
 <p className="help">{t('선택한 한 규격의 치수와 사진을 생성에 함께 반영합니다. 용량이나 S/M/L 이름만으로 실제 치수를 추정하지 않습니다. 생성 결과의 실물 비례를 보장하지 않으므로 사용 전에 확인해주세요.','Use the measurements and photo for one selected variant. Capacity and S/M/L names do not imply physical measurements. Review the result: physical proportions are not guaranteed.')}</p>
 {enabled&&<>
 <label className="field">{t('이번 규격 이름 (선택)','Size variant name (optional)')}<input maxLength={80} value={project.generation.dimensionVariant??''} onChange={e=>{const value=e.target.value;change(p=>({...p,generation:{...p.generation,dimensionVariant:value}}));}}/><small>{t('이번 한 규격만 생성합니다. 다른 규격은 별도 프로젝트로 저장하세요.','Generates only this variant. Save other dimensions as separate projects.')}</small></label>
 <label className="field">{t('치수 기준','Measurement basis')}<select aria-label={t('치수 기준','Measurement basis')} value={project.generation.dimensionBasis??'outer-body'} onChange={e=>{const value=e.target.value as 'outer-body'|'garment-flat';change(p=>({...p,generation:{...p.generation,dimensionBasis:value,planarSourceHash:undefined}}));}}><option value="outer-body">{t('상품 본체 외곽','Product body exterior')}</option><option value="garment-flat" disabled={project.productProfile.specType!=='flat'}>{t('펼친 의류 · 가슴 단면과 총장 (평면 규격)','Flat garment · chest width and length (flat dimensions)')}</option></select></label>
 <p className="help">{t('본체 치수는 열린 덮개·손잡이를 제외합니다. 용기는 지름·높이 등 실제 본체 치수를 입력하세요. 의류는 평면 규격에서 펼쳐 잰 가슴 단면·총장을 사용합니다.','Body measurements exclude open flaps and handles. Enter actual dimensions such as container diameter and height. For garments, select flat dimensions and measure laid-flat chest width and length.')}</p>
 <label className="check-field"><input type="checkbox" checked={!!project.generation.planarSourceHash} disabled={!planarEligible&&!project.generation.planarSourceHash} onChange={e=>{const checked=e.target.checked;change(p=>({...p,generation:{...p.generation,planarSourceHash:checked?p.product!.sha256:undefined}}));}}/>{t('정면 평면 자동 보정','Front plane automatic adjustment')}</label>
 <p className="help">{t('별도 선택 시 사진이 가림 없는 평면 직사각형의 정면임을 확인합니다. 상품만 별도로 생성해 외곽 비율을 검사·보정하고 문구와 합성합니다. 열린 박스·곡면 용기·의류에는 적용하지 않습니다.','Selecting this confirms an unobstructed front photo of a flat rectangle. Generate the product separately, inspect and adjust its outline, then compose with text. Not for open boxes, curved containers or garments.')}</p>
 </>}
 </div>;
}
