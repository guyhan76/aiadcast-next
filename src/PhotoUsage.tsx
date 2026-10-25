import type {Project} from './model';
import {useUiLanguage} from './ui-language';
export function PhotoUsage(_props:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage();
 return <div className="photo-usage"><p className="help">{t('상품·서비스 사진을 첨부해주세요.','Attach photos of your product or service.')}</p></div>;
}
