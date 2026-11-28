export type StoryCard = {scene:string; caption:string};
export type StoryPlan = {continuity:string; cards:StoryCard[]};

export const carouselCounts = [2,4,6,8,10] as const;
export type CarouselCount = typeof carouselCounts[number];
// Keep four cards as the initial choice and the legacy request default.
export const carouselCount = 4;
export const carouselFormat = '4:5';

export function isCarouselCount(value:unknown):value is CarouselCount {
  return typeof value==='number' && carouselCounts.some(count=>count===value);
}

function shortText(value:unknown, limit:number):value is string {
  return typeof value==='string' && !!value.trim() && value.length<=limit;
}

export function validStoryPlan(value:unknown,expectedCount?:number):value is StoryPlan {
  if(!value || typeof value!=='object' || Array.isArray(value) ||
    (expectedCount!==undefined&&!isCarouselCount(expectedCount))) return false;
  const plan=value as StoryPlan;
  return Object.keys(plan).length===2 && shortText(plan.continuity,320) && Array.isArray(plan.cards) &&
    isCarouselCount(plan.cards.length) && (expectedCount===undefined||plan.cards.length===expectedCount) &&
    plan.cards.every(card=>card && typeof card==='object' && !Array.isArray(card) && Object.keys(card).length===2 &&
      shortText(card.scene,360) && shortText(card.caption,80)) &&
    new Set(plan.cards.map(card=>card.scene.trim())).size===plan.cards.length;
}
