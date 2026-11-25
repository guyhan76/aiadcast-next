type FormatBrief = {kind: string; style?: string};
type Beats = readonly [string, string, string];

const formats = {
  product: {
    ko: ['상품 광고 · 상품의 윤곽이나 기능이 가장 잘 드러나는 각도에서 시작한다. 첫 동작에 빛이나 초점이 바뀌며 강조한 특징이 0.8초 안에 눈에 들어온다.', '같은 특징을 쓰임새가 보이는 거리에서 보여준 뒤 질감이나 구조 한 곳에 초점을 옮긴다.', '구도를 넓혀 처음 본 디테일이 상품 전체의 어디에 있는지 보여준다. 지정한 마지막 모습에서 멈춘다.'],
    en: ['Product ad: use a deliberate hero angle. Begin mid-action and reveal the highlighted feature through a motivated change of light, focus or silhouette by 0.8 seconds.', 'Match that motion into a functional demonstration, then isolate one visible material or construction detail.', 'Widen to locate that same detail in the complete product. Hold the specified final state.'],
  },
  unboxing: {
    ko: ['언박싱 · 첫 사진의 닫힌 포장 틈이 벌어지는 순간부터 시작한다. 0.8초 안에 내용물의 색이나 윤곽 일부가 처음 보인다.', '같은 쪽에서 개봉을 따라가며 두 번째 참조 사진과 같은 배치로 제품이 드러나는 순간을 잡는다.', '막 드러난 상품의 강조할 특징에 초점을 맞춘 뒤 확인된 구성품만 한눈에 보이게 한다.'],
    en: ['Unboxing: start tight on the seam of the supplied closed package already parting. Within 0.8 seconds reveal a sliver of the actual contents while retaining suspense.', 'Follow the opening from the same side and focus through the gap into the arrangement in the next reference.', 'Resolve the reveal on the specified product detail and show only the documented contents.'],
  },
  productUgc: {
    ko: ['상품 UGC · 사용자의 휴대폰 시점에서 실제 사용 동작 한가운데로 들어간다. 0.8초 안에 그 동작으로 달라지는 제품 디테일을 보여준다.', '사용자가 보는 거리에서 같은 기능을 한 번 끝까지 시연한다. 움직임을 따라 초점이 자연스럽게 가까워진다.', '방금 사용한 상태를 가까이 보여주며 결과를 확인한다. 실제로 보이는 변화만 담는다.'],
    en: ['Product UGC: adopt the user’s phone-camera viewpoint mid-use. Let one real operation reveal a specific change in the item by 0.8 seconds.', 'Follow the same use through once at arm’s length with natural focus correction and an unobstructed view of the feature.', 'Stay with the just-used item so the viewer can inspect the observable result. No invented testimonial.'],
  },
  service: {
    ko: ['서비스 소개 · 현장에서 서비스의 핵심 단계가 시작되는 순간을 가까이 잡는다. 0.8초 안에 작업 대상에 생기는 첫 변화가 보인다.', '제공자 쪽에서 같은 작업을 따라가다가 시야를 넓혀 공간과 제공 과정을 연결한다.', '상세설명에 나온 제공 결과가 고객에게 닿는 순간 또는 지정한 완료 상태를 보여준다.'],
    en: ['Service introduction: film from the provider’s side. Start on the decisive service operation at its point of contact; show its first visible change within 0.8 seconds.', 'Track one real step in the process, then widen to connect the work to the supplied setting and recipient.', 'Resolve on delivery of the described service or the specified completed state. Demonstrate the process when outcomes are unverified.'],
  },
  serviceUgc: {
    ko: ['서비스 UGC · 고객의 눈높이에서 시작한다. 인사나 매장 전경을 건너뛰고 0.8초 안에 고객 앞에서 일어나는 가장 눈에 띄는 변화를 잡는다.', '고객의 시선이 움직이는 방향으로 한 단계를 따라간다. 현장에서 기다리거나 관찰하거나 참여하는 동작은 설명에 있을 때 담는다.', '같은 고객 시점에서 직접 볼 수 있는 제공 결과나 지정된 마지막 순간을 담는다. 감상평은 지어내지 않는다.'],
    en: ['Service UGC: start from the customer’s eye line, already inside the experience. Within 0.8 seconds catch the most striking visible change from where the customer is.', 'Let the customer’s gaze drive a handheld reframing. Show participation, waiting or observation only when supported by the service description.', 'End on what the customer can actually see or receive from that same viewpoint. Never invent praise, speech or results.'],
  },
} satisfies Record<string, Record<'ko' | 'en', Beats>>;

export function formatBeats(brief: FormatBrief, language: 'ko' | 'en'): Beats {
  if (brief.kind === 'service') return formats[brief.style === 'presenter' ? 'serviceUgc' : 'service'][language];
  if (brief.style === 'unboxing') return formats.unboxing[language];
  return formats[brief.style === 'presenter' ? 'productUgc' : 'product'][language];
}
