export type StoryCard = {scene:string; caption:string};
export type StoryPlan = {continuity:string; cards:StoryCard[]};

export const carouselCount = 4;
export const carouselFormat = '4:5';

function shortText(value:unknown, limit:number):value is string {
  return typeof value==='string' && !!value.trim() && value.length<=limit;
}

export function validStoryPlan(value:unknown):value is StoryPlan {
  if(!value || typeof value!=='object') return false;
  const plan=value as StoryPlan;
  return shortText(plan.continuity,320) && Array.isArray(plan.cards) &&
    plan.cards.length===carouselCount && plan.cards.every(card=>card &&
      shortText(card.scene,360) && shortText(card.caption,80)) &&
    new Set(plan.cards.map(card=>card.scene.trim())).size===carouselCount;
}
