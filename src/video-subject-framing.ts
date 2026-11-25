import {excludesOnscreenPeople} from './video-product-direction.ts';

type Brief = {style?: string; title?: string; description?: string; highlight?: string; emphasis?: string};

export function framingRule(brief: Brief, language: 'ko'|'en') {
  if (brief.style === 'presenter' && !excludesOnscreenPeople(brief)) return '';
  return language === 'ko'
    ? '첫 장면부터 끝까지 제품·도구·작업 결과만 촬영한다. 인물·캐릭터·손·반사된 얼굴은 화면 밖에 둔다. 준비와 전달은 물체의 움직임과 완료 상태로 보여준다.'
    : 'Subject-only framing throughout: keep all people, characters, faces, hands, silhouettes and human reflections outside the frame. Show the preparation or delivery through the tools, moving materials and finished result. A person mentioned in the setting can operate off screen.';
}

const pourShots = {
  ko: [
    '투명한 잔을 옆에서 잡아 윗테두리까지 보여준다. 흰 우유와 얼음을 함께 담은 높이는 잔의 약 2/3다. 위쪽 1/3은 비어 있고, 우유에 잠긴 얼음의 윗모서리만 살짝 보인다. 가느다란 에스프레소 줄기가 그 모서리에 닿자 같은 얼음이 살짝 기울고 수면에 작은 파문이 생긴다.',
    '같은 잔을 끊지 않고 따라간다. 갈색 줄기가 흔들린 얼음의 양옆을 타고 내려가 얼음 아래에서 두 갈래의 갈색 무늬로 퍼진다. 붓는 양만큼 수면이 서서히 올라가고 경계가 우유 속에서 흐려지면서 연갈색으로 섞인다.',
    '수면이 윗테두리에 닿기 전에 붓기를 멈춘다. 수면 위로 빈 공간이 남고 파문이 잦아든다. 마지막 프레임까지 잔 안에서 섞이는 색과 같은 얼음을 담는다.',
  ],
  en: [
    'Start with ice and white milk only. Frame the glass side-on with the rim visible. With the ice already in place, the still-white milk reaches about two thirds of the internal height. Leave the upper third visibly empty. Milk surrounds the cubes with only their upper edges exposed. A thin espresso stream strikes one exposed edge; that cube rocks slightly and a small ripple crosses the milk.',
    'In the same shot follow the coffee down both sides of that moving cube. Directly below it two brown trails spread into the surrounding milk, their edges diffusing into light brown. Let the level rise gradually with the pour. Exclude a clear water base, a floating white film, an oil slick or a rigid sheet over the ice.',
    'Stop the pour below the rim with a visible gap remaining. Let the cube settle and the ripples fade. Keep the same glass and ice visible as the color blends through the final frame.',
  ],
} as const;

export function lattePreparation(brief: Brief, language: 'ko'|'en') {
  if (brief.style === 'unboxing') return;
  const name = brief.title ?? '';
  const action = [brief.description, brief.highlight ?? brief.emphasis].filter(Boolean).join('\n');
  const facts = name+' '+action;
  if (!/아이스\s*(?:카페\s*)?라[떼테]|\biced\s+(?:caf[f]?[eéè]\s+)?latte\b/i.test(facts)) return;
  if (/말차|녹차|초코|딸기|고구마|밀봉|병입|캔커피|matcha|chocolate|strawberry|sealed|bottled|canned/i.test(name)) return;
  if (!/우유|\bmilk\b/i.test(action) || !/에스프레소|커피\s*(?:줄기|한\s*줄기)|espresso|coffee stream/i.test(action)) return;
  if (!/붓|부어|부으|부을|부면|줄기|흘러|닿|떨어|pour|stream|strike|touch/i.test(action)) return;
  return pourShots[language];
}
