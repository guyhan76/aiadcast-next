import type {Project} from './model';
import {useUiLanguage} from './ui-language';
export function PhotoUsage({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {t}=useUiLanguage();
 return <div className="photo-usage"><div className="simple-choice" role="group" aria-label={t('사진 활용 방식','Photo use mode')}>
  {(['creative','original'] as const).map(mode=><button type="button" key={mode} aria-pressed={project.generation.mode===mode} onClick={()=>change(p=>({...p,generation:{...p.generation,mode}}))}>{mode==='creative'?t('AI로 새 광고 생성','Create a new AI ad'):t('실사 그대로 사용','Use the original photo')}</button>)}
 </div><p className="help">{project.generation.mode==='creative'?t('실제 상품·공간 사진과 디자인 참고를 구분해주세요. AI가 새로 연출하므로 상품 형태와 문구를 결과에서 확인해주세요.','Separate actual subject photos from design references. AI creates a new composition; review the subject and text in the result.'):t('대표 사진 전체를 다시 그리지 않고 배경·문구와 합성합니다. 자동 배경 제거는 하지 않으며 디자인 참고 사진은 사용하지 않습니다.','The entire main photo is placed with a background and text without redrawing it. Its background is not removed; design references are not used.')}</p></div>;
}
