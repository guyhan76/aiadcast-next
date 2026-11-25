import {useUiLanguage} from './ui-language';
import type {VideoBrief} from './video-brief';

export function VideoBriefFields({value,disabled,change}:{value:VideoBrief;disabled:boolean;change:(v:VideoBrief)=>void}){
  const {t}=useUiLanguage();
  const service=value.kind==='service';
  const description = service
    ? [
        t('오후 햇살이 비치는 동네 카페에서 주문 즉시 아이스 카페라떼를 만들어요.', 'At a sunlit neighborhood café, the barista makes each iced latte to order.'),
        t('원목 바 위 투명한 잔에 얼음과 흰 우유를 담고, 갓 추출한 에스프레소를 부어요.', 'At the wooden counter, the barista fills a clear glass with ice and milk, then pours in freshly pulled espresso.'),
        t('창가에 앉은 손님 앞에 바리스타가 직접 잔을 내려놓아요.', 'The barista brings the glass to the customer seated by the window.')
      ].join('\n')
    : [
        t('첫눈 내리는 아침, 버스 정류장의 노란 불빛 아래 선 직장인이에요.', 'On a snowy morning, a commuter waits under the amber light of a bus stop.'),
        t('검은색 롱패딩은 후드부터 무릎까지 이어지고, 양옆에는 지퍼 주머니가 있어요.', 'The black puffer coat has a hood, a knee-length hem and zip pockets on both sides.'),
        t('버스가 들어오자 한 손으로 후드를 털고, 다른 손으로 교통카드를 꺼내요.', 'As the bus pulls in, the commuter shakes the hood with one hand and takes out a transit card with the other.')
      ].join('\n');
  const highlight = service
    ? [
        t('첫 1초, 짙은 커피 한 줄기가 흰 우유를 뚫고 내려가는 순간을 바짝 당겨주세요.', 'In the first second, move in close as a dark ribbon of espresso cuts through the white milk.'),
        t('잔 뒤로 햇빛이 들게 해서 얼음 사이로 갈색 무늬가 피어나는 결을 보여주세요.', 'Backlight the glass so the curls of espresso stand out as they bloom between the ice cubes.'),
        t('마지막엔 바리스타가 놓은 잔을 손님이 받아 드는 동작까지 자연스럽게 이어주세요.', 'Finish the handoff: the barista sets the drink down and the customer picks it up.')
      ].join('\n')
    : [
        t('첫 1초, 검은 후드를 툭 터는 순간 하얀 눈가루가 렌즈 앞으로 튀게 해주세요.', 'In the first second, a flick of the black hood sends white powder toward the lens.'),
        t('눈가루 뒤로 주머니 지퍼를 여는 손과 카드 끝이 차례로 보이면 좋겠어요.', 'As the powder clears, bring the hand opening the pocket into focus, then the corner of the card.'),
        t('버스로 성큼 다가갈 때는 무릎 옆에서 흔들리는 밑단까지 한 화면에 담아주세요.', 'As the commuter strides toward the bus, keep the swinging hem and the knees in the same shot.')
      ].join('\n');
  const shots = service
    ? [
        t('아직 섞이지 않은 흰 우유로 화면을 채워요. 첫 방울이 닿자마자 짙은 갈색 줄기가 아래로 뻗는 모습을 잔 높이에서 잡고, 얼음이 유리에 부딪히는 맑은 소리를 살려주세요.', 'Fill the frame with unmixed white milk. At glass level, catch the dark streak shooting down on contact, with the clear clink of ice against glass.'),
        t('붓는 손에서 잔 안쪽으로 초점을 옮겨요. 햇빛을 받은 얼음 뒤로 커피가 얇은 리본처럼 접혀 들어가는 동안은 젓거나 다른 장면으로 자르지 말아주세요.', 'Shift focus from the pouring hand to the glass. Hold the shot without stirring as the espresso folds like a ribbon behind the sunlit ice.'),
        t('시야를 넓혀 바리스타가 같은 잔을 창가 테이블에 놓는 모습으로 이어요. 손님이 잔을 들면 물방울 맺힌 유리 너머로 오후 햇살이 반짝이는 순간에 끝내주세요.', 'Pull back as the barista sets the same glass on the window table. End as the customer lifts it and afternoon light shines through the condensation.')
      ]
    : [
        t('후드의 검은 천이 화면을 가득 채운 상태에서 시작해요. 손끝으로 후드를 털자 역광을 받은 눈가루가 하얗게 번쩍이고, 그 사이로 버스 전조등이 드러나요.', 'Fill the frame with the black hood. Fingers flick the fabric and backlit snow flashes white. Bus headlights appear through the powder.'),
        t('버스가 멈추는 소리에 맞춰 옆주머니로 시선을 옮겨요. 장갑 낀 손이 지퍼를 열고 카드를 꺼내는 동작을 한 컷에 담아 주머니의 위치와 쓰임이 보이게 해주세요.', 'As the bus brakes, cut to the side pocket. Keep the gloved hand in one shot as it unzips the pocket and lifts out the card, showing where the pocket sits and how it is used.'),
        t('모델이 버스 쪽으로 두 걸음 걷는 옆모습을 따라가요. 마지막은 정류장의 밝은 유리벽을 배경으로 후드부터 무릎 아래까지 담아 검은 패딩의 윤곽을 또렷하게 남겨주세요.', 'Track the commuter from the side for two steps toward the bus. End against the lit glass shelter, framing from the hood to below the knees so the coat’s outline reads clearly.')
      ];
  const stages = [t('첫 1초', 'First second'), t('중간 장면', 'Middle shot'), t('마지막 장면', 'Closing shot')];
  const example=t('예) ', 'e.g. ');
  return <fieldset className="vd-brief" disabled={disabled}>
    <label>{service?t('서비스명','Service name'):t('상품명','Product name')}
      <input maxLength={100} value={value.title} onChange={e=>change({...value,title:e.target.value})}/></label>
    <label>{t('상세설명','Description')}
      <textarea rows={6} maxLength={2000} value={value.description} placeholder={example+description}
        onChange={e=>change({...value,description:e.target.value})}/></label>
    <label>{t('강조할 점 (선택)','Highlight (optional)')}
      <textarea rows={6} maxLength={600} value={value.emphasis} placeholder={example+highlight}
        onChange={e=>change({...value,emphasis:e.target.value})}/></label>
    <details className="input-example-guide">
      <summary>{t('더 좋은 결과를 위한 예시 가이드','Example guide for better results')}</summary>
      <div className="input-example-content">
        {shots.map((shot,i)=><p key={stages[i]}><strong>{stages[i]}</strong><br/>{shot}</p>)}
      </div>
    </details>
  </fieldset>;
}
