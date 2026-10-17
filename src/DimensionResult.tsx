import type {DimensionPlan} from './dimension-generation';
import {useUiLanguage} from './ui-language';
export function DimensionResult({plan}:{plan:DimensionPlan}){
 const {t}=useUiLanguage();const labels:Record<string,string>={width:t('가로','Width'),depth:t('세로/깊이','Depth'),height:t('높이','Height'),diameter:t('지름','Diameter'),'flat-chest-width':t('가슴 단면','Flat chest width'),'garment-length':t('총장','Garment length')};
 return <section className="dimension-result" aria-label={t('적용한 규격','Applied dimensions')}><h3>{t('적용한 규격','Applied dimensions')}{plan.variantLabel&&` · ${plan.variantLabel}`}</h3><p>{plan.basis==='garment-flat'?t('펼친 의류','Laid-flat garment'):t('상품 본체 외곽','Product body exterior')}</p><p>{plan.measurements.map(m=>`${labels[m.meaning]??m.meaning} ${m.value} mm`).join(' · ')}</p><p>{t('이 치수와 상품 사진 정보를 생성 지침에 함께 전달했습니다. 실물 비례 자동 검증 결과는 아닙니다.','These measurements and product photo information were passed together as generation guidance. This is not automatic verification of physical proportions.')}</p></section>;
}
