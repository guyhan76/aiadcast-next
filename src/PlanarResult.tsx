import type {PlanarReport} from './planar-proportion';
import type {Asset} from './model';
import {useUiLanguage} from './ui-language';
export function PlanarResult({report,original}:{report:PlanarReport;original?:Asset}){
 const {t}=useUiLanguage(),format=(n:number)=>n.toFixed(3);
 return <section className="planar-result" aria-label={t('규격 기반 생성 확인','Dimension-based result review')}><h3>{t('정면 평면 비례 확인','Front plane proportion review')}</h3>
 {report.variantLabel&&<p>{t('규격','Variant')}: {report.variantLabel}</p>}
 <p>{report.state==='unverified'?t('자동 보정하지 않았습니다. 결과의 촬영면·외곽을 확인해주세요.','Not automatically adjusted. Review the result view and outline.'):report.state==='adjusted'?t('생성된 상품의 분리 가능한 평면 외곽만 입력 비례로 보정했습니다.','Only the isolated generated product plane was adjusted to the entered ratio.'):t('분리된 평면 외곽이 입력 비례 범위에 있어 규격에 맞춰 배치했습니다.','The isolated plane was within the entered ratio tolerance and fitted to the dimensions.')}</p>
 <dl><dt>{t('입력 가로/세로','Entered width/depth')}</dt><dd>{format(report.expectedRatio)}</dd><dt>{t('생성 외곽 추정 가로/세로','Estimated generated outline width/depth')}</dt><dd>{report.observedRatio===null?t('측정 불가','Not measurable'):format(report.observedRatio)}</dd><dt>{t('적용 후 가로/세로','Applied width/depth')}</dt><dd>{report.outputRatio===null?t('미적용','Not applied'):format(report.outputRatio)}</dd></dl>
 <p>{t('최대 512px 분석으로 찾은 픽셀 외곽의 2축 처리이며 실물 치수·입체 형상·상품 동일성 검증은 아닙니다. 인쇄와 상품 세부를 확인한 뒤 사용하세요.','This processes a two-axis pixel outline, not verified physical dimensions, 3D geometry or product identity. Review print and product details before use.')}</p>
 {original&&<details><summary>{t('보정 전 생성 원본 보기','View original generated image')}</summary><img src={original.data} alt={t('보정 전 생성 원본','Original generated image before adjustment')}/></details>}
 </section>;
}
