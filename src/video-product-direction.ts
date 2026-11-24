type DirectionBrief = {style: string; field?: string; industry?: string; title?: string; description?: string; highlight?: string};
type Shots = readonly [string, string, string];
type Directions = {ko: Shots; en: Shots};

const directions = {
  commerce: {
    ko: ['제품의 특징적인 윤곽에 빛이 스치는 순간부터 시작한다. 카메라가 그 선을 빠르게 따라가며 0.8초 안에 제품을 알아볼 수 있는 형태나 마감이 빛을 받는 순간을 포착한다.', '방금 본 윤곽을 같은 방향으로 따라가며 실제 표면이나 기능 한 곳에 초점을 맞춘다.', '카메라가 제품 정면에 멈추고 빛이 표면을 가로지르는 동안 형태와 색을 또렷하게 보여준다.'],
    en: ['Open on light racing across a recognizable product edge. Track the moving highlight to reveal the distinctive silhouette or finish by 0.8 seconds.', 'Follow the same edge into a close view of one real surface or functional detail.', 'Settle on a clear front view as the light travels across the original finish.'],
  },
  unboxing: {
    ko: ['닫힌 포장의 개봉 부위를 크게 잡는다. 첫 프레임부터 포장이 열리기 시작하고 틈으로 다음 참조 사진 속 제품의 색이 보인다.', '개봉 방향을 따라 포장 안으로 시선을 옮기고, 제품이 나오는 순간 초점을 고유한 디테일에 맞춘다.', '방금 꺼낸 제품 전체를 드러낸다. 포장과 구성품의 수와 배치는 참조 사진을 따른다.'],
    en: ['Frame the opening edge of the closed package. Begin mid-opening and reveal a sliver of the product color from the next reference.', 'Follow the opening motion inside and shift focus to a distinctive detail as the product emerges.', 'Reveal the whole item just uncovered. Keep the packaging and contents consistent with the references.'],
  },
  fashion: {
    ko: ['착용 장면에서는 모델이 몸을 돌리는 순간 상품이 렌즈 가까이를 스치고 전체 실루엣이 드러난다. 제품 단독 연출이면 카메라가 상품의 외곽선을 빠르게 돌아 같은 실루엣을 보여준다.', '같은 움직임이 이어지는 동안 사진에서 확인되는 소재나 마감 한 곳을 근접 촬영한다.', '디테일에서 전신 또는 상품 전체로 넓혀 길이와 비율을 읽을 수 있게 한다. 처음의 색상과 디자인을 유지한다.'],
    en: ['For a worn look, open mid-turn as the item sweeps past the lens into silhouette. For a product-only brief, arc the camera around its edge instead.', 'Continue the motion into a close view of one visible material or finishing detail.', 'Widen to show the full look or item, giving its proportions room to read. Keep the original design and color.'],
  },
  icedLatte: {
    ko: ['첫 프레임부터 잔 테두리와 얼음을 바짝 잡는다. 두 얼음이 부딪친 바로 그 순간, 갈색 커피가 왕관처럼 솟아 잔 테두리 위에서 빛난다. 0.8초 안에 낮은 측면으로 컷해 튀어 오른 방울이 다시 잔에 닿는 순간을 잡는다.', '충돌 직후 잔 옆면으로 컷. 이제 우유 속으로 파고드는 갈색 줄기에 초점을 맞추고, 아래쪽의 흰 우유 층은 보이게 한다.', '잔 전체가 보이는 별도 정면 컷으로 전환한다. 붓기가 끝난 뒤 얼음이 자리를 잡고, 마지막 순간에는 사진 속 잔의 형태와 층이 또렷하게 읽힌다.'],
    en: ['Start tight on the rim and top ice, mid-strike. Two ice cubes collide at frame one and an amber crown of coffee rises above the rim. Cut low on that impact and catch the falling droplets by 0.8 seconds.', 'Cut on impact to the side of the glass. Follow one dark ribbon descending into the milk, with white milk still visible below.', 'Cut wide to the entire reference glass. The pour has stopped, the ice settles, and the final frame holds the recognizable drink.'],
  },
  icedLatteUgc: {
    ko: ['첫 프레임부터 손에 든 투명한 잔을 화면 가득 잡는다. 손이 잔을 렌즈 앞에서 탁 멈추자 얼음이 한쪽으로 몰려 잔 벽을 치고 커피 표면에 짧은 물결이 선다. 0.8초 안에 그 물결을 낮은 측면에서 잡는다.', '같은 사람이 그 잔을 들어 한 모금 마신다. 잔 너머로 표정이 잠깐 보이고 초점은 커피와 우유 층에 남는다.', '잔을 내려놓는 동작에 맞춰 제품 전체로 전환한다. 원래 잔의 형태와 색을 또렷이 보여준다.'],
    en: ['Start with the hand-held reference glass filling the frame at the instant it stops near the lens. Ice slides into the glass wall and a short wave crosses the coffee. Catch the wave at rim level by 0.8 seconds.', 'The same person takes one sip. Glimpse their reaction beyond the rim while keeping focus on the coffee and milk layers.', 'Cut on the hand setting the glass down to a clear view of the entire original drink.'],
  },
  food: {
    ko: ['첫 프레임에서 실제 재료가 떨어지거나 음료가 쏟아지는 순간을 가까이 잡는다. 밀봉 제품만 보이면 포장을 빠르게 회전시켜 정면을 드러낸다.', '같은 동작의 방향을 따라 표면의 질감이나 액체의 흐름을 크게 보여준다. 제공된 재료와 용기를 그대로 쓴다.', '움직임이 잦아들면서 판매 대상인 음식이나 패키지가 화면 중앙에 선명하게 남는다.'],
    en: ['Start close on a supplied ingredient dropping or liquid pouring. If only a sealed pack is shown, turn the pack sharply into view.', 'Match the motion into the texture or flow, keeping the supplied ingredients and vessel.', 'Let the motion settle with the advertised food or pack sharply in the center.'],
  },
  ugc: {
    ko: ['첫 화면 가득 제품과 손을 잡고 사용 동작 한가운데서 시작한다. 0.8초 안에 손이 가리거나 잡고 있던 디테일이 드러나는 순간을 선명하게 보여준다.', '손의 움직임을 따라가며 실제 쓰임 한 가지를 보여주고, 필요한 순간에만 사용자의 표정을 짧게 담는다.', '사용 직후 같은 제품을 돌려 처음 보여준 특징을 다시 확인할 수 있게 한다.'],
    en: ['Fill frame one with the hand and product already mid-use. By 0.8 seconds show the distinctive detail that the gesture uncovers, sharp in the foreground.', 'Follow the hand through one real use; show a brief reaction only when it helps explain the action.', 'Turn the same item toward the viewer after use so the opening detail is recognizable again.'],
  },
} satisfies Record<string, Directions>;

