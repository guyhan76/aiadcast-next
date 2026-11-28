import {useUiLanguage} from './ui-language';
import type {StoryPlan,StoryCard} from './story-carousel';

export function CarouselEditor({plan,onChange,busy}:{plan:StoryPlan;onChange:(plan:StoryPlan)=>void;busy:boolean}){
  const {t}=useUiLanguage();
  const count=plan.cards.length;
  const label=(index:number)=>index===0?t('첫 장면','Opening'):index===count-1?t('마지막 장면','Closing'):t('이야기 전개','Story');
  function edit(index:number,field:keyof StoryCard,value:string){
    onChange({...plan,cards:plan.cards.map((card,i)=>i===index?{...card,[field]:value}:card)});
  }
  return <fieldset disabled={busy} className="carousel-editor">
    <label>{t('공통 연출','Shared visual direction')}<textarea value={plan.continuity} maxLength={320} onChange={e=>onChange({...plan,continuity:e.target.value})}/></label>
    {plan.cards.map((card,i)=><section key={i}>
      <h3><span>{i+1} / {count}</span>{label(i)}</h3>
      <label>{t('장면','Scene')}<textarea rows={3} maxLength={360} value={card.scene} onChange={e=>edit(i,'scene',e.target.value)}/></label>
      <label>{t('이미지에 넣을 문구','On-image caption')}<input maxLength={80} value={card.caption} onChange={e=>edit(i,'caption',e.target.value)}/></label>
    </section>)}
  </fieldset>;
}
