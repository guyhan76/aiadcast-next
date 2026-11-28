import {useUiLanguage} from './ui-language';
import type {StoryPlan,StoryCard} from './story-carousel';

export function CarouselEditor({plan,onChange,busy}:{plan:StoryPlan;onChange:(plan:StoryPlan)=>void;busy:boolean}){
  const {t}=useUiLanguage();
  const labels=[t('첫 장면','Hook'),t('이야기 전개','Development'),t('상품·서비스의 매력','Benefit'),t('행동 유도','Closing')];
  function edit(index:number,field:keyof StoryCard,value:string){
    onChange({...plan,cards:plan.cards.map((card,i)=>i===index?{...card,[field]:value}:card)});
  }
  return <fieldset disabled={busy} className="carousel-editor">
    <label>{t('공통 연출','Shared visual direction')}<textarea value={plan.continuity} maxLength={320} onChange={e=>onChange({...plan,continuity:e.target.value})}/></label>
    {plan.cards.map((card,i)=><section key={i}>
      <h3>{i+1}. {labels[i]}</h3>
      <label>{t('장면','Scene')}<textarea rows={3} maxLength={360} value={card.scene} onChange={e=>edit(i,'scene',e.target.value)}/></label>
      <label>{t('이미지에 넣을 문구','On-image caption')}<input maxLength={80} value={card.caption} onChange={e=>edit(i,'caption',e.target.value)}/></label>
    </section>)}
  </fieldset>;
}
