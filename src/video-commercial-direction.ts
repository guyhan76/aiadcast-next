type Brief = {kind?:string; style?:string; title?:string; description?:string; highlight?:string; emphasis?:string};

export function commercialDirection(brief:Brief) {
  const common = 'Storyboard each interval with a start state, a single principal action and an observable end state. Carry item count, bite marks, prop identity and position into the next cut. A change of angle cannot replay the same event. Follow an explicitly requested continuous action without restarting it.';
  return common + (brief.style === 'presenter'
    ? ' UGC: build a real reason for the next action. Let the audience see it before anyone speaks. Use short conversational lines that remain true if motion is subtle. Base the closing decision on what the people need right now. Keep background props still. Prefer actual room tone. Omit synthetic chewing, exaggerated crunch and speculative sound effects.'
    : ' TV commercial: make the featured item readable on mute in the first second. Show the benefit through a distinct physical result in the middle. Resolve on the actual product and one supported invitation. Choose sound only for contact visible on screen.');
}

export function excludesPour(brief:Brief) {
  return /(?:붓기|붓는|부어\s*넣는|따르기|따르는|따라\s*붓는)[^.!?\n]{0,18}(?:금지|제외|없이|쓰지|넣지|없게|없어|없다|0\s*회)|(?:no|without|avoid|never)\s+(?:any\s+)?pour(?:ing|s)?\b/i.test([brief.description,brief.highlight,brief.emphasis].join(' '));
}

export function finishedLatte(brief:Brief, lang:'ko'|'en'):readonly [string,string,string]|undefined {
  if (brief.style !== 'product' || !/아이스\s*(?:카페\s*)?라[떼테]|iced\s+(?:caf[eé]\s+)?latte/i.test(brief.title??'') ||
      /말차|녹차|딸기|초코|병입|캔\s*라떼|matcha|bottled|canned/i.test(brief.title??'')) return;
  return lang==='ko'
    ? ['완성된 잔에서 각진 얼음이 돌아서는 순간을 크게 잡는다. 얼음 면에 커피층이 굴절된다.','충돌로 생긴 물결이 잔 안쪽의 커피와 우유 경계로 번진다. 앞 동작을 다시 시작하지 않는다.','같은 잔의 결로에서 실제 제품 전체로 초점을 옮긴다. 요청된 마지막 행동과 상태를 유지한다.']
    : ['Start on a rotating ice facet refracting the coffee in the finished glass.','Follow the resulting ripple into the boundary between coffee and milk.','Shift focus from condensation to the same finished glass. Land on the requested final state.'];
}