export function productDirection(brief: DirectionBrief, language: 'ko' | 'en'): Shots {
  if (brief.style === 'unboxing') return directions.unboxing[language];
  const category = [brief.field, brief.industry].filter(Boolean).join(' ');
  const fashion = /패션|의류|잡화|주얼리|fashion|apparel|jewel/i;
  const food = /식품|음료|식음료|가공식|농산물|축산물|수산물|food|beverage/i;
  const subject = [brief.title, brief.description, brief.highlight].filter(Boolean).join(' ');
  const icedLatte = /아이스\s*(?:카페\s*)?라[떼테]|\biced\s+(?:caff[eè]\s+)?latte\b/i;
  const packaged = /밀봉|캡슐|파우치|캔커피|캔\s*(?:음료|라[떼테])|병입|sealed|capsule|pouch|bottled|canned/i;
  const otherLatte = /말차|녹차|초코|딸기|고구마|matcha|chocolate|strawberry/i;
  if (icedLatte.test(subject) && (!category.trim() || food.test(category) || icedLatte.test(brief.title ?? ''))
    && !packaged.test(subject) && !otherLatte.test(subject)) {
    return (brief.style === 'presenter' ? directions.icedLatteUgc : directions.icedLatte)[language];
  }
  if (brief.style === 'presenter') return directions.ugc[language];
  if (fashion.test(category)) return directions.fashion[language];
  if (food.test(category)) return directions.food[language];
  if (!category.trim()) {
    if (/코트|패딩|재킷|운동화|핸드백|\b(coat|jacket|sneakers?|handbag)\b/i.test(brief.title ?? '')) return directions.fashion[language];
    if (/커피|원두|라테|라떼|주스|소스|\b(coffee|latte|juice|sauce)\b/i.test(brief.title ?? '')) return directions.food[language];
  }
  return directions.commerce[language];
}

export function closingAction(kind:string,style:string|undefined,language:'ko'|'en') {
  const ko=language==='ko';
  if(kind==='service')return ko?'보여준 이용 과정에서 고객이 이어서 할 수 있는 행동 하나를 보여준다.':'Show one next step the customer can take in the demonstrated service.';
  if(style==='unboxing')return ko?'개봉한 제품을 바로 쓸 수 있는 상태로 보여주며 끝낸다.':'Finish the reveal with the supplied item ready for its first use.';
  if(style==='presenter')return ko?'시연한 특징을 시청자가 직접 살펴볼 수 있게 제품을 렌즈 쪽으로 돌려 잠시 멈춘다.':'After the demonstration, offer the same item toward the viewer for a closer look and pause.';
  return ko?'처음 눈길을 끈 특징을 다시 보여주며 다음 행동 하나를 제안한다. 마실 음료라면 잔을 시청자 쪽으로 살짝 밀어 한 모금을 권한다.':'Return to the feature from the opening and visually invite one next action. For a ready-to-drink beverage, slide the glass toward the viewer as an invitation to try it.';
}
