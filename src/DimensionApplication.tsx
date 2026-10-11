import type {Project} from './model';
import {axisLabel} from './product';
import {dimensionApplication} from './dimension-application';
import {dimensionUnit,fromMillimeters} from './dimension-units';
import {BoxGeometryPreview} from './BoxGeometryPreview';
import {useUiLanguage} from './ui-language';
import './dimension-application.css';

export function DimensionApplication({project,onEdit}:{project:Project;onEdit?:()=>void}) {
 const {t,language}=useUiLanguage(),status=dimensionApplication(project),unit=dimensionUnit(project.dimensions.displayUnit);
 if(status.state==='none')return null;
 const descriptions={
  invalid:t('규격 입력을 확인해주세요.','Check the entered dimensions.'),
  'photo-pending':t('상품 사진 첨부 대기','Waiting for the product photo'),
  projected:t('입력 규격으로 박스 형상 구성','Box shape built from entered dimensions'),
  'projection-pending':t('규격 박스 구성 대기 · 모서리 확인 필요','Box composition pending · Align the corners'),
  'source-retained':t('원본 사진 형상 유지','Original photo shape retained'),
  'ai-reference-used':t('이 규격을 참고한 AI 시안','AI visual created with these reference dimensions'),
  'ai-reference-pending':t('AI 시안 제작 전 · 규격 참고 예정','Before AI creation · Dimensions will be used as a reference'),
  outdated:t('입력 정보 변경됨 · 이전 AI 시안 적용 안 됨','Inputs changed · Previous AI visual is not applied')
 };
 return <section className="dimension-application" aria-label={t('규격 적용 확인','Dimension application')}>
  <div className="dimension-application-heading"><h3>{t('규격 적용 확인','Dimension application')}</h3>{onEdit&&<button type="button" onClick={onEdit}>{t('규격 수정','Edit dimensions')}</button>}</div>
  <p className="dimension-application-values">{status.values.map(v=>`${axisLabel(v.axis,language,project.productProfile)} ${fromMillimeters(v.value,unit)} ${unit}`).join(' × ')}</p>
  <strong role="status">{descriptions[status.state]}</strong>
  <p>{status.state==='projected'?t('사진의 세 면을 입력한 가로·세로·높이에 맞춘 직육면체에 배치했습니다. 원본 인쇄와 변의 위치를 비교해주세요.','The three photo faces are placed on a cuboid calculated from your width, depth and height. Compare the print and edge positions.'):status.state==='source-retained'?t('규격은 보관하고 사진의 비례는 유지합니다. 규격을 바꿔도 상품 형상이 자동으로 변하지 않습니다.','Dimensions are stored and the photo proportions are retained. Changing dimensions does not automatically reshape the product.'):t('AI에 규격을 전달하는 것만으로 결과의 실물 비례가 검증되지는 않습니다. 원본과 결과를 비교해주세요.','Sending dimensions to AI does not verify the result’s physical proportions. Compare the source and result.')}</p>
  <p className="dimension-application-labels">{status.labelsVisible?t('치수 표기: 표시','Dimension labels: shown'):t('치수 표기: 숨김 · 입력 규격은 유지','Dimension labels: hidden · Entered values retained')} · {t('실물 비례: 검증 전','Physical proportions: unverified')}</p>
  {status.valid&&<BoxGeometryPreview project={project}/>} 
 </section>;
}
