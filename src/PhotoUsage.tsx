import type {Project} from './model';
import {useUiLanguage} from './ui-language';
export function PhotoUsage(_props:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage();
 return <div className="photo-usage"><p className="help">{t('첨부한 상품·공간 사진을 참고해 광고를 만듭니다. 디자인 참고 사진은 구성·분위기에 활용합니다. 상품 형태·비례와 문구는 결과에서 확인해주세요.','Create an ad from your subject photos. Design references guide layout and style. Review the generated shape, proportions and copy.')}</p></div>;
}
