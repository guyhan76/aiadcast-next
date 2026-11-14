import type {Project} from './model';
import {isServiceCategory} from './product';
import {useUiLanguage} from './ui-language';
export function PhotoUsage({project}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage();
 if(isServiceCategory(project.productProfile.category))return null;
 return <div className="photo-usage"><p className="help">{t('실제 상품 사진을 한 장 이상 첨부해주세요.','Add at least one photo of the actual product.')}</p></div>;
}
