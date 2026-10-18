import type {Project} from './model';
import {useUiLanguage} from './ui-language';
export function PhotoUsage({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage();
 return <div className="photo-usage"><div className="simple-choice" role="group" aria-label={t('사진 활용 방식','Photo use mode')}>
  {(['creative','original'] as const).map(mode=><button type="button" key={mode} aria-pressed={project.generation.mode===mode} onClick={()=>change(p=>({...p,generation:{...p.generation,mode},...(mode==='original'?{dimensionControl:undefined}:{})}))}>{mode==='creative'?t('AI로 새 광고 생성','Create a new AI ad'):t('실사 그대로 사용','Use the original photo')}</button>)}
 </div><p className="help">{project.generation.mode==='creative'?t('실제 상품 사진과 입력 규격을 함께 반영해 상품·장면·큰 제목·가격을 한 장으로 연출합니다. 디자인 참고 사진은 구성·분위기에 활용합니다. 상품 형태·비례와 문구는 결과에서 확인해주세요.','Use actual subject photos and supplied dimensions together to art-direct the subject, scene, headline and offer. Design references guide layout and style. Review the generated shape, proportions and copy.'):t('사진 속 흰 배경과 여백까지 그대로 붙이고 배경·문구를 합성합니다. 자동 배경 제거와 디자인 참고 반영은 하지 않습니다. 상품과 배경이 자연스럽게 어우러진 광고를 원하면 ‘AI로 새 광고 생성’을 선택하세요.','The entire photo, including white background and margins, is placed with text and a backdrop. It does not remove the background or use design references. Choose “Create a new AI ad” to art-direct the subject and scene together.')}</p></div>;
}
